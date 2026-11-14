import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { setOwner } from '../../db/repos/meta';
import { useToastStore } from '../../components/ui/toastStore';
import { initActiveWorkoutStore, isWorkoutActive, useActiveWorkoutStore } from '../activeWorkout';
import type { Exercise, WorkoutExercise } from '../../types/domain';

const store = () => useActiveWorkoutStore.getState();

const ex = (id: string): Exercise => ({
  userId: 'u1',
  updatedAt: 1,
  id,
  name: id,
  muscleGroup: 'chest',
  equipment: 'barbell',
  type: 'weight_reps',
  isCustom: false,
  archived: false,
  createdAt: 1,
});

const block = (weight?: number, reps?: number): WorkoutExercise => ({
  id: 'we1',
  exerciseId: 'a',
  order: 0,
  sets: [
    {
      id: 's1',
      order: 0,
      type: 'normal',
      completed: false,
      ...(weight !== undefined ? { weightKg: weight } : {}),
      ...(reps !== undefined ? { reps } : {}),
    },
  ],
});

async function queueCount(): Promise<number> {
  return db.syncQueue.count();
}

function countUpdates(): { count: () => number; stop: () => void } {
  let n = 0;
  const hook = () => {
    n += 1;
  };
  db.workouts.hook('updating', hook);
  return {
    count: () => n,
    stop: () => db.workouts.hook('updating').unsubscribe(hook),
  };
}

function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
  await db.exercises.put(ex('a'));
  useToastStore.setState({ toast: null });
  useActiveWorkoutStore.setState({ status: 'idle', workout: null, saveError: false });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await store().flush();
  await store().discard();
  setVisibility('visible');
  vi.useRealTimers();
});

