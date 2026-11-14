import type { Workout, WorkoutSet } from '../../types/domain';
import { canCompleteSet, isEmptySet } from './validation';
import type { ExerciseTypes } from './volume';

export interface FinishPlan {
  incompleteCount: number;
  cleaned: Workout;
  isEmpty: boolean;
}

export function prepareFinish(
  w: Workout,
  types: ExerciseTypes,
  opts: { markIncomplete: boolean; now: number },
): FinishPlan {
  let incompleteCount = 0;
  const exercises = [];

  for (const we of w.exercises) {
    const type = types.get(we.exerciseId) ?? 'weight_reps';
    const kept: WorkoutSet[] = [];
    for (const s of we.sets) {
      const done = s.completed && canCompleteSet(s, type).ok;
      if (done) {
        kept.push(s);
        continue;
      }
      if (isEmptySet(s)) continue;
      incompleteCount += 1;
      if (opts.markIncomplete && canCompleteSet(s, type).ok) {
        kept.push({ ...s, completed: true, completedAt: opts.now });
      }
    }
    if (kept.length === 0) continue;
    exercises.push({ ...we, sets: kept.map((s, i) => ({ ...s, order: i })) });
  }

  const cleaned: Workout = {
    ...w,
    exercises: exercises.map((we, i) => ({ ...we, order: i })),
  };
  return { incompleteCount, cleaned, isEmpty: cleaned.exercises.length === 0 };
}
