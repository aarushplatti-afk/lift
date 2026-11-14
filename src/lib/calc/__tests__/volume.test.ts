import { describe, expect, it } from 'vitest';
import type { ExerciseType } from '../../../types/domain';
import {
  completedSetCount,
  EXCLUDED_SET_TYPES,
  exerciseVolume,
  setVolume,
  workoutVolume,
} from '../volume';
import { mkEx, mkSet, mkWorkout } from './fixtures';

describe('setVolume', () => {
  it('multiplies weight by reps for weight_reps', () => {
    expect(setVolume(mkSet('a', { weightKg: 100, reps: 5 }), 'weight_reps')).toBe(500);
  });
  it('excludes warmups', () => {
    expect(EXCLUDED_SET_TYPES).toEqual(['warmup']);
    expect(setVolume(mkSet('a', { weightKg: 100, reps: 5, type: 'warmup' }), 'weight_reps')).toBe(
      0,
    );
  });
  it('includes drop and failure sets', () => {
    expect(setVolume(mkSet('a', { weightKg: 10, reps: 5, type: 'drop' }), 'weight_reps')).toBe(50);
    expect(setVolume(mkSet('a', { weightKg: 10, reps: 5, type: 'failure' }), 'weight_reps')).toBe(
      50,
    );
  });
  it('excludes incomplete sets', () => {
    expect(setVolume(mkSet('a', { weightKg: 100, reps: 5, completed: false }), 'weight_reps')).toBe(
      0,
    );
  });
  it('excludes invalid completed sets', () => {
    expect(setVolume(mkSet('a', { weightKg: 100 }), 'weight_reps')).toBe(0);
    expect(setVolume(mkSet('a', { weightKg: 0, reps: 5 }), 'weight_reps')).toBe(0);
  });
  it('is 0 for bodyweight_reps and duration', () => {
    expect(setVolume(mkSet('a', { weightKg: 50, reps: 10 }), 'bodyweight_reps')).toBe(0);
    expect(setVolume(mkSet('a', { weightKg: 50, reps: 10, durationSec: 30 }), 'duration')).toBe(0);
  });
  it('weighted_bodyweight with 0 added is 0, with 20 added counts', () => {
    expect(setVolume(mkSet('a', { weightKg: 0, reps: 10 }), 'weighted_bodyweight')).toBe(0);
    expect(setVolume(mkSet('a', { reps: 10 }), 'weighted_bodyweight')).toBe(0);
    expect(setVolume(mkSet('a', { weightKg: 20, reps: 10 }), 'weighted_bodyweight')).toBe(200);
  });
});

describe('exerciseVolume / workoutVolume', () => {
  const types = new Map<string, ExerciseType>([
    ['bench', 'weight_reps'],
    ['pullup', 'bodyweight_reps'],
  ]);
  it('sums sets of a block', () => {
    const we = mkEx('e1', 'bench', [
      mkSet('a', { weightKg: 100, reps: 5 }),
      mkSet('b', { weightKg: 100, reps: 3 }),
      mkSet('c', { weightKg: 20, reps: 10, type: 'warmup' }),
    ]);
    expect(exerciseVolume(we, 'weight_reps')).toBe(800);
  });
  it('sums blocks, skipping bodyweight, and falls back to weight_reps for unknown ids', () => {
    const w = mkWorkout('w', [
      mkEx('e1', 'bench', [mkSet('a', { weightKg: 100, reps: 5 })]),
      mkEx('e2', 'pullup', [mkSet('b', { reps: 10 })], 1),
      mkEx('e3', 'gone', [mkSet('c', { weightKg: 10, reps: 10 })], 2),
    ]);
    expect(workoutVolume(w, types)).toBe(600);
  });
  it('is 0 for an empty workout', () => {
    expect(workoutVolume(mkWorkout('w', []), types)).toBe(0);
    expect(exerciseVolume(mkEx('e', 'bench', []), 'weight_reps')).toBe(0);
  });
});

describe('completedSetCount', () => {
  it('counts valid completed sets of every set type', () => {
    const w = mkWorkout('w', [
      mkEx('e1', 'bench', [
        mkSet('a', { weightKg: 100, reps: 5 }),
        mkSet('b', { weightKg: 50, reps: 5, type: 'warmup' }),
        mkSet('c', { weightKg: 100, reps: 5, completed: false }),
        mkSet('d', { weightKg: 100 }),
      ]),
    ]);
    expect(completedSetCount(w)).toBe(2);
  });
  it('uses exercise types when supplied', () => {
    const w = mkWorkout('w', [mkEx('e1', 'plank', [mkSet('a', { durationSec: 60 })])]);
    expect(completedSetCount(w)).toBe(0);
    expect(completedSetCount(w, new Map<string, ExerciseType>([['plank', 'duration']]))).toBe(1);
  });
  it('is 0 for an empty workout', () => {
    expect(completedSetCount(mkWorkout('w', []))).toBe(0);
  });
});
