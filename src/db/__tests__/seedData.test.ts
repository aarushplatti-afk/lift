import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES } from '../seedData';
import type { Equipment, ExerciseType, MuscleGroup } from '../../types/domain';

const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
  'full_body',
  'cardio',
  'other',
];

const EQUIPMENT: readonly Equipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'other',
];

const EXERCISE_TYPES: readonly ExerciseType[] = [
  'weight_reps',
  'bodyweight_reps',
  'weighted_bodyweight',
  'duration',
];

/** PRD section 10 lists 69 starter exercises (9+10+8+6+6+8+5+4+2+5+3+3). */
const PRD_SECTION_10_COUNT = 69;

describe('SEED_EXERCISES', () => {
  it('is non-empty', () => {
    expect(SEED_EXERCISES.length).toBeGreaterThan(0);
  });

  it('matches the PRD section 10 count', () => {
    expect(SEED_EXERCISES).toHaveLength(PRD_SECTION_10_COUNT);
  });

  it('has trimmed names', () => {
    for (const ex of SEED_EXERCISES) {
      expect(ex.name).toBe(ex.name.trim());
    }
  });

  it('has unique names (case-insensitive)', () => {
    const lower = SEED_EXERCISES.map((ex) => ex.name.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it('uses only valid muscle groups, equipment, and exercise types', () => {
    for (const ex of SEED_EXERCISES) {
      expect(MUSCLE_GROUPS).toContain(ex.muscleGroup);
      expect(EQUIPMENT).toContain(ex.equipment);
      expect(EXERCISE_TYPES).toContain(ex.type);
    }
  });
});
