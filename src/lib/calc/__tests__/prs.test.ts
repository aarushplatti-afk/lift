import { describe, expect, it } from 'vitest';
import type { ExerciseType, Workout } from '../../../types/domain';
import { computePRFlags } from '../prs';
import { mkEx, mkSet, mkWorkout } from './fixtures';

const types = new Map<string, ExerciseType>([
  ['bench', 'weight_reps'],
  ['bench2', 'weight_reps'],
  ['dip', 'weighted_bodyweight'],
  ['pullup', 'bodyweight_reps'],
  ['plank', 'duration'],
]);

const prior = (sets: Parameters<typeof mkEx>[2], over: Partial<Workout> = {}, exId = 'bench') =>
  mkWorkout('p1', [mkEx('pe', exId, sets)], { startedAt: 100, ...over });

const current = (sets: Parameters<typeof mkEx>[2], exId = 'bench') =>
  mkWorkout('cur', [mkEx('ce', exId, sets)], { startedAt: 1000, status: 'in_progress' });

const flags = (w: Workout): (boolean | undefined)[] =>
  w.exercises.flatMap((we) => we.sets.map((s) => s.isPR));

describe('computePRFlags', () => {
  it('gives no flag for first-ever logging', () => {
    const out = computePRFlags(current([mkSet('a', { weightKg: 100, reps: 5 })]), [], types);
    expect(flags(out)).toEqual([undefined]);
  });

  it('gives no flag when only ineligible prior sets exist', () => {
    const p = prior([mkSet('x', { weightKg: 500, reps: 5, type: 'warmup' })]);
    const out = computePRFlags(current([mkSet('a', { weightKg: 100, reps: 5 })]), [p], types);
    expect(flags(out)).toEqual([undefined]);
  });

  it('does not flag a tie with the prior best', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const out = computePRFlags(current([mkSet('a', { weightKg: 100, reps: 1 })]), [p], types);
    expect(flags(out)).toEqual([undefined]);
  });

  it('flags beating the prior by 0.0001 kg', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const out = computePRFlags(current([mkSet('a', { weightKg: 100.0001, reps: 1 })]), [p], types);
    expect(flags(out)).toEqual([true]);
  });

  it('flags only the best of two sets that beat the prior', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const out = computePRFlags(
      current([mkSet('a', { weightKg: 105, reps: 1 }), mkSet('b', { weightKg: 110, reps: 1 })]),
      [p],
      types,
    );
    expect(flags(out)).toEqual([undefined, true]);
  });

  it('flags the first set when tied within the workout', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const out = computePRFlags(
      current([mkSet('a', { weightKg: 110, reps: 1 }), mkSet('b', { weightKg: 110, reps: 1 })]),
      [p],
      types,
    );
    expect(flags(out)).toEqual([true, undefined]);
  });

  it('flags both sets when weight and e1rm winners differ', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 5 })]);
    const out = computePRFlags(
      current([mkSet('a', { weightKg: 120, reps: 1 }), mkSet('b', { weightKg: 110, reps: 10 })]),
      [p],
      types,
    );
    expect(flags(out)).toEqual([true, true]);
  });

  it('ignores a heavy warmup set', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const out = computePRFlags(
      current([mkSet('a', { weightKg: 200, reps: 1, type: 'warmup' })]),
      [p],
      types,
    );
    expect(flags(out)).toEqual([undefined]);
  });

  it('ignores incomplete and invalid current sets', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const out = computePRFlags(
      current([
        mkSet('a', { weightKg: 200, reps: 1, completed: false }),
        mkSet('b', { weightKg: 200 }),
      ]),
      [p],
      types,
    );
    expect(flags(out)).toEqual([undefined, undefined]);
  });

  it('ignores a prior workout that started later', () => {
    const p = prior([mkSet('x', { weightKg: 300, reps: 1 })], { startedAt: 2000 });
    const out = computePRFlags(
      current([mkSet('a', { weightKg: 100, reps: 1 })]),
      [p, prior([mkSet('y', { weightKg: 50, reps: 1 })], { id: 'p2' })],
      types,
    );
    expect(flags(out)).toEqual([true]);
  });

  it('ignores prior workouts that started at the same time', () => {
    const p = prior([mkSet('x', { weightKg: 300, reps: 1 })], { startedAt: 1000 });
    const out = computePRFlags(current([mkSet('a', { weightKg: 100, reps: 1 })]), [p], types);
    expect(flags(out)).toEqual([undefined]);
  });

  it('ignores in-progress priors and priors with the same id', () => {
    const a = prior([mkSet('x', { weightKg: 300, reps: 1 })], { status: 'in_progress' });
    const b = prior([mkSet('y', { weightKg: 300, reps: 1 })], { id: 'cur' });
    const c = prior([mkSet('z', { weightKg: 50, reps: 1 })], { id: 'p3' });
    const out = computePRFlags(current([mkSet('a', { weightKg: 100, reps: 1 })]), [a, b, c], types);
    expect(flags(out)).toEqual([true]);
  });

  it('excludes sets over 12 reps from e1rm but not weight', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const out = computePRFlags(current([mkSet('a', { weightKg: 101, reps: 20 })]), [p], types);
    expect(flags(out)).toEqual([true]);
    const p2 = prior([mkSet('x', { weightKg: 100, reps: 5 })]);
    const out2 = computePRFlags(current([mkSet('a', { weightKg: 90, reps: 20 })]), [p2], types);
    expect(flags(out2)).toEqual([undefined]);
  });

  it('lets duplicate blocks of one exercise share one best', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const w = mkWorkout(
      'cur',
      [
        mkEx('c1', 'bench', [mkSet('a', { weightKg: 110, reps: 1 })], 0),
        mkEx('c2', 'bench', [mkSet('b', { weightKg: 120, reps: 1 })], 1),
      ],
      { startedAt: 1000 },
    );
    const out = computePRFlags(w, [p], types);
    expect(flags(out)).toEqual([undefined, true]);
  });

  it('breaks ties across blocks by exercise order', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const w = mkWorkout('cur', [
      mkEx('c2', 'bench', [mkSet('b', { weightKg: 120, reps: 1 })], 1),
      mkEx('c1', 'bench', [mkSet('a', { weightKg: 120, reps: 1 })], 0),
    ]);
    const out = computePRFlags(w, [p], types);
    expect(out.exercises[1]?.sets[0]?.isPR).toBe(true);
    expect(out.exercises[0]?.sets[0]?.isPR).toBeUndefined();
  });

  it('flags bodyweight_reps max-reps PR', () => {
    const p = prior([mkSet('x', { reps: 10 })], {}, 'pullup');
    const out = computePRFlags(
      current([mkSet('a', { reps: 10 }), mkSet('b', { reps: 11 })], 'pullup'),
      [p],
      types,
    );
    expect(flags(out)).toEqual([undefined, true]);
  });

  it('flags duration longest-set PR', () => {
    const p = prior([mkSet('x', { durationSec: 60 })], {}, 'plank');
    const out = computePRFlags(
      current([mkSet('a', { durationSec: 90 }), mkSet('b', { durationSec: 30 })], 'plank'),
      [p],
      types,
    );
    expect(flags(out)).toEqual([true, undefined]);
  });

  it('gives weighted_bodyweight with 0 added no weight PR', () => {
    const p = prior([mkSet('x', { weightKg: 10, reps: 5 })], {}, 'dip');
    const out = computePRFlags(
      current([mkSet('a', { weightKg: 0, reps: 30 }), mkSet('b', { reps: 30 })], 'dip'),
      [p],
      types,
    );
    expect(flags(out)).toEqual([undefined, undefined]);
  });

  it('flags weighted_bodyweight with added weight', () => {
    const p = prior([mkSet('x', { weightKg: 10, reps: 5 })], {}, 'dip');
    const out = computePRFlags(current([mkSet('a', { weightKg: 20, reps: 5 })], 'dip'), [p], types);
    expect(flags(out)).toEqual([true]);
  });

  it('never flags unknown exercises', () => {
    const p = prior([mkSet('x', { weightKg: 10, reps: 5 })], {}, 'gone');
    const out = computePRFlags(
      current([mkSet('a', { weightKg: 99, reps: 5 })], 'gone'),
      [p],
      types,
    );
    expect(flags(out)).toEqual([undefined]);
  });

  it('does not mix different exercises', () => {
    const p = prior([mkSet('x', { weightKg: 500, reps: 1 })], {}, 'bench2');
    const out = computePRFlags(current([mkSet('a', { weightKg: 100, reps: 1 })]), [p], types);
    expect(flags(out)).toEqual([undefined]);
  });

  it('clears stale isPR keys', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const out = computePRFlags(
      current([mkSet('a', { weightKg: 50, reps: 1, isPR: true })]),
      [p],
      types,
    );
    expect('isPR' in (out.exercises[0]?.sets[0] ?? {})).toBe(false);
  });

  it('does not mutate the input', () => {
    const p = prior([mkSet('x', { weightKg: 100, reps: 1 })]);
    const w = current([
      mkSet('a', { weightKg: 150, reps: 1 }),
      mkSet('b', { weightKg: 1, reps: 1, isPR: true }),
    ]);
    const snapshot = structuredClone(w);
    const pSnapshot = structuredClone(p);
    const out = computePRFlags(w, [p], types);
    expect(w).toEqual(snapshot);
    expect(p).toEqual(pSnapshot);
    expect(out).not.toBe(w);
  });

  it('handles empty workout', () => {
    const out = computePRFlags(mkWorkout('cur', []), [], types);
    expect(out.exercises).toEqual([]);
  });
});
