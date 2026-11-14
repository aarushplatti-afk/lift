import type { ExerciseType, Unit, WorkoutSet } from '../../types/domain';
import { toDisplay } from '../units';

export const WEIGHT_SOFT_CAP = 2000;
export const REPS_SOFT_CAP = 999;

export type InvalidField = 'weight' | 'reps' | 'duration';
export type CompleteResult = { ok: true; completed: boolean } | { ok: false; field: InvalidField };

function validReps(reps: number | undefined): boolean {
  return reps !== undefined && Number.isInteger(reps) && reps >= 1;
}

export function canCompleteSet(
  set: WorkoutSet,
  type: ExerciseType,
): { ok: true } | { ok: false; field: InvalidField } {
  switch (type) {
    case 'weight_reps': {
      const w = set.weightKg;
      if (w === undefined || !Number.isFinite(w) || w <= 0) return { ok: false, field: 'weight' };
      return validReps(set.reps) ? { ok: true } : { ok: false, field: 'reps' };
    }
    case 'bodyweight_reps':
      return validReps(set.reps) ? { ok: true } : { ok: false, field: 'reps' };
    case 'weighted_bodyweight': {
      const w = set.weightKg;
      if (w !== undefined && (!Number.isFinite(w) || w < 0)) return { ok: false, field: 'weight' };
      return validReps(set.reps) ? { ok: true } : { ok: false, field: 'reps' };
    }
    case 'duration': {
      const d = set.durationSec;
      return d !== undefined && Number.isInteger(d) && d >= 1
        ? { ok: true }
        : { ok: false, field: 'duration' };
    }
  }
}

export function softWarnings(
  set: WorkoutSet,
  type: ExerciseType,
  unit: Unit,
): ('weight_high' | 'reps_high')[] {
  const out: ('weight_high' | 'reps_high')[] = [];
  const usesWeight = type === 'weight_reps' || type === 'weighted_bodyweight';
  const usesReps = type !== 'duration';
  if (
    usesWeight &&
    set.weightKg !== undefined &&
    Number.isFinite(set.weightKg) &&
    toDisplay(set.weightKg, unit) > WEIGHT_SOFT_CAP
  ) {
    out.push('weight_high');
  }
  if (usesReps && set.reps !== undefined && Number.isFinite(set.reps) && set.reps > REPS_SOFT_CAP) {
    out.push('reps_high');
  }
  return out;
}

export function isEmptySet(set: WorkoutSet): boolean {
  return set.weightKg === undefined && set.reps === undefined && set.durationSec === undefined;
}
