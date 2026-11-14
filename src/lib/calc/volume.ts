import type {
  ExerciseType,
  SetType,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../../types/domain';
import { canCompleteSet } from './validation';

export type ExerciseTypes = ReadonlyMap<string, ExerciseType>;

export const EXCLUDED_SET_TYPES: readonly SetType[] = ['warmup'];

export function setVolume(set: WorkoutSet, type: ExerciseType): number {
  if (!set.completed) return 0;
  if (EXCLUDED_SET_TYPES.includes(set.type)) return 0;
  if (type !== 'weight_reps' && type !== 'weighted_bodyweight') return 0;
  if (!canCompleteSet(set, type).ok) return 0;
  const weight = set.weightKg ?? 0;
  if (weight <= 0) return 0;
  return weight * (set.reps ?? 0);
}

export function exerciseVolume(we: WorkoutExercise, type: ExerciseType): number {
  let total = 0;
  for (const s of we.sets) total += setVolume(s, type);
  return total;
}

export function workoutVolume(w: Workout, types: ExerciseTypes): number {
  let total = 0;
  for (const we of w.exercises) {
    total += exerciseVolume(we, types.get(we.exerciseId) ?? 'weight_reps');
  }
  return total;
}

export function completedSetCount(w: Workout, types?: ExerciseTypes): number {
  let n = 0;
  for (const we of w.exercises) {
    const type = types?.get(we.exerciseId) ?? 'weight_reps';
    for (const s of we.sets) {
      if (s.completed && canCompleteSet(s, type).ok) n += 1;
    }
  }
  return n;
}
