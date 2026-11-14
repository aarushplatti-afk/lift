import { describe, expect, it } from 'vitest';
import type { ExerciseType } from '../../../types/domain';
import { lbToKg } from '../../units';
import { canCompleteSet, isEmptySet, softWarnings } from '../validation';
import { mkSet } from './fixtures';

const ok = { ok: true };
const bad = (field: string) => ({ ok: false, field });

describe('canCompleteSet weight_reps', () => {
  const t: ExerciseType = 'weight_reps';
  it('accepts valid weight and reps', () => {
    expect(canCompleteSet(mkSet('a', { weightKg: 50, reps: 5 }), t)).toEqual(ok);
  });
  it('checks weight first', () => {
    expect(canCompleteSet(mkSet('a'), t)).toEqual(bad('weight'));
    expect(canCompleteSet(mkSet('a', { reps: 5 }), t)).toEqual(bad('weight'));
  });
  it('refuses weight 0, negative, NaN, Infinity', () => {
    for (const w of [0, -1, NaN, Infinity]) {
      expect(canCompleteSet(mkSet('a', { weightKg: w, reps: 5 }), t)).toEqual(bad('weight'));
    }
  });
  it('refuses blank, 0, negative, NaN, fractional reps', () => {
    for (const r of [undefined, 0, -1, NaN, 2.5]) {
      const s = mkSet('a', { weightKg: 50, ...(r === undefined ? {} : { reps: r }) });
      expect(canCompleteSet(s, t)).toEqual(bad('reps'));
    }
  });
});

describe('canCompleteSet bodyweight_reps', () => {
  const t: ExerciseType = 'bodyweight_reps';
  it('ignores weight', () => {
    expect(canCompleteSet(mkSet('a', { reps: 8 }), t)).toEqual(ok);
    expect(canCompleteSet(mkSet('a', { reps: 8, weightKg: NaN }), t)).toEqual(ok);
  });
  it('refuses invalid reps', () => {
    for (const r of [undefined, 0, -3, NaN, 1.5]) {
      const s = mkSet('a', r === undefined ? {} : { reps: r });
      expect(canCompleteSet(s, t)).toEqual(bad('reps'));
    }
  });
});

describe('canCompleteSet weighted_bodyweight', () => {
  const t: ExerciseType = 'weighted_bodyweight';
  it('treats blank and 0 weight as valid', () => {
    expect(canCompleteSet(mkSet('a', { reps: 5 }), t)).toEqual(ok);
    expect(canCompleteSet(mkSet('a', { reps: 5, weightKg: 0 }), t)).toEqual(ok);
  });
  it('refuses negative or NaN weight', () => {
    expect(canCompleteSet(mkSet('a', { reps: 5, weightKg: -2 }), t)).toEqual(bad('weight'));
    expect(canCompleteSet(mkSet('a', { reps: 5, weightKg: NaN }), t)).toEqual(bad('weight'));
  });
  it('refuses invalid reps', () => {
    for (const r of [undefined, 0, -1, NaN, 2.2]) {
      const s = mkSet('a', { weightKg: 10, ...(r === undefined ? {} : { reps: r }) });
      expect(canCompleteSet(s, t)).toEqual(bad('reps'));
    }
  });
});

describe('canCompleteSet duration', () => {
  const t: ExerciseType = 'duration';
  it('accepts integer seconds >= 1', () => {
    expect(canCompleteSet(mkSet('a', { durationSec: 1 }), t)).toEqual(ok);
    expect(canCompleteSet(mkSet('a', { durationSec: 90 }), t)).toEqual(ok);
  });
  it('refuses blank, 0, negative, NaN, fractional', () => {
    for (const d of [undefined, 0, -5, NaN, 1.5]) {
      const s = mkSet('a', d === undefined ? {} : { durationSec: d });
      expect(canCompleteSet(s, t)).toEqual(bad('duration'));
    }
  });
  it('ignores reps', () => {
    expect(canCompleteSet(mkSet('a', { reps: 5 }), t)).toEqual(bad('duration'));
  });
});

describe('softWarnings', () => {
  it('lb cap is measured in display unit', () => {
    const at = mkSet('a', { weightKg: lbToKg(2000), reps: 1 });
    const over = mkSet('a', { weightKg: lbToKg(2000.1), reps: 1 });
    expect(softWarnings(at, 'weight_reps', 'lb')).toEqual([]);
    expect(softWarnings(over, 'weight_reps', 'lb')).toEqual(['weight_high']);
  });
  it('kg and lb behave differently', () => {
    const s = mkSet('a', { weightKg: 1500, reps: 1 });
    expect(softWarnings(s, 'weight_reps', 'kg')).toEqual([]);
    expect(softWarnings(s, 'weight_reps', 'lb')).toEqual(['weight_high']);
    const s2 = mkSet('a', { weightKg: 2000.1, reps: 1 });
    expect(softWarnings(s2, 'weight_reps', 'kg')).toEqual(['weight_high']);
  });
  it('reps cap', () => {
    expect(softWarnings(mkSet('a', { reps: 999 }), 'bodyweight_reps', 'kg')).toEqual([]);
    expect(softWarnings(mkSet('a', { reps: 1000 }), 'bodyweight_reps', 'kg')).toEqual([
      'reps_high',
    ]);
  });
  it('returns both when both exceeded', () => {
    const s = mkSet('a', { weightKg: 5000, reps: 5000 });
    expect(softWarnings(s, 'weight_reps', 'kg')).toEqual(['weight_high', 'reps_high']);
  });
  it('ignores weight for bodyweight_reps and anything for duration', () => {
    expect(softWarnings(mkSet('a', { weightKg: 9999, reps: 1 }), 'bodyweight_reps', 'kg')).toEqual(
      [],
    );
    expect(
      softWarnings(mkSet('a', { weightKg: 9999, reps: 5000, durationSec: 5 }), 'duration', 'kg'),
    ).toEqual([]);
  });
  it('ignores non-finite values', () => {
    expect(softWarnings(mkSet('a', { weightKg: NaN, reps: NaN }), 'weight_reps', 'kg')).toEqual([]);
  });
});

describe('isEmptySet', () => {
  it('is empty only when all three fields are undefined', () => {
    expect(isEmptySet(mkSet('a', { completed: false }))).toBe(true);
    expect(isEmptySet(mkSet('a', { weightKg: 0 }))).toBe(false);
    expect(isEmptySet(mkSet('a', { reps: 0 }))).toBe(false);
    expect(isEmptySet(mkSet('a', { durationSec: 0 }))).toBe(false);
  });
});
