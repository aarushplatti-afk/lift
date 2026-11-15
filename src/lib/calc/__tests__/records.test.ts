import { describe, expect, it } from 'vitest';
import { exerciseRecords, topSet, trainedExercises } from '../records';
import { mkEx, mkSet, mkWorkout } from './fixtures';

const EX = 'bench';

function bench(
  id: string,
  startedAt: number,
  sets: ReturnType<typeof mkSet>[],
  status = 'completed',
) {
  return mkWorkout(id, [mkEx(`${id}-e`, EX, sets)], {
    startedAt,
    status: status as 'completed' | 'in_progress',
  });
}

describe('exerciseRecords', () => {
  it('returns empty records with no workouts', () => {
    expect(exerciseRecords(EX, [], 'weight_reps')).toEqual({});
  });

  it('computes weight, e1rm and set volume for weight_reps', () => {
    const w = bench('a', 1000, [
      mkSet('s1', { weightKg: 100, reps: 5 }),
      mkSet('s2', { weightKg: 90, reps: 10 }),
    ]);
    const r = exerciseRecords(EX, [w], 'weight_reps');
    expect(r.weight?.value).toBe(100);
    expect(r.weight?.set.id).toBe('s1');
    expect(r.weight?.workoutId).toBe('a');
    expect(r.weight?.startedAt).toBe(1000);
    expect(r.e1rm?.value).toBe(120);
    expect(r.setVolume?.value).toBe(900);
    expect(r.setVolume?.set.id).toBe('s2');
    expect(r.reps).toBeUndefined();
    expect(r.duration).toBeUndefined();
  });

  it('ignores a heavy warm-up and incomplete sets', () => {
    const w = bench('a', 1000, [
      mkSet('w', { type: 'warmup', weightKg: 300, reps: 1 }),
      mkSet('x', { weightKg: 250, reps: 5, completed: false }),
      mkSet('s1', { weightKg: 100, reps: 5 }),
    ]);
    const r = exerciseRecords(EX, [w], 'weight_reps');
    expect(r.weight?.value).toBe(100);
    expect(r.e1rm?.set.id).toBe('s1');
    expect(r.setVolume?.value).toBe(500);
  });

  it('ignores in-progress workouts', () => {
    const w = bench('a', 1000, [mkSet('s1', { weightKg: 100, reps: 5 })], 'in_progress');
    expect(exerciseRecords(EX, [w], 'weight_reps')).toEqual({});
  });

  it('ties go to the earliest workout, regardless of input order', () => {
    const early = bench('b', 1000, [mkSet('e', { weightKg: 100, reps: 5 })]);
    const late = bench('a', 2000, [mkSet('l', { weightKg: 100, reps: 5 })]);
    const r = exerciseRecords(EX, [late, early], 'weight_reps');
    expect(r.weight?.workoutId).toBe('b');
    expect(r.e1rm?.workoutId).toBe('b');
    expect(r.setVolume?.workoutId).toBe('b');
  });

  it('ties inside one workout go to the earliest set; duplicate blocks are combined', () => {
    const w = mkWorkout(
      'a',
      [
        mkEx('e2', EX, [mkSet('later', { weightKg: 100, reps: 5 })], 1),
        mkEx('e1', EX, [mkSet('first', { weightKg: 100, reps: 5 })], 0),
      ],
      { startedAt: 1000 },
    );
    expect(exerciseRecords(EX, [w], 'weight_reps').weight?.set.id).toBe('first');
  });

  it('compares after round4 so float noise is a tie', () => {
    const early = bench('a', 1000, [mkSet('e', { weightKg: 100.00001, reps: 5 })]);
    const late = bench('b', 2000, [mkSet('l', { weightKg: 100.00002, reps: 5 })]);
    expect(exerciseRecords(EX, [early, late], 'weight_reps').weight?.workoutId).toBe('a');
  });

  it('weighted_bodyweight with 0 added weight yields only reps', () => {
    const w = bench('a', 1000, [mkSet('s1', { weightKg: 0, reps: 12 })]);
    const r = exerciseRecords(EX, [w], 'weighted_bodyweight');
    expect(r.weight).toBeUndefined();
    expect(r.e1rm).toBeUndefined();
    expect(r.setVolume).toBeUndefined();
    expect(r.reps?.value).toBe(12);
  });

  it('weighted_bodyweight uses added weight only', () => {
    const w = bench('a', 1000, [mkSet('s1', { weightKg: 20, reps: 5 })]);
    const r = exerciseRecords(EX, [w], 'weighted_bodyweight');
    expect(r.weight?.value).toBe(20);
    expect(r.setVolume?.value).toBe(100);
  });

  it('bodyweight_reps records most reps only', () => {
    const w = bench('a', 1000, [mkSet('s1', { reps: 20 }), mkSet('s2', { reps: 25 })]);
    const r = exerciseRecords(EX, [w], 'bodyweight_reps');
    expect(r).toEqual({ reps: expect.objectContaining({ value: 25 }) });
  });

  it('duration records the longest set', () => {
    const w = bench('a', 1000, [
      mkSet('s1', { durationSec: 60 }),
      mkSet('s2', { durationSec: 90 }),
    ]);
    const r = exerciseRecords(EX, [w], 'duration');
    expect(r.duration?.value).toBe(90);
    expect(r.duration?.set.id).toBe('s2');
  });

  it('ignores other exercises and does not mutate input', () => {
    const w = mkWorkout('a', [mkEx('e', 'other', [mkSet('s', { weightKg: 500, reps: 5 })])]);
    const snapshot = JSON.stringify(w);
    expect(exerciseRecords(EX, [w], 'weight_reps')).toEqual({});
    expect(JSON.stringify(w)).toBe(snapshot);
  });
});

