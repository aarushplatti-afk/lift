import { describe, expect, it } from 'vitest';
import type { Workout } from '../../../types/domain';
import { buildProgressHistory } from '../progressHistory';

const BENCH_ID = 'fx-bench';

function countSets(workouts: Workout[]): number {
  return workouts.reduce(
    (total, w) => total + w.exercises.reduce((n, e) => n + e.sets.length, 0),
    0,
  );
}

describe('buildProgressHistory', () => {
  it('is deterministic for the same seed', () => {
    const a = buildProgressHistory({ workoutCount: 200, seed: 7 });
    const b = buildProgressHistory({ workoutCount: 200, seed: 7 });
    expect(a).toEqual(b);
  });

  it('yields at least 2000 sets by default', () => {
    const { workouts } = buildProgressHistory();
    expect(countSets(workouts)).toBeGreaterThanOrEqual(2000);
  });

  it('uses all four exercise types', () => {
    const { exercises, workouts } = buildProgressHistory({ workoutCount: 50 });
    const typeById = new Map(exercises.map((e) => [e.id, e.type]));
    const usedTypes = new Set(
      workouts.flatMap((w) => w.exercises.map((e) => typeById.get(e.exerciseId))),
    );
    expect(usedTypes.size).toBe(4);
  });

  it('has exactly one in-progress workout, with no endedAt', () => {
    const { workouts } = buildProgressHistory({ workoutCount: 50 });
    const inProgress = workouts.filter((w) => w.status === 'in_progress');
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0]?.endedAt).toBeUndefined();
  });

  it('yields 2000 completed Bench workouts for workoutCount 2000', () => {
    const { workouts } = buildProgressHistory({ workoutCount: 2000 });
    const completedBench = workouts.filter(
      (w) => w.status === 'completed' && w.exercises.some((e) => e.exerciseId === BENCH_ID),
    );
    expect(completedBench).toHaveLength(2000);
  });
});
