import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES, SEED_VERSION } from '../seedData';
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  nameKey,
  normalizeName,
} from '../../lib/exercises';
import type { ExerciseType } from '../../types/domain';

const PRD_ANNOTATED_TYPES: Record<string, ExerciseType> = {
  'Pull-Up': 'weighted_bodyweight',
  'Chin-Up': 'weighted_bodyweight',
  Dip: 'weighted_bodyweight',
  'Chest Dip': 'weighted_bodyweight',
  'Push-Up': 'bodyweight_reps',
  'Hanging Leg Raise': 'bodyweight_reps',
  'Ab Wheel Rollout': 'bodyweight_reps',
  Plank: 'duration',
  "Farmer's Carry": 'duration',
  Running: 'duration',
  Cycling: 'duration',
  'Rowing Machine': 'duration',
};

describe('SEED_EXERCISES', () => {
  it('has a positive integer SEED_VERSION', () => {
    expect(Number.isInteger(SEED_VERSION)).toBe(true);
    expect(SEED_VERSION).toBeGreaterThan(0);
  });

  it('has 80 to 100 entries (98 expected)', () => {
    expect(SEED_EXERCISES.length).toBeGreaterThanOrEqual(80);
    expect(SEED_EXERCISES.length).toBeLessThanOrEqual(100);
    expect(SEED_EXERCISES).toHaveLength(98);
  });

  it('has normalized names', () => {
    for (const ex of SEED_EXERCISES) {
      expect(ex.name).toBe(normalizeName(ex.name));
    }
  });

  it('has unique nameKeys', () => {
    const keys = SEED_EXERCISES.map((ex) => nameKey(ex.name));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses only valid muscle groups, equipment, and exercise types', () => {
    for (const ex of SEED_EXERCISES) {
      expect(MUSCLE_GROUPS.map((m) => m.value)).toContain(ex.muscleGroup);
      expect(EQUIPMENT.map((e) => e.value)).toContain(ex.equipment);
      expect(EXERCISE_TYPES.map((t) => t.value)).toContain(ex.type);
    }
  });

  it('keeps the PRD-annotated types', () => {
    for (const [name, type] of Object.entries(PRD_ANNOTATED_TYPES)) {
      const found = SEED_EXERCISES.find((ex) => ex.name === name);
      expect(found, name).toBeDefined();
      expect(found?.type, name).toBe(type);
    }
  });
});
