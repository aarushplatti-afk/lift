import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { getRestTimer, setOwner, setRestTimer } from '../repos/meta';
import {
  deleteWorkout,
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
  updateCompletedWorkout,
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

  it('re-flags a later completed workout when finishing one that started earlier', async () => {
    const late = wk('late', Date.now() + 1_000_000, 'completed', [block('a', 110, 5)]);
    const lateSet = late.exercises[0]?.sets[0];
    if (!lateSet) throw new Error('fixture');
    lateSet.isPR = true;
    await db.workouts.bulkPut([wk('old', 1, 'completed', [block('a', 100, 5)]), late]);
    const w = await startWorkout({ exercises: [block('a', 120, 5)] });
    const out = await finishWorkout(w, { markIncomplete: false });
    if (out.status !== 'finished') throw new Error('expected finished');
    expect(out.workout.exercises[0]?.sets[0]?.isPR).toBe(true);
    const stored = await db.workouts.get('late');
    expect(stored?.exercises[0]?.sets[0]?.isPR).toBeUndefined();
    expect(stored?.updatedAt).toBeGreaterThan(1);
    const q = await db.syncQueue.toArray();
    expect(q.map((e) => e.recordId).sort()).toEqual(['late', w.id].sort());
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

  it('breaks startedAt ties by id desc', async () => {
    await db.workouts.bulkPut([
      wk('a', 10, 'completed'),
      wk('c', 10, 'completed'),
      wk('b', 10, 'completed'),
    ]);
    expect((await listCompletedWorkouts()).map((w) => w.id)).toEqual(['c', 'b', 'a']);
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

const DAY = 86_400_000;
const T0 = Date.now() - 100 * DAY;

function done(id: string, day: number, weightKg: number): Workout {
  const startedAt = T0 + day * DAY;
  return {
    ...wk(id, startedAt, 'completed', [block('a', weightKg, 5)]),
    endedAt: startedAt + 3_600_000,
  };
}

const prOf = (w: Workout | undefined): boolean | undefined => w?.exercises[0]?.sets[0]?.isPR;

async function seedHistory(): Promise<void> {
  await db.exercises.put(ex('a'));
  const w2 = done('w2', 2, 110);
  const set = w2.exercises[0]?.sets[0];
  if (!set) throw new Error('fixture');
  set.isPR = true;
  await db.workouts.bulkPut([done('w1', 1, 100), w2, done('w3', 3, 105)]);
}

async function edited(id: string, weightKg: number): Promise<Workout> {
  const row = await db.workouts.get(id);
  if (!row) throw new Error('fixture');
  return { ...row, exercises: [block('a', weightKg, 5)] };
}

describe('updateCompletedWorkout', () => {
  beforeEach(seedHistory);

  it('lowering a PR writes both changed rows and enqueues both', async () => {
    const out = await updateCompletedWorkout(await edited('w2', 95), { markIncomplete: false });
    expect(out.status).toBe('saved');
    expect(prOf(await db.workouts.get('w2'))).toBeUndefined();
    const w3 = await db.workouts.get('w3');
    expect(prOf(w3)).toBe(true);
    expect(w3?.updatedAt).toBeGreaterThan(1);
    const q = await db.syncQueue.toArray();
    expect(q.map((e) => e.recordId).sort()).toEqual(['w2', 'w3']);
    expect(q.every((e) => e.op === 'upsert')).toBe(true);
    expect(prOf(await db.workouts.get('w1'))).toBeUndefined();
    if (out.status === 'saved') expect(out.workout).toEqual(await db.workouts.get('w2'));
  });

  it('a no-op save writes nothing', async () => {
    const stored = await db.workouts.get('w2');
    if (!stored) throw new Error('fixture');
    const out = await updateCompletedWorkout(structuredClone(stored), { markIncomplete: false });
    expect(out).toEqual({ status: 'saved', workout: stored });
    expect(await db.syncQueue.count()).toBe(0);
    expect(await db.workouts.get('w2')).toEqual(stored);
  });

  it('returns not_found for a missing or in-progress row and writes nothing', async () => {
    const w = await edited('w2', 95);
    const missing = await updateCompletedWorkout({ ...w, id: 'ghost' }, { markIncomplete: false });
    expect(missing).toEqual({ status: 'not_found' });
    const ip = wk('ip', 5, 'in_progress', [block('a', 50, 5)]);
    await db.workouts.put(ip);
    const out = await updateCompletedWorkout({ ...ip, endedAt: 9 }, { markIncomplete: false });
    expect(out).toEqual({ status: 'not_found' });
    expect(await db.syncQueue.count()).toBe(0);
    expect(await db.workouts.get('ip')).toEqual(ip);
  });

  it('returns invalid before writing', async () => {
    const w = await edited('w2', 95);
    const blank = await updateCompletedWorkout({ ...w, name: '   ' }, { markIncomplete: false });
    expect(blank).toEqual({ status: 'invalid', error: { field: 'name', code: 'required' } });
    const future = await updateCompletedWorkout(
      { ...w, startedAt: Date.now() + DAY, endedAt: Date.now() + 2 * DAY },
      { markIncomplete: false },
    );
    expect(future).toEqual({ status: 'invalid', error: { field: 'startedAt', code: 'future' } });
    expect(await db.syncQueue.count()).toBe(0);
    expect(prOf(await db.workouts.get('w2'))).toBe(true);
  });

  it('returns empty and writes nothing when nothing is left', async () => {
    const w = await edited('w2', 95);
    const cleared = { ...w, exercises: [block('a', 95, 5, false)] };
    expect(await updateCompletedWorkout(cleared, { markIncomplete: false })).toEqual({
      status: 'empty',
    });
    expect(await db.syncQueue.count()).toBe(0);
    expect(prOf(await db.workouts.get('w2'))).toBe(true);
  });

  it('preserves identity fields from the stored row', async () => {
    await db.workouts.put({ ...done('w2', 2, 110), templateId: 't9', createdAt: 77 });
    const w = await edited('w2', 95);
    const forged: Workout = {
      ...w,
      userId: 'evil',
      createdAt: 5,
      status: 'in_progress',
      templateId: 'forged',
    };
    const out = await updateCompletedWorkout(forged, { markIncomplete: false });
    if (out.status !== 'saved') throw new Error('expected saved');
    expect(out.workout).toMatchObject({
      userId: 'u1',
      createdAt: 77,
      status: 'completed',
      templateId: 't9',
    });
  });

  it('a draft cannot drop or add a templateId', async () => {
    await db.workouts.put({ ...done('w2', 2, 110), templateId: 't9' });
    const w = await edited('w2', 95);
    const dropped: Workout = { ...w };
    delete dropped.templateId;
    await updateCompletedWorkout(dropped, { markIncomplete: false });
    expect((await db.workouts.get('w2'))?.templateId).toBe('t9');
    const none = await edited('w3', 90);
    await updateCompletedWorkout({ ...none, templateId: 'x' }, { markIncomplete: false });
    expect(await db.workouts.get('w3')).not.toHaveProperty('templateId');
  });

  it('markIncomplete true keeps valid incomplete sets, false drops them', async () => {
    const w = await edited('w3', 105);
    const withExtra: Workout = {
      ...w,
      exercises: [...w.exercises, { ...block('a', 50, 5, false), id: 'we-x', order: 1 }],
    };
    const dropped = await updateCompletedWorkout(withExtra, { markIncomplete: false });
    if (dropped.status !== 'saved') throw new Error('expected saved');
    expect(dropped.workout.exercises).toHaveLength(1);
    const kept = await updateCompletedWorkout(withExtra, { markIncomplete: true });
    if (kept.status !== 'saved') throw new Error('expected saved');
    expect(kept.workout.exercises).toHaveLength(2);
    expect(kept.workout.exercises[1]?.sets[0]?.completed).toBe(true);
  });

  it('removing an exercise from W2 gives W3 its PR back', async () => {
    const w = await edited('w2', 110);
    const out = await updateCompletedWorkout(
      { ...w, exercises: [block('b', 50, 5)] },
      { markIncomplete: false },
    );
    expect(out.status).toBe('saved');
    expect(prOf(await db.workouts.get('w3'))).toBe(true);
    expect((await db.syncQueue.toArray()).map((e) => e.recordId).sort()).toEqual(['w2', 'w3']);
  });

  it('a date change reorders the list and re-flags', async () => {
    const w = await edited('w2', 110);
    const startedAt = T0 + 4 * DAY;
    await updateCompletedWorkout(
      { ...w, startedAt, endedAt: startedAt + 3_600_000 },
      { markIncomplete: false },
    );
    expect((await listCompletedWorkouts()).map((x) => x.id)).toEqual(['w2', 'w3', 'w1']);
    expect(prOf(await db.workouts.get('w2'))).toBe(true);
    expect(prOf(await db.workouts.get('w3'))).toBe(true);
  });
});

describe('deleteWorkout', () => {
  beforeEach(seedHistory);

  it('removes the row, enqueues one delete, and gives the later workout its PR', async () => {
    await deleteWorkout('w2');
    expect(await db.workouts.get('w2')).toBeUndefined();
    expect(prOf(await db.workouts.get('w3'))).toBe(true);
    const q = await db.syncQueue.toArray();
    expect(q.map((e) => `${e.recordId}:${e.op}`).sort()).toEqual(['w2:delete', 'w3:upsert']);
  });

  it('deleting a non-PR workout writes only the tombstone', async () => {
    await deleteWorkout('w3');
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ recordId: 'w3', op: 'delete' });
  });

  it('is a no-op for a missing id', async () => {
    await deleteWorkout('ghost');
    expect(await db.syncQueue.count()).toBe(0);
    expect(await db.workouts.count()).toBe(3);
  });

  it('throws for an in-progress workout and leaves the active row and meta alone', async () => {
    const active = await startWorkout({ exercises: [block('a', 50, 5)] });
    await expect(deleteWorkout(active.id)).rejects.toThrow(
      'Use discardWorkout for in-progress workouts',
    );
    expect(await db.workouts.get(active.id)).toEqual(active);
    expect((await db.meta.get('activeWorkoutId'))?.value).toBe(active.id);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('keeps meta untouched when deleting a completed workout during an active one', async () => {
    const active = await startWorkout();
    await deleteWorkout('w2');
    expect((await db.meta.get('activeWorkoutId'))?.value).toBe(active.id);
    expect(await db.workouts.get(active.id)).toEqual(active);
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
