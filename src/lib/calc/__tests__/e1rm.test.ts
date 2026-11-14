import { describe, expect, it } from 'vitest';
import { E1RM_MAX_REPS, epley, setE1rm } from '../e1rm';
import { mkSet } from './fixtures';

describe('epley', () => {
  it('returns weight unchanged for 1 rep', () => {
    expect(epley(100, 1)).toBe(100);
  });
  it('computes 225 x 5 = 262.5', () => {
    expect(epley(225, 5)).toBeCloseTo(262.5, 10);
  });
  it('handles 2 and 12 reps', () => {
    expect(epley(90, 2)).toBeCloseTo(96, 10);
    expect(epley(60, 12)).toBeCloseTo(84, 10);
    expect(E1RM_MAX_REPS).toBe(12);
  });
  it('is undefined for reps 0, 13, negative, fractional, NaN, undefined', () => {
    for (const r of [0, 13, -1, 2.5, NaN, undefined]) {
      expect(epley(100, r)).toBeUndefined();
    }
  });
  it('is undefined for weight 0, negative, NaN, Infinity, undefined', () => {
    for (const w of [0, -5, NaN, Infinity, undefined]) {
      expect(epley(w, 5)).toBeUndefined();
    }
  });
});

describe('setE1rm', () => {
  it('computes for completed normal weight_reps set', () => {
    expect(setE1rm(mkSet('a', { weightKg: 225, reps: 5 }), 'weight_reps')).toBeCloseTo(262.5, 10);
  });
  it('is undefined for incomplete sets', () => {
    expect(
      setE1rm(mkSet('a', { weightKg: 100, reps: 5, completed: false }), 'weight_reps'),
    ).toBeUndefined();
  });
  it('is undefined for warmup sets', () => {
    expect(
      setE1rm(mkSet('a', { weightKg: 100, reps: 5, type: 'warmup' }), 'weight_reps'),
    ).toBeUndefined();
  });
  it('counts drop and failure sets', () => {
    expect(setE1rm(mkSet('a', { weightKg: 100, reps: 1, type: 'drop' }), 'weight_reps')).toBe(100);
    expect(setE1rm(mkSet('a', { weightKg: 100, reps: 1, type: 'failure' }), 'weight_reps')).toBe(
      100,
    );
  });
  it('is undefined for bodyweight_reps and duration', () => {
    const s = mkSet('a', { weightKg: 100, reps: 5, durationSec: 60 });
    expect(setE1rm(s, 'bodyweight_reps')).toBeUndefined();
    expect(setE1rm(s, 'duration')).toBeUndefined();
  });
  it('weighted_bodyweight requires added weight > 0', () => {
    expect(setE1rm(mkSet('a', { weightKg: 0, reps: 5 }), 'weighted_bodyweight')).toBeUndefined();
    expect(setE1rm(mkSet('a', { reps: 5 }), 'weighted_bodyweight')).toBeUndefined();
    expect(setE1rm(mkSet('a', { weightKg: 20, reps: 1 }), 'weighted_bodyweight')).toBe(20);
  });
  it('is undefined above 12 reps', () => {
    expect(setE1rm(mkSet('a', { weightKg: 50, reps: 13 }), 'weight_reps')).toBeUndefined();
  });
});
