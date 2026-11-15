import { describe, expect, it } from 'vitest';
import type { ExerciseType, Workout } from '../../../types/domain';
import { compareWorkoutsDesc, exerciseHistory, groupByMonth, workoutStats } from '../history';
import { mkEx, mkSet, mkWorkout } from './fixtures';

const types = new Map<string, ExerciseType>([
  ['bench', 'weight_reps'],
  ['pullup', 'bodyweight_reps'],
]);

const at = (id: string, y: number, m: number, d: number, h = 12, min = 0): Workout =>
  mkWorkout(id, [], { startedAt: new Date(y, m - 1, d, h, min).getTime() });

describe('groupByMonth', () => {
  it('returns [] for empty input', () => {
    expect(groupByMonth([])).toEqual([]);
  });

  it('filters in-progress workouts', () => {
    const ip: Workout = { ...at('ip', 2026, 11, 1), status: 'in_progress' };
    expect(groupByMonth([ip])).toEqual([]);
  });

  it('sorts desc within and across groups with labels and keys', () => {
    const groups = groupByMonth([
      at('a', 2026, 10, 5),
      at('b', 2026, 11, 2),
      at('c', 2026, 11, 20),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-11', '2026-10']);
    expect(groups.map((g) => g.label)).toEqual(['November 2026', 'October 2026']);
    expect(groups[0]?.workouts.map((w) => w.id)).toEqual(['c', 'b']);
  });

  it('uses local month boundaries', () => {
    const groups = groupByMonth([at('oct', 2026, 10, 31, 23, 30), at('nov', 2026, 11, 1, 0, 30)]);
    expect(groups.map((g) => g.key)).toEqual(['2026-11', '2026-10']);
    expect(groups[1]?.workouts[0]?.id).toBe('oct');
  });

  it('handles the ambiguous DST-end hour', () => {
    expect(groupByMonth([at('dst', 2026, 11, 1, 1, 30)])[0]?.label).toBe('November 2026');
  });

  it('handles the DST-start hour', () => {
    expect(groupByMonth([at('dst', 2026, 3, 8, 3, 30)])[0]?.label).toBe('March 2026');
  });

  it('splits at the year boundary', () => {
    const groups = groupByMonth([at('dec', 2026, 12, 31, 23, 59), at('jan', 2027, 1, 1, 0, 1)]);
    expect(groups.map((g) => g.label)).toEqual(['January 2027', 'December 2026']);
  });

  it('orders equal timestamps by id desc regardless of input order', () => {
    const a = at('a', 2026, 11, 5);
    const b = { ...a, id: 'b' };
    expect(groupByMonth([a, b])[0]?.workouts.map((w) => w.id)).toEqual(['b', 'a']);
    expect(groupByMonth([b, a])[0]?.workouts.map((w) => w.id)).toEqual(['b', 'a']);
    expect(compareWorkoutsDesc(a, b)).toBeGreaterThan(0);
  });
});

describe('workoutStats', () => {
  it('excludes warmups from volume and counts sets, PRs and duplicate blocks', () => {
    const w = mkWorkout(
      'w',
      [
        mkEx('e1', 'bench', [
          mkSet('a', { weightKg: 100, reps: 5, isPR: true }),
          mkSet('b', { weightKg: 200, reps: 5, type: 'warmup' }),
          mkSet('c', { weightKg: 50, reps: 2, completed: false }),
        ]),
        mkEx('e2', 'bench', [mkSet('d', { weightKg: 10, reps: 1 })], 1),
      ],
      { startedAt: 1000, endedAt: 4000 },
    );
    expect(workoutStats(w, types)).toEqual({
      durationMs: 3000,
      volumeKg: 510,
      exerciseCount: 2,
      setCount: 3,
      prCount: 1,
    });
  });

  it('gives bodyweight-only volume 0 and undefined duration without endedAt', () => {
    const w = mkWorkout('w', [mkEx('e', 'pullup', [mkSet('a', { reps: 8 })])]);
    const s = workoutStats(w, types);
    expect(s.volumeKg).toBe(0);
    expect(s.durationMs).toBeUndefined();
  });

  it('clamps negative duration to 0', () => {
    const w = mkWorkout('w', [], { startedAt: 5000, endedAt: 1000 });
    expect(workoutStats(w, types).durationMs).toBe(0);
  });
});

describe('exerciseHistory', () => {
  it('merges blocks in order, excludes incomplete sets, skips other workouts, sorts desc', () => {
    const w1 = mkWorkout(
      'w1',
      [
        mkEx('b2', 'bench', [mkSet('s3', { weightKg: 3, reps: 1 })], 1),
        mkEx('b1', 'bench', [
          mkSet('s1', { weightKg: 1, reps: 1 }),
          mkSet('s2', { weightKg: 2, reps: 1, completed: false }),
        ]),
      ],
      { startedAt: 100 },
    );
    const w2 = mkWorkout('w2', [mkEx('p', 'pullup', [mkSet('x', { reps: 5 })])], {
      startedAt: 200,
    });
    const w3 = mkWorkout(
      'w3',
      [mkEx('b', 'bench', [mkSet('s4', { weightKg: 4, reps: 1, isPR: true })])],
      { startedAt: 300 },
    );
    const w4 = mkWorkout(
      'w4',
      [mkEx('b', 'bench', [mkSet('s5', { weightKg: 4, reps: 1, completed: false })])],
      { startedAt: 400 },
    );
    const out = exerciseHistory('bench', [w1, w2, w3, w4]);
    expect(out.map((s) => s.workoutId)).toEqual(['w3', 'w1']);
    expect(out[1]?.sets.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(out[0]?.hasPR).toBe(true);
    expect(out[1]?.hasPR).toBe(false);
    expect(out[0]?.workoutName).toBe('W');
    expect(out[0]?.startedAt).toBe(300);
  });

  it('ignores in-progress workouts and handles empty input', () => {
    const ip: Workout = {
      ...mkWorkout('ip', [mkEx('b', 'bench', [mkSet('a', { weightKg: 1, reps: 1 })])]),
      status: 'in_progress',
    };
    expect(exerciseHistory('bench', [ip])).toEqual([]);
    expect(exerciseHistory('bench', [])).toEqual([]);
  });
});
