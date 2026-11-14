import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { getRestTimer, setOwner, setRestTimer } from '../repos/meta';
import {
  discardWorkout,
  enqueueActiveWorkout,
  finishWorkout,
  getActiveWorkout,
  getLastCompletedWithExercises,
  getWorkout,
  listCompletedWorkouts,
  observeActiveWorkoutId,
  observeOtherInProgress,
  saveActiveWorkout,
  startWorkout,
} from '../repos/workouts';
import type { Exercise, Workout, WorkoutExercise } from '../../types/domain';

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

const block = (id: string, weightKg: number, reps: number, completed = true): WorkoutExercise => ({
  id: `we-${id}-${weightKg}`,
  exerciseId: id,
  order: 0,
  sets: [{ id: `s-${id}-${weightKg}`, order: 0, type: 'normal', weightKg, reps, completed }],
});

const wk = (
  id: string,
  startedAt: number,
  status: Workout['status'],
  exercises: WorkoutExercise[] = [],
): Workout => ({
  userId: 'u1',
  updatedAt: 1,
  id,
  name: id,
  startedAt,
  status,
  exercises,
  createdAt: 1,
});

function firstEmission<T>(
  make: () => { subscribe: (o: { next: (v: T) => void }) => { unsubscribe: () => void } },
): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    let sub: { unsubscribe: () => void } | undefined;
    sub = make().subscribe({
      next: (v) => {
        if (done) return;
        done = true;
        resolve(v);
        sub?.unsubscribe();
        sub = undefined;
      },
    });
  });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
});

