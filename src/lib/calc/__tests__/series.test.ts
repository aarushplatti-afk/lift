import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutSet } from '../../../types/domain';
import { downsample, exerciseSeries, isZeroBased, metricKind, metricsFor } from '../series';
import { mkEx, mkSet, mkWorkout } from './fixtures';

const BENCH = 'bench';

function bench(
  id: string,
  startedAt: number,
  sets: Partial<WorkoutSet>[],
  over: Partial<Workout> = {},
): Workout {
  return mkWorkout(
    id,
    [
      mkEx(
        `${id}-e`,
        BENCH,
        sets.map((s, i) => mkSet(`${id}-s${i}`, s)),
      ),
    ],
    {
      startedAt,
      ...over,
    },
  );
}

describe('exerciseSeries', () => {
  it('returns [] for no workouts', () => {
    expect(exerciseSeries(BENCH, [], 'weight', 'weight_reps')).toEqual([]);
  });

  it('skips workouts without the exercise, in-progress workouts and warm-up-only workouts', () => {
    const other = mkWorkout('o', [mkEx('e', 'squat', [mkSet('s', { weightKg: 100, reps: 5 })])]);
    const live = bench('live', 2000, [{ weightKg: 100, reps: 5 }], { status: 'in_progress' });
    const warm = bench('warm', 3000, [{ weightKg: 100, reps: 5, type: 'warmup' }]);
    for (const m of ['weight', 'e1rm', 'volume', 'reps'] as const) {
      expect(exerciseSeries(BENCH, [other, live, warm], m, 'weight_reps')).toEqual([]);
    }
  });

  it('ignores a heavy warm-up for every metric', () => {
    const w = bench('a', 1000, [
      { weightKg: 300, reps: 1, type: 'warmup' },
      { weightKg: 100, reps: 5 },
    ]);
    const get = (m: 'weight' | 'e1rm' | 'volume' | 'reps') =>
      exerciseSeries(BENCH, [w], m, 'weight_reps')[0];
    expect(get('weight')?.value).toBe(100);
    expect(get('e1rm')?.value).toBeCloseTo(100 * (1 + 5 / 30), 3);
    expect(get('volume')?.value).toBe(500);
    expect(get('reps')?.value).toBe(5);
    expect(get('weight')?.setCount).toBe(1);
  });

  it('ignores incomplete sets', () => {
    const w = bench('a', 1000, [
      { weightKg: 200, reps: 5, completed: false },
      { weightKg: 100, reps: 5 },
    ]);
    expect(exerciseSeries(BENCH, [w], 'weight', 'weight_reps')[0]?.value).toBe(100);
    expect(exerciseSeries(BENCH, [w], 'volume', 'weight_reps')[0]?.value).toBe(500);
  });

  it('combines duplicate blocks into one point', () => {
    const w = mkWorkout(
      'a',
      [
        mkEx('e1', BENCH, [mkSet('s1', { weightKg: 100, reps: 5 })], 0),
        mkEx('e2', BENCH, [mkSet('s2', { weightKg: 110, reps: 3 })], 1),
      ],
      { startedAt: 1000 },
    );
    const weight = exerciseSeries(BENCH, [w], 'weight', 'weight_reps');
    expect(weight).toHaveLength(1);
    expect(weight[0]?.value).toBe(110);
    expect(weight[0]?.set?.id).toBe('s2');
    expect(weight[0]?.setCount).toBe(2);
    expect(exerciseSeries(BENCH, [w], 'volume', 'weight_reps')[0]?.value).toBe(830);
  });

  it('breaks weight ties by first block then first set', () => {
    const w = mkWorkout(
      'a',
      [
        mkEx('e2', BENCH, [mkSet('late', { weightKg: 100, reps: 5 })], 1),
        mkEx(
          'e1',
          BENCH,
          [mkSet('first', { weightKg: 100, reps: 3 }), mkSet('second', { weightKg: 100, reps: 8 })],
          0,
        ),
      ],
      { startedAt: 1000 },
    );
    expect(exerciseSeries(BENCH, [w], 'weight', 'weight_reps')[0]?.set?.id).toBe('first');
  });

  it('breaks reps ties by heavier weight, then first', () => {
    const w = bench('a', 1000, [
      { weightKg: 80, reps: 10 },
      { weightKg: 90, reps: 10 },
      { weightKg: 90, reps: 10 },
    ]);
    expect(exerciseSeries(BENCH, [w], 'reps', 'weight_reps')[0]?.set?.id).toBe('a-s1');
  });

  it('skips e1rm for reps above 12 but still counts them for weight', () => {
    const w = bench('a', 1000, [{ weightKg: 40, reps: 15 }]);
    expect(exerciseSeries(BENCH, [w], 'e1rm', 'weight_reps')).toEqual([]);
    expect(exerciseSeries(BENCH, [w], 'weight', 'weight_reps')[0]?.value).toBe(40);
  });

  it('uses added weight only for weighted_bodyweight', () => {
    const zero = bench('z', 1000, [{ weightKg: 0, reps: 8 }]);
    expect(exerciseSeries(BENCH, [zero], 'weight', 'weighted_bodyweight')).toEqual([]);
    expect(exerciseSeries(BENCH, [zero], 'e1rm', 'weighted_bodyweight')).toEqual([]);
    expect(exerciseSeries(BENCH, [zero], 'volume', 'weighted_bodyweight')).toEqual([]);
    expect(exerciseSeries(BENCH, [zero], 'reps', 'weighted_bodyweight')[0]?.value).toBe(8);
    const added = bench('p', 2000, [{ weightKg: 20, reps: 5 }]);
    expect(exerciseSeries(BENCH, [added], 'weight', 'weighted_bodyweight')[0]?.value).toBe(20);
    expect(exerciseSeries(BENCH, [added], 'volume', 'weighted_bodyweight')[0]?.value).toBe(100);
  });

  it('handles bodyweight_reps max and total reps', () => {
    const w = bench('a', 1000, [{ reps: 10 }, { reps: 15 }, { reps: 12 }]);
    expect(exerciseSeries(BENCH, [w], 'reps', 'bodyweight_reps')[0]?.value).toBe(15);
    const total = exerciseSeries(BENCH, [w], 'volume', 'bodyweight_reps')[0];
    expect(total?.value).toBe(37);
    expect(total?.set).toBeUndefined();
    expect(total?.setCount).toBe(3);
  });

  it('handles duration longest set', () => {
    const w = bench('a', 1000, [{ durationSec: 30 }, { durationSec: 90 }]);
    expect(exerciseSeries(BENCH, [w], 'duration', 'duration')[0]?.value).toBe(90);
  });

  it('returns [] for a metric the type does not support', () => {
    const w = bench('a', 1000, [{ durationSec: 30 }]);
    expect(exerciseSeries(BENCH, [w], 'weight', 'duration')).toEqual([]);
  });

  it('orders by startedAt then id, including equal startedAt', () => {
    const b = bench('b', 1000, [{ weightKg: 100, reps: 5 }]);
    const a = bench('a', 1000, [{ weightKg: 90, reps: 5 }]);
    const early = bench('z', 500, [{ weightKg: 80, reps: 5 }]);
    const pts = exerciseSeries(BENCH, [b, a, early], 'weight', 'weight_reps');
    expect(pts.map((p) => p.workoutId)).toEqual(['z', 'a', 'b']);
    expect(pts.map((p) => p.t)).toEqual([500, 1000, 1000]);
  });

  it('does not mutate its input', () => {
    const ws: Workout[] = [
      bench('b', 2000, [{ weightKg: 100, reps: 5 }]),
      bench('a', 1000, [{ weightKg: 90, reps: 5 }]),
    ];
    const snapshot = JSON.stringify(ws);
    exerciseSeries(BENCH, ws, 'weight', 'weight_reps');
    expect(JSON.stringify(ws)).toBe(snapshot);
    expect(ws.map((w) => w.id)).toEqual(['b', 'a']);
  });
});

