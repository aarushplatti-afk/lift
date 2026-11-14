import type { Workout, WorkoutExercise, WorkoutSet } from '../../../types/domain';

export function mkSet(id: string, over: Partial<WorkoutSet> = {}): WorkoutSet {
  return { id, order: 0, type: 'normal', completed: true, ...over };
}

export function mkEx(
  id: string,
  exerciseId: string,
  sets: WorkoutSet[],
  order = 0,
): WorkoutExercise {
  return { id, exerciseId, order, sets: sets.map((s, i) => ({ ...s, order: i })) };
}

export function mkWorkout(
  id: string,
  exercises: WorkoutExercise[],
  over: Partial<Workout> = {},
): Workout {
  return {
    id,
    userId: 'u',
    name: 'W',
    startedAt: 1000,
    status: 'completed',
    exercises,
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}
