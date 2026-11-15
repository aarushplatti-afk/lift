import { describe, expect, it } from 'vitest';
import { buildProgressHistory } from '../../../test/fixtures/progressHistory';
import type { Workout } from '../../../types/domain';
import { resolveRange } from '../range';
import { downsample, exerciseSeries } from '../series';

const BENCH = 'fx-bench';

function run(workouts: readonly Workout[], now: number) {
  const series = exerciseSeries(BENCH, workouts, 'weight', 'weight_reps');
  const resolved = resolveRange(series, 'All', now);
  return { series, shown: downsample(resolved.points) };
}

describe('series performance', () => {
  const { workouts } = buildProgressHistory({ workoutCount: 2000 });
  const now = Math.max(...workouts.map((w) => w.startedAt)) + 86_400_000;

  it('builds, resolves All and downsamples 2000 workouts in under 250 ms', () => {
    const start = performance.now();
    const { series, shown } = run(workouts, now);
    const elapsed = performance.now() - start;
    expect(series).toHaveLength(2000);
    expect(shown.length).toBeLessThanOrEqual(500);
    expect(elapsed).toBeLessThan(250);
  });

  it('is deterministic', () => {
    const a = run(workouts, now).shown.map((p) => [p.t, p.value]);
    const b = run(buildProgressHistory({ workoutCount: 2000 }).workouts, now).shown.map((p) => [
      p.t,
      p.value,
    ]);
    expect(b).toEqual(a);
  });
});