describe('metricsFor / metricKind / isZeroBased', () => {
  it('lists metrics per type with the default first', () => {
    expect(metricsFor('weight_reps')).toEqual(['weight', 'e1rm', 'volume', 'reps']);
    expect(metricsFor('weighted_bodyweight')).toEqual(['weight', 'e1rm', 'volume', 'reps']);
    expect(metricsFor('bodyweight_reps')).toEqual(['reps', 'volume']);
    expect(metricsFor('duration')).toEqual(['duration']);
  });
  it('maps value kinds', () => {
    expect(metricKind('weight', 'weight_reps')).toBe('kg');
    expect(metricKind('e1rm', 'weighted_bodyweight')).toBe('kg');
    expect(metricKind('volume', 'weight_reps')).toBe('kg');
    expect(metricKind('volume', 'weighted_bodyweight')).toBe('kg');
    expect(metricKind('volume', 'bodyweight_reps')).toBe('count');
    expect(metricKind('reps', 'weight_reps')).toBe('count');
    expect(metricKind('reps', 'bodyweight_reps')).toBe('count');
    expect(metricKind('duration', 'duration')).toBe('seconds');
  });
  it('flags zero-based metrics', () => {
    expect(isZeroBased('weight')).toBe(false);
    expect(isZeroBased('e1rm')).toBe(false);
    expect(isZeroBased('volume')).toBe(true);
    expect(isZeroBased('reps')).toBe(true);
    expect(isZeroBased('duration')).toBe(true);
  });
});

function series(n: number, value: (i: number) => number): { t: number; value: number }[] {
  return Array.from({ length: n }, (_, i) => ({ t: i * 1000, value: value(i) }));
}

describe('downsample', () => {
  it('returns the same reference when n <= max', () => {
    const pts = series(500, (i) => i);
    expect(downsample(pts)).toBe(pts);
    const small = series(3, (i) => i);
    expect(downsample(small, 10)).toBe(small);
  });

  it('reduces 2000 points to <= 500 keeping first, last, min and max', () => {
    const pts = series(2000, (i) => 100 + (i % 7));
    pts[1234] = { t: 1234000, value: 1000 };
    pts[777] = { t: 777000, value: -50 };
    const out = downsample(pts, 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out[0]).toBe(pts[0]);
    expect(out[out.length - 1]).toBe(pts[1999]);
    const values = out.map((p) => p.value);
    expect(values).toContain(1000);
    expect(values).toContain(-50);
    for (let i = 1; i < out.length; i += 1) {
      expect((out[i] as { t: number }).t).toBeGreaterThan((out[i - 1] as { t: number }).t);
    }
  });

  it('handles all-equal values', () => {
    const out = downsample(
      series(2000, () => 5),
      100,
    );
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out[0]?.t).toBe(0);
    expect(out[out.length - 1]?.t).toBe(1999000);
  });

  it('throws RangeError when max < 4', () => {
    expect(() =>
      downsample(
        series(10, (i) => i),
        3,
      ),
    ).toThrow(RangeError);
  });
});
