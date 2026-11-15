import { describe, expect, it } from 'vitest';
import type { ExerciseType, Workout } from '../../../types/domain';
import { recomputePRsForExercises } from '../prs';
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
  mkWorkout('cur', [mkEx('ce', exId, sets)], { startedAt: 1000, status: 'completed' });

const flags = (w: Workout): (boolean | undefined)[] =>
  w.exercises.flatMap((we) => we.sets.map((s) => s.isPR));

function computePRFlags(
  workout: Workout,
  priors: readonly Workout[],
  t: ReadonlyMap<string, ExerciseType>,
): Workout {
  const ids = new Set(workout.exercises.map((we) => we.exerciseId));
  const out = recomputePRsForExercises(ids, [...priors, workout], t);
  return out.get(workout.id) ?? workout;
}

describe('recomputePRsForExercises (single workout vs priors)', () => {
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

  it('ignores in-progress priors', () => {
    const a = prior([mkSet('x', { weightKg: 300, reps: 1 })], { status: 'in_progress' });
    const c = prior([mkSet('z', { weightKg: 50, reps: 1 })], { id: 'p3' });
    const out = computePRFlags(current([mkSet('a', { weightKg: 100, reps: 1 })]), [a, c], types);
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

const wk = (id: string, startedAt: number, weights: number[], exId = 'bench'): Workout =>
  mkWorkout(
    id,
    [
      mkEx(
        `e-${id}`,
        exId,
        weights.map((w, i) => mkSet(`${id}-s${i}`, { weightKg: w, reps: 1 })),
      ),
    ],
    { startedAt },
  );

const A = new Set(['bench']);
const flagsOf = (w: Workout | undefined): (boolean | undefined)[] => (w ? flags(w) : []);
const apply = (list: readonly Workout[], out: Map<string, Workout>): Workout[] =>
  list.map((w) => out.get(w.id) ?? w);

describe('recomputePRsForExercises (history edits)', () => {
  it('edit lowering a PR moves the flag to the next workout', () => {
    const base = [wk('w1', 100, [100]), wk('w2', 200, [110]), wk('w3', 300, [105])];
    const settled = apply(base, recomputePRsForExercises(A, base, types));
    expect(settled.map(flags)).toEqual([[undefined], [true], [undefined]]);

    const lowered = wk('w2', 200, [95]);
    const withStale: Workout = {
      ...lowered,
      exercises: lowered.exercises.map((we) => ({
        ...we,
        sets: we.sets.map((s) => ({ ...s, isPR: true })),
      })),
    };
    const out = recomputePRsForExercises(
      A,
      [settled[0] as Workout, withStale, settled[2] as Workout],
      types,
    );
    expect([...out.keys()].sort()).toEqual(['w2', 'w3']);
    expect(flagsOf(out.get('w2'))).toEqual([undefined]);
    expect(flagsOf(out.get('w3'))).toEqual([true]);
  });

  it('deleting the PR workout flags the next one', () => {
    const out = recomputePRsForExercises(A, [wk('w1', 100, [100]), wk('w3', 300, [105])], types);
    expect([...out.keys()]).toEqual(['w3']);
    expect(flagsOf(out.get('w3'))).toEqual([true]);
  });

  it('moving a workout between two others flags it and keeps the later PR', () => {
    const list = [wk('w1', 100, [100]), wk('w2', 300, [110]), wk('w3', 200, [105])];
    const out = recomputePRsForExercises(A, list, types);
    expect(flagsOf(out.get('w3'))).toEqual([true]);
    expect(flagsOf(out.get('w2'))).toEqual([true]);
    expect(out.has('w1')).toBe(false);
  });

  it('a workout moved before the earliest is first-ever and nothing else is flagged', () => {
    const list = [wk('w1', 200, [100]), wk('w2', 50, [110]), wk('w3', 300, [105])];
    expect(recomputePRsForExercises(A, list, types).size).toBe(0);
  });

  it('does not flag a tie with an earlier best', () => {
    const out = recomputePRsForExercises(A, [wk('w1', 100, [100]), wk('w2', 200, [100])], types);
    expect(out.size).toBe(0);
  });

  it('flags the first set on an in-workout tie', () => {
    const list = [wk('w1', 100, [100]), wk('w2', 200, [110, 110])];
    const out = recomputePRsForExercises(A, list, types);
    expect(flagsOf(out.get('w2'))).toEqual([true, undefined]);
  });

  it('flags both peers sharing a startedAt regardless of input order', () => {
    const w1 = wk('w1', 100, [100]);
    const pa = wk('pa', 200, [110]);
    const pb = wk('pb', 200, [110]);
    for (const list of [
      [w1, pa, pb],
      [pb, pa, w1],
    ]) {
      const out = recomputePRsForExercises(A, list, types);
      expect(flagsOf(out.get('pa'))).toEqual([true]);
      expect(flagsOf(out.get('pb'))).toEqual([true]);
    }
  });

  it('merges peer maxima into the best only after the group', () => {
    const list = [
      wk('w1', 100, [100]),
      wk('pa', 200, [110]),
      wk('pb', 200, [120]),
      wk('w4', 300, [115]),
    ];
    const out = recomputePRsForExercises(A, list, types);
    expect(flagsOf(out.get('pa'))).toEqual([true]);
    expect(flagsOf(out.get('pb'))).toEqual([true]);
    expect(out.has('w4')).toBe(false);
  });

  it('leaves other exercises untouched and clears flags on unknown ids', () => {
    const stale = mkWorkout(
      'w2',
      [
        mkEx('ea', 'bench', [mkSet('a', { weightKg: 50, reps: 1 })], 0),
        mkEx('eb', 'bench2', [mkSet('b', { weightKg: 50, reps: 1, isPR: true })], 1),
        mkEx('eg', 'gone', [mkSet('g', { weightKg: 50, reps: 1, isPR: true })], 2),
      ],
      { startedAt: 200 },
    );
    const w1 = wk('w1', 100, [100]);
    expect(recomputePRsForExercises(A, [w1, stale], types).size).toBe(0);
    const out = recomputePRsForExercises(new Set(['gone']), [w1, stale], types).get('w2');
    expect(out?.exercises[2]?.sets[0]?.isPR).toBeUndefined();
    expect(out?.exercises[1]?.sets[0]?.isPR).toBe(true);
  });

  it('neither counts nor returns in-progress workouts', () => {
    const ip: Workout = { ...wk('ip', 150, [500]), status: 'in_progress' };
    const out = recomputePRsForExercises(
      A,
      [wk('w1', 100, [100]), ip, wk('w3', 200, [110])],
      types,
    );
    expect([...out.keys()]).toEqual(['w3']);
  });

  it('is idempotent', () => {
    const list = [wk('w1', 100, [100]), wk('w2', 200, [110]), wk('w3', 300, [105, 120])];
    const settled = apply(list, recomputePRsForExercises(A, list, types));
    expect(recomputePRsForExercises(A, settled, types).size).toBe(0);
  });

  it('does not mutate inputs and removes false flags as missing keys', () => {
    const lowStale = mkWorkout(
      'w2',
      [mkEx('e', 'bench', [mkSet('s', { weightKg: 50, reps: 1, isPR: true })])],
      { startedAt: 200 },
    );
    const list = [wk('w1', 100, [100]), lowStale];
    const snap = structuredClone(list);
    const out = recomputePRsForExercises(A, list, types);
    expect(list).toEqual(snap);
    const set = out.get('w2')?.exercises[0]?.sets[0];
    expect(set).toBeDefined();
    expect(set && 'isPR' in set).toBe(false);
  });

  it('returns an empty map for empty input', () => {
    expect(recomputePRsForExercises(A, [], types).size).toBe(0);
    expect(recomputePRsForExercises(new Set(), [wk('w1', 100, [100])], types).size).toBe(0);
  });
});