describe('topSet', () => {
  it('returns undefined for empty or warm-up-only input', () => {
    expect(topSet([], 'weight_reps')).toBeUndefined();
    expect(
      topSet([mkSet('w', { type: 'warmup', weightKg: 100, reps: 5 })], 'weight_reps'),
    ).toBeUndefined();
  });

  it('weight_reps: heaviest, then most reps, then first', () => {
    const sets = [
      mkSet('a', { order: 0, weightKg: 100, reps: 5 }),
      mkSet('b', { order: 1, weightKg: 100, reps: 8 }),
      mkSet('c', { order: 2, weightKg: 100, reps: 8 }),
      mkSet('d', { order: 3, weightKg: 80, reps: 20 }),
    ];
    expect(topSet(sets, 'weight_reps')?.id).toBe('b');
  });

  it('weight_reps ignores a heavy warm-up and incomplete sets', () => {
    const sets = [
      mkSet('w', { order: 0, type: 'warmup', weightKg: 200, reps: 1 }),
      mkSet('x', { order: 1, weightKg: 150, reps: 1, completed: false }),
      mkSet('a', { order: 2, weightKg: 100, reps: 5 }),
    ];
    expect(topSet(sets, 'weight_reps')?.id).toBe('a');
  });

  it('weighted_bodyweight: heaviest added, else most reps', () => {
    const added = [
      mkSet('a', { order: 0, weightKg: 0, reps: 15 }),
      mkSet('b', { order: 1, weightKg: 10, reps: 5 }),
    ];
    expect(topSet(added, 'weighted_bodyweight')?.id).toBe('b');
    const none = [
      mkSet('a', { order: 0, weightKg: 0, reps: 10 }),
      mkSet('b', { order: 1, weightKg: 0, reps: 12 }),
    ];
    expect(topSet(none, 'weighted_bodyweight')?.id).toBe('b');
  });

  it('bodyweight_reps: most reps, first on tie', () => {
    const sets = [
      mkSet('a', { order: 0, reps: 10 }),
      mkSet('b', { order: 1, reps: 15 }),
      mkSet('c', { order: 2, reps: 15 }),
    ];
    expect(topSet(sets, 'bodyweight_reps')?.id).toBe('b');
  });

  it('duration: longest', () => {
    const sets = [
      mkSet('a', { order: 0, durationSec: 30 }),
      mkSet('b', { order: 1, durationSec: 45 }),
    ];
    expect(topSet(sets, 'duration')?.id).toBe('b');
  });

  it('uses set order rather than array order for ties and does not mutate', () => {
    const sets = [
      mkSet('late', { order: 1, weightKg: 100, reps: 5 }),
      mkSet('early', { order: 0, weightKg: 100, reps: 5 }),
    ];
    expect(topSet(sets, 'weight_reps')?.id).toBe('early');
    expect(sets.map((s) => s.id)).toEqual(['late', 'early']);
  });
});

describe('trainedExercises', () => {
  it('returns [] for no workouts', () => {
    expect(trainedExercises([])).toEqual([]);
  });

  it('orders by latest start desc then id asc and counts sessions', () => {
    const w1 = mkWorkout('w1', [mkEx('e', 'a', [mkSet('s')]), mkEx('f', 'b', [mkSet('t')])], {
      startedAt: 1000,
    });
    const w2 = mkWorkout('w2', [mkEx('e', 'a', [mkSet('s')])], { startedAt: 3000 });
    const w3 = mkWorkout('w3', [mkEx('e', 'c', [mkSet('s')])], { startedAt: 1000 });
    expect(trainedExercises([w1, w2, w3])).toEqual([
      { exerciseId: 'a', lastStartedAt: 3000, sessionCount: 2 },
      { exerciseId: 'b', lastStartedAt: 1000, sessionCount: 1 },
      { exerciseId: 'c', lastStartedAt: 1000, sessionCount: 1 },
    ]);
  });

  it('counts warm-up-only sessions, but not incomplete-only blocks', () => {
    const w = mkWorkout('w', [
      mkEx('e', 'a', [mkSet('s', { type: 'warmup' })]),
      mkEx('f', 'b', [mkSet('t', { completed: false })]),
    ]);
    expect(trainedExercises([w]).map((t) => t.exerciseId)).toEqual(['a']);
  });

  it('excludes in-progress workouts and counts duplicate blocks once per workout', () => {
    const running = mkWorkout('r', [mkEx('e', 'a', [mkSet('s')])], { status: 'in_progress' });
    const dup = mkWorkout('d', [mkEx('e', 'b', [mkSet('s')]), mkEx('f', 'b', [mkSet('t')], 1)]);
    expect(trainedExercises([running, dup])).toEqual([
      { exerciseId: 'b', lastStartedAt: 1000, sessionCount: 1 },
    ]);
  });
});