describe('startWorkout', () => {
  it('creates an in-progress workout, sets meta, and does not enqueue', async () => {
    const w = await startWorkout({ name: 'Push' });
    expect(w).toMatchObject({ userId: 'u1', name: 'Push', status: 'in_progress', exercises: [] });
    expect(w.startedAt).toBe(w.createdAt);
    expect(w.updatedAt).toBe(w.createdAt);
    expect(await db.workouts.get(w.id)).toEqual(w);
    expect((await db.meta.get('activeWorkoutId'))?.value).toBe(w.id);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('uses a default name and templateId', async () => {
    const w = await startWorkout({ templateId: 't1' });
    expect(w.name).toMatch(/Workout$/);
    expect(w.templateId).toBe('t1');
  });

  it('is idempotent', async () => {
    const a = await startWorkout({ name: 'A' });
    const b = await startWorkout({ name: 'B' });
    expect(b).toEqual(a);
    expect(await db.workouts.count()).toBe(1);
  });

  it('requires a local owner', async () => {
    await db.meta.clear();
    await expect(startWorkout()).rejects.toThrow();
  });
});

describe('getActiveWorkout', () => {
  it('returns the active workout', async () => {
    const w = await startWorkout();
    expect(await getActiveWorkout()).toEqual(w);
  });

  it('returns undefined with no meta', async () => {
    expect(await getActiveWorkout()).toBeUndefined();
  });

  it('self-heals when the row is missing', async () => {
    await db.meta.put({ key: 'activeWorkoutId', value: 'ghost' });
    expect(await getActiveWorkout()).toBeUndefined();
    expect(await db.meta.get('activeWorkoutId')).toBeUndefined();
  });

  it('self-heals when the row is not in progress', async () => {
    await db.workouts.put(wk('done', 1, 'completed'));
    await db.meta.put({ key: 'activeWorkoutId', value: 'done' });
    expect(await getActiveWorkout()).toBeUndefined();
    expect(await db.meta.get('activeWorkoutId')).toBeUndefined();
  });

  it('a new workout can start after self-heal', async () => {
    await db.meta.put({ key: 'activeWorkoutId', value: 'ghost' });
    const w = await startWorkout();
    expect(w.id).not.toBe('ghost');
  });
});

describe('observers', () => {
  it('observeActiveWorkoutId emits the current id', async () => {
    expect(await firstEmission(observeActiveWorkoutId)).toBeUndefined();
    const w = await startWorkout();
    expect(await firstEmission(observeActiveWorkoutId)).toBe(w.id);
  });

  it('observeOtherInProgress excludes the active one, sorted by startedAt desc', async () => {
    const mine = await startWorkout();
    await db.workouts.bulkPut([
      wk('o1', 10, 'in_progress'),
      wk('o2', 30, 'in_progress'),
      wk('c', 20, 'completed'),
    ]);
    const rows = await firstEmission<Workout[]>(observeOtherInProgress);
    expect(rows.map((r) => r.id)).toEqual(['o2', 'o1']);
    expect(rows.some((r) => r.id === mine.id)).toBe(false);
  });
});

describe('saveActiveWorkout / enqueueActiveWorkout', () => {
  it('saves with a fresh updatedAt and no outbox entry', async () => {
    const w = await startWorkout();
    const ok = await saveActiveWorkout({ ...w, name: 'Renamed', updatedAt: 0 });
    expect(ok).toBe(true);
    const row = await db.workouts.get(w.id);
    expect(row?.name).toBe('Renamed');
    expect(row?.updatedAt).toBeGreaterThan(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('enqueues exactly one upsert of the stored row', async () => {
    const w = await startWorkout();
    await saveActiveWorkout({ ...w, name: 'Stored' });
    await enqueueActiveWorkout(w.id);
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ table: 'workouts', recordId: w.id, op: 'upsert' });
    expect((q[0]?.payload as Workout).name).toBe('Stored');
  });

  it('refuses to save a non-active id', async () => {
    const w = await startWorkout();
    expect(await saveActiveWorkout({ ...w, id: 'other' })).toBe(false);
    expect(await db.workouts.get('other')).toBeUndefined();
  });

  it('refuses to save or enqueue after finish', async () => {
    await db.exercises.put(ex('a'));
    const w = await startWorkout({ exercises: [block('a', 100, 5)] });
    await finishWorkout(w, { markIncomplete: false });
    const count = await db.syncQueue.count();
    expect(await saveActiveWorkout({ ...w, name: 'late' })).toBe(false);
    await enqueueActiveWorkout(w.id);
    expect(await db.syncQueue.count()).toBe(count);
    expect((await db.workouts.get(w.id))?.name).not.toBe('late');
  });

  it('refuses to save or enqueue after discard', async () => {
    const w = await startWorkout();
    await discardWorkout(w.id);
    const count = await db.syncQueue.count();
    expect(await saveActiveWorkout(w)).toBe(false);
    await enqueueActiveWorkout(w.id);
    expect(await db.syncQueue.count()).toBe(count);
    expect(await db.workouts.get(w.id)).toBeUndefined();
  });

  it('refuses when the row is no longer in progress', async () => {
    const w = await startWorkout();
    await db.workouts.put({ ...w, status: 'completed' });
    expect(await saveActiveWorkout(w)).toBe(false);
  });
});

describe('finishWorkout', () => {
  beforeEach(async () => {
    await db.exercises.put(ex('a'));
  });

  it('flags a PR against history, clears meta, enqueues once', async () => {
    await db.workouts.put(wk('old', 1, 'completed', [block('a', 100, 5)]));
    const w = await startWorkout({ exercises: [block('a', 110, 5)] });
    const out = await finishWorkout(w, { markIncomplete: false });
    expect(out.status).toBe('finished');
    if (out.status !== 'finished') return;
    expect(out.workout.status).toBe('completed');
    expect(out.workout.endedAt).toBeGreaterThanOrEqual(w.startedAt);
    expect(out.workout.exercises[0]?.sets[0]?.isPR).toBe(true);
    expect(await db.workouts.get(w.id)).toEqual(out.workout);
    expect(await db.meta.get('activeWorkoutId')).toBeUndefined();
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ recordId: w.id, op: 'upsert' });
  });

  it('first-ever logging gets no PR flag', async () => {
    const w = await startWorkout({ exercises: [block('a', 110, 5)] });
    const out = await finishWorkout(w, { markIncomplete: false });
    if (out.status !== 'finished') throw new Error('expected finished');
    expect(out.workout.exercises[0]?.sets[0]?.isPR).toBeUndefined();
  });

  it('drops incomplete sets by default', async () => {
    const w = await startWorkout({
      exercises: [block('a', 100, 5), block('a', 90, 5, false)],
    });
    const out = await finishWorkout(w, { markIncomplete: false });
    if (out.status !== 'finished') throw new Error('expected finished');
    expect(out.workout.exercises).toHaveLength(1);
  });

  it('markIncomplete keeps valid incomplete sets as completed', async () => {
    const w = await startWorkout({ exercises: [block('a', 90, 5, false)] });
    const out = await finishWorkout(w, { markIncomplete: true });
    if (out.status !== 'finished') throw new Error('expected finished');
    expect(out.workout.exercises[0]?.sets[0]?.completed).toBe(true);
  });

  it('returns empty and writes nothing', async () => {
    const w = await startWorkout({ exercises: [block('a', 90, 5, false)] });
    const before = await db.workouts.get(w.id);
    const out = await finishWorkout(w, { markIncomplete: false });
    expect(out).toEqual({ status: 'empty' });
    expect(await db.workouts.get(w.id)).toEqual(before);
    expect(await db.syncQueue.count()).toBe(0);
    expect((await db.meta.get('activeWorkoutId'))?.value).toBe(w.id);
  });

  it('clamps endedAt to startedAt for a future start', async () => {
    const w = await startWorkout({ exercises: [block('a', 90, 5)] });
    const future = { ...w, startedAt: Date.now() + 1_000_000 };
    const out = await finishWorkout(future, { markIncomplete: false });
    if (out.status !== 'finished') throw new Error('expected finished');
    expect(out.workout.endedAt).toBe(future.startedAt);
  });
});

describe('discardWorkout', () => {
  it('deletes the row, enqueues a tombstone, and clears meta', async () => {
    const w = await startWorkout();
    await discardWorkout(w.id);
    expect(await db.workouts.get(w.id)).toBeUndefined();
    expect(await db.meta.get('activeWorkoutId')).toBeUndefined();
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ recordId: w.id, op: 'delete' });
  });

  it('leaves meta alone when discarding another workout', async () => {
    const mine = await startWorkout();
    await db.workouts.put(wk('other', 1, 'in_progress'));
    await discardWorkout('other');
    expect((await db.meta.get('activeWorkoutId'))?.value).toBe(mine.id);
    expect(await db.workouts.get('other')).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(1);
  });
});