describe('active workout store', () => {
  it('start puts the workout in the store, saves nothing extra, and schedules an enqueue', async () => {
    const w = await store().start({ exercises: [block()] });
    expect(store().workout).toEqual(w);
    expect(await queueCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(async () => expect(await queueCount()).toBe(1));
  });

  it('10 updates within 300 ms produce 1 save', async () => {
    const w = await store().start({ exercises: [block()] });
    const updates = countUpdates();
    for (let i = 1; i <= 10; i += 1) {
      store().updateSet('we1', 's1', { reps: i });
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(updates.count()).toBe(0);
    await vi.advanceTimersByTimeAsync(300);
    await vi.waitFor(() => expect(updates.count()).toBe(1));
    expect((await db.workouts.get(w.id))?.exercises[0]?.sets[0]?.reps).toBe(10);
    updates.stop();
  });

  it('edits over 6 s produce exactly one outbox entry at 5 s with no timer reset', async () => {
    await store().start({ exercises: [block()] });
    for (let i = 1; i <= 4; i += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      store().updateSet('we1', 's1', { reps: i });
    }
    await vi.advanceTimersByTimeAsync(900);
    expect(await queueCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(200);
    await vi.waitFor(async () => expect(await queueCount()).toBe(1));
    await vi.advanceTimersByTimeAsync(900);
    store().updateSet('we1', 's1', { reps: 9 });
    await vi.advanceTimersByTimeAsync(900);
    expect(await queueCount()).toBe(1);
    const entry = await db.syncQueue.toCollection().first();
    expect(entry?.op).toBe('upsert');
  });

  it('a hidden event flushes immediately; visible does not', async () => {
    const stop = initActiveWorkoutStore();
    await vi.waitFor(() => expect(store().status).toBe('ready'));
    const w = await store().start({ exercises: [block()] });
    store().updateSet('we1', 's1', { reps: 7 });
    setVisibility('visible');
    expect(await queueCount()).toBe(0);
    setVisibility('hidden');
    await vi.waitFor(async () => expect(await queueCount()).toBe(1));
    expect((await db.workouts.get(w.id))?.exercises[0]?.sets[0]?.reps).toBe(7);
    stop();
  });

  it('pagehide flushes immediately', async () => {
    const stop = initActiveWorkoutStore();
    await vi.waitFor(() => expect(store().status).toBe('ready'));
    const w = await store().start({ exercises: [block()] });
    store().updateSet('we1', 's1', { reps: 3 });
    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(async () => expect(await queueCount()).toBe(1));
    expect((await db.workouts.get(w.id))?.exercises[0]?.sets[0]?.reps).toBe(3);
    stop();
  });

  it('flush saves then enqueues once, and only when something changed', async () => {
    const w = await store().start({ exercises: [block()] });
    store().updateSet('we1', 's1', { reps: 4 });
    await store().flush();
    expect((await db.workouts.get(w.id))?.exercises[0]?.sets[0]?.reps).toBe(4);
    expect(await queueCount()).toBe(1);
    await store().flush();
    expect(await queueCount()).toBe(1);
  });

  it('finish cancels the timers and nothing is written afterwards', async () => {
    const w = await store().start({ exercises: [block(100, 5)] });
    store().toggleComplete('we1', 's1', 'weight_reps');
    const out = await store().finish({ markIncomplete: false });
    expect(out.status).toBe('finished');
    expect(store().workout).toBeNull();
    const row = await db.workouts.get(w.id);
    expect(row?.status).toBe('completed');
    const entries = await queueCount();
    const updates = countUpdates();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await queueCount()).toBe(entries);
    expect(updates.count()).toBe(0);
    expect(await db.workouts.get(w.id)).toEqual(row);
    updates.stop();
  });

  it('finish with nothing to save returns empty and keeps the workout', async () => {
    await store().start({ exercises: [block()] });
    const out = await store().finish({ markIncomplete: false });
    expect(out).toEqual({ status: 'empty' });
    expect(store().workout).not.toBeNull();
  });

  it('discard cancels timers, deletes the row, and writes nothing afterwards', async () => {
    const w = await store().start({ exercises: [block()] });
    store().updateSet('we1', 's1', { reps: 2 });
    await store().discard();
    expect(store().workout).toBeNull();
    expect(await db.workouts.get(w.id)).toBeUndefined();
    const q = await db.syncQueue.toArray();
    expect(q.map((e) => e.op)).toEqual(['delete']);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await db.workouts.get(w.id)).toBeUndefined();
    expect(await queueCount()).toBe(1);
  });

  it('an invalid toggle returns the failing field and leaves state unchanged', async () => {
    await store().start({ exercises: [block(undefined, 5)] });
    const before = store().workout;
    expect(store().toggleComplete('we1', 's1', 'weight_reps')).toEqual({
      ok: false,
      field: 'weight',
    });
    expect(store().workout).toBe(before);
    store().updateSet('we1', 's1', { weightKg: 100 });
    expect(store().toggleComplete('we1', 's1', 'weight_reps')).toEqual({
      ok: true,
      completed: true,
    });
    expect(store().workout?.exercises[0]?.sets[0]?.completedAt).toBeDefined();
    expect(store().toggleComplete('we1', 's1', 'weight_reps')).toEqual({
      ok: true,
      completed: false,
    });
    expect(store().workout?.exercises[0]?.sets[0]?.completedAt).toBeUndefined();
  });

  it('addSet prefills from the previous set', async () => {
    await store().start({ exercises: [block(60, 8)] });
    store().addSet('we1');
    const sets = store().workout?.exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(2);
    expect(sets[1]).toMatchObject({ weightKg: 60, reps: 8, completed: false, order: 1 });
  });

  it('removing a set then Undo restores it at the same position', async () => {
    await store().start({ exercises: [block(60, 8)] });
    store().addSet('we1');
    store().addSet('we1');
    const ids = store().workout?.exercises[0]?.sets.map((s) => s.id) ?? [];
    store().removeSet('we1', ids[1] ?? '');
    expect(store().workout?.exercises[0]?.sets).toHaveLength(2);
    const toast = useToastStore.getState().toast;
    expect(toast).toMatchObject({ message: 'Set deleted', actionLabel: 'Undo' });
    toast?.onAction?.();
    expect(store().workout?.exercises[0]?.sets.map((s) => s.id)).toEqual(ids);
  });

  it('removing an exercise then Undo restores it at the same position', async () => {
    await store().start({ exercises: [block()] });
    store().addExercises(['a', 'a']);
    const ids = store().workout?.exercises.map((e) => e.id) ?? [];
    store().removeExercise(ids[1] ?? '', 'Bench');
    expect(store().workout?.exercises).toHaveLength(2);
    const toast = useToastStore.getState().toast;
    expect(toast?.message).toBe('Removed Bench');
    toast?.onAction?.();
    expect(store().workout?.exercises.map((e) => e.id)).toEqual(ids);
  });

  it('no-op mutations do not schedule writes', async () => {
    await store().start({ exercises: [block()] });
    await store().flush();
    const entries = await queueCount();
    store().rename('   ');
    store().moveExercise('we1', -1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await queueCount()).toBe(entries);
  });

  it('an external meta change triggers a re-hydrate', async () => {
    const stop = initActiveWorkoutStore();
    await vi.waitFor(() => expect(store().status).toBe('ready'));
    expect(store().workout).toBeNull();
    await db.transaction('rw', [db.workouts, db.meta], async () => {
      await db.workouts.put({
        id: 'ext',
        userId: 'u1',
        name: 'External',
        startedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        status: 'in_progress',
        exercises: [],
      });
      await db.meta.put({ key: 'activeWorkoutId', value: 'ext' });
    });
    await vi.waitFor(() => expect(store().workout?.id).toBe('ext'));
    await db.meta.delete('activeWorkoutId');
    await vi.waitFor(() => expect(store().workout).toBeNull());
    stop();
  });

  it('hydrates an existing active workout; loading counts as active', async () => {
    await db.workouts.put({
      id: 'x',
      userId: 'u1',
      name: 'Existing',
      startedAt: 1,
      createdAt: 1,
      updatedAt: 1,
      status: 'in_progress',
      exercises: [],
    });
    await db.meta.put({ key: 'activeWorkoutId', value: 'x' });
    const stop = initActiveWorkoutStore();
    expect(isWorkoutActive(store())).toBe(true);
    expect(store().status).toBe('loading');
    await vi.waitFor(() => expect(store().status).toBe('ready'));
    expect(store().workout?.name).toBe('Existing');
    expect(isWorkoutActive(store())).toBe(true);
    stop();
    expect(store().workout).toBeNull();
    expect(isWorkoutActive(store())).toBe(false);
  });

  it('cleanup flushes pending edits', async () => {
    const stop = initActiveWorkoutStore();
    await vi.waitFor(() => expect(store().status).toBe('ready'));
    const w = await store().start({ exercises: [block()] });
    store().updateSet('we1', 's1', { reps: 6 });
    stop();
    await vi.waitFor(async () => expect(await queueCount()).toBe(1));
    expect((await db.workouts.get(w.id))?.exercises[0]?.sets[0]?.reps).toBe(6);
  });

  it('a save failure sets saveError and shows the toast, then recovers', async () => {
    await store().start({ exercises: [block()] });
    vi.spyOn(db.workouts, 'put').mockRejectedValueOnce(new Error('QuotaExceededError'));
    store().updateSet('we1', 's1', { reps: 1 });
    await vi.advanceTimersByTimeAsync(300);
    await vi.waitFor(() => expect(store().saveError).toBe(true));
    expect(useToastStore.getState().toast?.message).toBe('Couldn’t save. Storage may be full.');
    store().updateSet('we1', 's1', { reps: 2 });
    await vi.advanceTimersByTimeAsync(300);
    await vi.waitFor(() => expect(store().saveError).toBe(false));
  });
});
