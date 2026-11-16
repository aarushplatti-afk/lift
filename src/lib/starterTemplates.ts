import type { TemplateExercise } from '../types/domain';

export type StarterKey = 'push' | 'pull' | 'legs';

export interface StarterTemplateDef {
  key: StarterKey;
  name: string;
  exercises: readonly { name: string; sets: number; targetReps: number }[];
}

export const STARTER_TEMPLATES: readonly StarterTemplateDef[] = [
  {
    key: 'push',
    name: 'Push Day',
    exercises: [
      { name: 'Barbell Bench Press', sets: 3, targetReps: 8 },
      { name: 'Overhead Press (Barbell)', sets: 3, targetReps: 8 },
      { name: 'Incline Dumbbell Press', sets: 3, targetReps: 10 },
      { name: 'Lateral Raise', sets: 3, targetReps: 12 },
      { name: 'Tricep Pushdown (Cable)', sets: 3, targetReps: 12 },
    ],
  },
  {
    key: 'pull',
    name: 'Pull Day',
    exercises: [
      { name: 'Deadlift', sets: 3, targetReps: 5 },
      { name: 'Lat Pulldown', sets: 3, targetReps: 10 },
      { name: 'Barbell Row', sets: 3, targetReps: 8 },
      { name: 'Face Pull', sets: 3, targetReps: 15 },
      { name: 'Barbell Curl', sets: 3, targetReps: 10 },
      { name: 'Hammer Curl', sets: 3, targetReps: 12 },
    ],
  },
  {
    key: 'legs',
    name: 'Leg Day',
    exercises: [
      { name: 'Back Squat', sets: 3, targetReps: 8 },
      { name: 'Romanian Deadlift', sets: 3, targetReps: 10 },
      { name: 'Leg Press', sets: 3, targetReps: 10 },
      { name: 'Lying Leg Curl', sets: 3, targetReps: 12 },
      { name: 'Standing Calf Raise', sets: 3, targetReps: 15 },
    ],
  },
];

export function buildStarterExercises(
  def: StarterTemplateDef,
  resolve: (name: string) => string | undefined,
): TemplateExercise[] {
  const out: TemplateExercise[] = [];
  for (const e of def.exercises) {
    const exerciseId = resolve(e.name);
    if (exerciseId === undefined) continue;
    out.push({
      exerciseId,
      order: out.length,
      sets: Array.from({ length: e.sets }, () => ({
        type: 'normal' as const,
        targetReps: e.targetReps,
      })),
    });
  }
  return out;
}