describe('listCompletedWorkouts / getWorkout', () => {
  it('filters to completed and sorts by startedAt desc', async () => {
    await db.workouts.bulkPut([
      wk('a', 10, 'completed'),
      wk('b', 30, 'completed'),
      wk('c', 20, 'in_progress'),
      wk('d', 20, 'completed'),
    ]);
    expect((await listCompletedWorkouts()).map((w) => w.id)).toEqual(['b', 'd', 'a']);
  });

  it('is empty with no data', async () => {
    expect(await listCompletedWorkouts()).toEqual([]);
  });

  it('getWorkout returns a row or undefined', async () => {
    await db.workouts.put(wk('a', 1, 'completed'));
    expect((await getWorkout('a'))?.id).toBe('a');
    expect(await getWorkout('zz')).toBeUndefined();
  });
});

describe('getLastCompletedWithExercises', () => {
  it('finds the latest completed workout for each exercise in one pass', async () => {
    await db.workouts.bulkPut([
      wk('old', 100, 'completed', [block('bench', 80, 5), block('squat', 100, 5)]),
      wk('mid', 200, 'completed', [block('bench', 85, 5)]),
      wk('new', 300, 'completed', [block('row', 60, 8)]),
      wk('ip', 400, 'in_progress', [block('bench', 90, 5), block('dead', 90, 5)]),
    ]);
    const map = await getLastCompletedWithExercises(['bench', 'squat', 'row', 'dead'], 1000);
    expect(map.get('bench')?.id).toBe('mid');
    expect(map.get('squat')?.id).toBe('old');
    expect(map.get('row')?.id).toBe('new');
    expect(map.has('dead')).toBe(false);
  });
  it('excludes workouts at or after beforeStartedAt', async () => {
    await db.workouts.bulkPut([
      wk('a', 100, 'completed', [block('bench', 80, 5)]),
      wk('b', 200, 'completed', [block('bench', 85, 5)]),
    ]);
    expect((await getLastCompletedWithExercises(['bench'], 200)).get('bench')?.id).toBe('a');
    expect((await getLastCompletedWithExercises(['bench'], 100)).size).toBe(0);
  });
  it('returns an empty map for no ids', async () => {
    expect((await getLastCompletedWithExercises([], 1000)).size).toBe(0);
  });
});

describe('rest timer meta', () => {
  it('round-trips and deletes the snapshot', async () => {
    expect(await getRestTimer()).toBeUndefined();
    const snap = { workoutId: 'w1', endsAt: 5000, durationSec: 90 };
    await setRestTimer(snap);
    expect(await getRestTimer()).toEqual(snap);
    await setRestTimer(null);
    expect(await getRestTimer()).toBeUndefined();
  });
});
