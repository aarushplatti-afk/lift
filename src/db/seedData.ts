import type { Equipment, ExerciseType, MuscleGroup } from '../types/domain';

export interface SeedExercise {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  type: ExerciseType;
}

export const SEED_VERSION = 1;

export const SEED_EXERCISES: readonly SeedExercise[] = [
  // Chest
  { name: 'Barbell Bench Press', muscleGroup: 'chest', equipment: 'barbell', type: 'weight_reps' },
  {
    name: 'Incline Barbell Bench Press',
    muscleGroup: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
  },
  {
    name: 'Dumbbell Bench Press',
    muscleGroup: 'chest',
    equipment: 'dumbbell',
    type: 'weight_reps',
  },
  {
    name: 'Incline Dumbbell Press',
    muscleGroup: 'chest',
    equipment: 'dumbbell',
    type: 'weight_reps',
  },
  { name: 'Machine Chest Press', muscleGroup: 'chest', equipment: 'machine', type: 'weight_reps' },
  { name: 'Cable Fly', muscleGroup: 'chest', equipment: 'cable', type: 'weight_reps' },
  { name: 'Dumbbell Fly', muscleGroup: 'chest', equipment: 'dumbbell', type: 'weight_reps' },
  { name: 'Push-Up', muscleGroup: 'chest', equipment: 'bodyweight', type: 'bodyweight_reps' },
  { name: 'Chest Dip', muscleGroup: 'chest', equipment: 'bodyweight', type: 'weighted_bodyweight' },
  // Back
  { name: 'Deadlift', muscleGroup: 'back', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Barbell Row', muscleGroup: 'back', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Dumbbell Row', muscleGroup: 'back', equipment: 'dumbbell', type: 'weight_reps' },
  { name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable', type: 'weight_reps' },
  { name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'cable', type: 'weight_reps' },
  { name: 'Pull-Up', muscleGroup: 'back', equipment: 'bodyweight', type: 'weighted_bodyweight' },
  { name: 'Chin-Up', muscleGroup: 'back', equipment: 'bodyweight', type: 'weighted_bodyweight' },
  { name: 'T-Bar Row', muscleGroup: 'back', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Face Pull', muscleGroup: 'back', equipment: 'cable', type: 'weight_reps' },
  { name: 'Straight-Arm Pulldown', muscleGroup: 'back', equipment: 'cable', type: 'weight_reps' },
  // Shoulders
  {
    name: 'Overhead Press (Barbell)',
    muscleGroup: 'shoulders',
    equipment: 'barbell',
    type: 'weight_reps',
  },
  {
    name: 'Seated Dumbbell Press',
    muscleGroup: 'shoulders',
    equipment: 'dumbbell',
    type: 'weight_reps',
  },
  { name: 'Arnold Press', muscleGroup: 'shoulders', equipment: 'dumbbell', type: 'weight_reps' },
  { name: 'Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', type: 'weight_reps' },
  {
    name: 'Cable Lateral Raise',
    muscleGroup: 'shoulders',
    equipment: 'cable',
    type: 'weight_reps',
  },
  { name: 'Rear Delt Fly', muscleGroup: 'shoulders', equipment: 'dumbbell', type: 'weight_reps' },
  { name: 'Upright Row', muscleGroup: 'shoulders', equipment: 'barbell', type: 'weight_reps' },
  {
    name: 'Machine Shoulder Press',
    muscleGroup: 'shoulders',
    equipment: 'machine',
    type: 'weight_reps',
  },
  // Biceps
  { name: 'Barbell Curl', muscleGroup: 'biceps', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Dumbbell Curl', muscleGroup: 'biceps', equipment: 'dumbbell', type: 'weight_reps' },
  { name: 'Hammer Curl', muscleGroup: 'biceps', equipment: 'dumbbell', type: 'weight_reps' },
  { name: 'Preacher Curl', muscleGroup: 'biceps', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Cable Curl', muscleGroup: 'biceps', equipment: 'cable', type: 'weight_reps' },
  {
    name: 'Incline Dumbbell Curl',
    muscleGroup: 'biceps',
    equipment: 'dumbbell',
    type: 'weight_reps',
  },
  // Triceps
  {
    name: 'Tricep Pushdown (Cable)',
    muscleGroup: 'triceps',
    equipment: 'cable',
    type: 'weight_reps',
  },
  { name: 'Skull Crusher', muscleGroup: 'triceps', equipment: 'barbell', type: 'weight_reps' },
  {
    name: 'Overhead Tricep Extension',
    muscleGroup: 'triceps',
    equipment: 'dumbbell',
    type: 'weight_reps',
  },
  {
    name: 'Close-Grip Bench Press',
    muscleGroup: 'triceps',
    equipment: 'barbell',
    type: 'weight_reps',
  },
  { name: 'Dip', muscleGroup: 'triceps', equipment: 'bodyweight', type: 'weighted_bodyweight' },
  { name: 'Tricep Kickback', muscleGroup: 'triceps', equipment: 'dumbbell', type: 'weight_reps' },
  // Quads
  { name: 'Back Squat', muscleGroup: 'quads', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Front Squat', muscleGroup: 'quads', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Leg Press', muscleGroup: 'quads', equipment: 'machine', type: 'weight_reps' },
  { name: 'Leg Extension', muscleGroup: 'quads', equipment: 'machine', type: 'weight_reps' },
  {
    name: 'Bulgarian Split Squat',
    muscleGroup: 'quads',
    equipment: 'dumbbell',
    type: 'weight_reps',
  },
  { name: 'Hack Squat', muscleGroup: 'quads', equipment: 'machine', type: 'weight_reps' },
  { name: 'Goblet Squat', muscleGroup: 'quads', equipment: 'dumbbell', type: 'weight_reps' },
  { name: 'Walking Lunge', muscleGroup: 'quads', equipment: 'dumbbell', type: 'weight_reps' },
  // Hamstrings
  {
    name: 'Romanian Deadlift',
    muscleGroup: 'hamstrings',
    equipment: 'barbell',
    type: 'weight_reps',
  },
  { name: 'Lying Leg Curl', muscleGroup: 'hamstrings', equipment: 'machine', type: 'weight_reps' },
  { name: 'Seated Leg Curl', muscleGroup: 'hamstrings', equipment: 'machine', type: 'weight_reps' },
  { name: 'Good Morning', muscleGroup: 'hamstrings', equipment: 'barbell', type: 'weight_reps' },
  {
    name: 'Stiff-Leg Deadlift',
    muscleGroup: 'hamstrings',
    equipment: 'barbell',
    type: 'weight_reps',
  },
  // Glutes
  { name: 'Hip Thrust', muscleGroup: 'glutes', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Glute Bridge', muscleGroup: 'glutes', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Cable Kickback', muscleGroup: 'glutes', equipment: 'cable', type: 'weight_reps' },
  { name: 'Sumo Deadlift', muscleGroup: 'glutes', equipment: 'barbell', type: 'weight_reps' },
  // Calves
  { name: 'Standing Calf Raise', muscleGroup: 'calves', equipment: 'machine', type: 'weight_reps' },
  { name: 'Seated Calf Raise', muscleGroup: 'calves', equipment: 'machine', type: 'weight_reps' },
  // Core
  { name: 'Plank', muscleGroup: 'core', equipment: 'bodyweight', type: 'duration' },
  {
    name: 'Hanging Leg Raise',
    muscleGroup: 'core',
    equipment: 'bodyweight',
    type: 'bodyweight_reps',
  },
  { name: 'Cable Crunch', muscleGroup: 'core', equipment: 'cable', type: 'weight_reps' },
  { name: 'Ab Wheel Rollout', muscleGroup: 'core', equipment: 'other', type: 'bodyweight_reps' },
  { name: 'Russian Twist', muscleGroup: 'core', equipment: 'other', type: 'weight_reps' },
  // Forearms
  { name: 'Wrist Curl', muscleGroup: 'forearms', equipment: 'dumbbell', type: 'weight_reps' },
  { name: 'Reverse Curl', muscleGroup: 'forearms', equipment: 'barbell', type: 'weight_reps' },
  { name: "Farmer's Carry", muscleGroup: 'forearms', equipment: 'dumbbell', type: 'duration' },
  // Cardio
  { name: 'Running', muscleGroup: 'cardio', equipment: 'bodyweight', type: 'duration' },
  { name: 'Cycling', muscleGroup: 'cardio', equipment: 'machine', type: 'duration' },
  { name: 'Rowing Machine', muscleGroup: 'cardio', equipment: 'machine', type: 'duration' },
  // Additions beyond PRD section 10
  { name: 'Decline Bench Press', muscleGroup: 'chest', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Pec Deck', muscleGroup: 'chest', equipment: 'machine', type: 'weight_reps' },
  { name: 'Incline Cable Fly', muscleGroup: 'chest', equipment: 'cable', type: 'weight_reps' },
  { name: 'Pendlay Row', muscleGroup: 'back', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Rack Pull', muscleGroup: 'back', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Barbell Shrug', muscleGroup: 'back', equipment: 'barbell', type: 'weight_reps' },
  { name: 'Chest-Supported Row', muscleGroup: 'back', equipment: 'machine', type: 'weight_reps' },
  { name: 'Inverted Row', muscleGroup: 'back', equipment: 'bodyweight', type: 'bodyweight_reps' },
  {
    name: 'Back Extension',
    muscleGroup: 'back',
    equipment: 'bodyweight',
    type: 'weighted_bodyweight',
  },
  { name: 'Front Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', type: 'weight_reps' },
  {
    name: 'Reverse Pec Deck',
    muscleGroup: 'shoulders',
    equipment: 'machine',
    type: 'weight_reps',
  },
  { name: 'EZ-Bar Curl', muscleGroup: 'biceps', equipment: 'barbell', type: 'weight_reps' },
  {
    name: 'Concentration Curl',
    muscleGroup: 'biceps',
    equipment: 'dumbbell',
    type: 'weight_reps',
  },
  {
    name: 'Cable Overhead Tricep Extension',
    muscleGroup: 'triceps',
    equipment: 'cable',
    type: 'weight_reps',
  },
  { name: 'Bench Dip', muscleGroup: 'triceps', equipment: 'bodyweight', type: 'bodyweight_reps' },
  { name: 'Smith Machine Squat', muscleGroup: 'quads', equipment: 'machine', type: 'weight_reps' },
  { name: 'Step-Up', muscleGroup: 'quads', equipment: 'dumbbell', type: 'weight_reps' },
  { name: 'Reverse Lunge', muscleGroup: 'quads', equipment: 'dumbbell', type: 'weight_reps' },
  {
    name: 'Nordic Hamstring Curl',
    muscleGroup: 'hamstrings',
    equipment: 'bodyweight',
    type: 'bodyweight_reps',
  },
  {
    name: 'Hip Abduction Machine',
    muscleGroup: 'glutes',
    equipment: 'machine',
    type: 'weight_reps',
  },
  { name: 'Cable Pull-Through', muscleGroup: 'glutes', equipment: 'cable', type: 'weight_reps' },
  {
    name: 'Leg Press Calf Raise',
    muscleGroup: 'calves',
    equipment: 'machine',
    type: 'weight_reps',
  },
  { name: 'Crunch', muscleGroup: 'core', equipment: 'bodyweight', type: 'bodyweight_reps' },
  { name: 'Dead Bug', muscleGroup: 'core', equipment: 'bodyweight', type: 'bodyweight_reps' },
  { name: 'Side Plank', muscleGroup: 'core', equipment: 'bodyweight', type: 'duration' },
  { name: 'Power Clean', muscleGroup: 'full_body', equipment: 'barbell', type: 'weight_reps' },
  {
    name: 'Kettlebell Swing',
    muscleGroup: 'full_body',
    equipment: 'kettlebell',
    type: 'weight_reps',
  },
  { name: 'Jump Rope', muscleGroup: 'cardio', equipment: 'other', type: 'duration' },
  { name: 'Stair Climber', muscleGroup: 'cardio', equipment: 'machine', type: 'duration' },
];
