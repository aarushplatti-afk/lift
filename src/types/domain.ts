export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'forearms'
  | 'full_body'
  | 'cardio'
  | 'other';
export type Equipment =
  'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'other';
export type ExerciseType = 'weight_reps' | 'bodyweight_reps' | 'weighted_bodyweight' | 'duration';
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
export type Unit = 'lb' | 'kg';
export type ThemePref = 'dark' | 'light' | 'system';

/** updatedAt is epoch ms; replaced by the server updated_at on pull. */
export interface SyncMeta {
  userId: string;
  updatedAt: number;
}

export interface Exercise extends SyncMeta {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  type: ExerciseType;
  isCustom: boolean;
  archived: boolean;
  notes?: string;
  createdAt: number;
}

export interface WorkoutSet {
  id: string;
  order: number;
  type: SetType;
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  completed: boolean;
  completedAt?: number;
  isPR?: boolean;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  order: number;
  notes?: string;
  restSeconds?: number;
  sets: WorkoutSet[];
}

export interface Workout extends SyncMeta {
  id: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  status: 'in_progress' | 'completed';
  templateId?: string;
  notes?: string;
  exercises: WorkoutExercise[];
  createdAt: number;
}

export interface TemplateSet {
  type: SetType;
  targetReps?: number;
  targetWeightKg?: number;
  targetDurationSec?: number;
}

export interface TemplateExercise {
  exerciseId: string;
  order: number;
  restSeconds?: number;
  sets: TemplateSet[];
}

export interface Template extends SyncMeta {
  id: string;
  name: string;
  exercises: TemplateExercise[];
  createdAt: number;
  lastUsedAt?: number;
}

export interface BodyweightEntry extends SyncMeta {
  id: string;
  /** YYYY-MM-DD, local date */
  date: string;
  weightKg: number;
  note?: string;
  createdAt: number;
}

export interface SettingsData {
  unit: Unit;
  theme: ThemePref;
  defaultRestSeconds: number;
  restTimerAutoStart: boolean;
  keepScreenAwakeDuringWorkout: boolean;
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  weightIncrementLb: number;
  weightIncrementKg: number;
  bodyweightGoalKg?: number;
  schemaVersion: number;
}

export interface Settings extends SettingsData, SyncMeta {
  id: 'singleton';
}
