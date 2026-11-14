import type { ExerciseType, WorkoutSet } from '../../types/domain';

export const E1RM_MAX_REPS = 12;

export function epley(weightKg: number | undefined, reps: number | undefined): number | undefined {
  if (weightKg === undefined || !Number.isFinite(weightKg) || weightKg <= 0) return undefined;
  if (reps === undefined || !Number.isInteger(reps) || reps < 1 || reps > E1RM_MAX_REPS) {
    return undefined;
  }
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function setE1rm(set: WorkoutSet, type: ExerciseType): number | undefined {
  if (!set.completed || set.type === 'warmup') return undefined;
  if (type !== 'weight_reps' && type !== 'weighted_bodyweight') return undefined;
  return epley(set.weightKg, set.reps);
}
