import { describe, expect, it } from 'vitest';
import { formatDurationShort, formatElapsed, formatPreviousSet, formatWeight } from '../format';
import { lbToKg } from '../units';
import type { WorkoutSet } from '../../types/domain';

describe('formatElapsed', () => {
  it('formats mm:ss under an hour', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(999)).toBe('00:00');
    expect(formatElapsed(65_000)).toBe('01:05');
    expect(formatElapsed(3_599_999)).toBe('59:59');
  });
  it('formats h:mm:ss from one hour', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_723_000)).toBe('1:02:03');
    expect(formatElapsed(36_000_000)).toBe('10:00:00');
  });
  it('clamps negatives', () => {
    expect(formatElapsed(-500)).toBe('00:00');
  });
});

describe('formatDurationShort', () => {
  it('shows <1m under a minute', () => {
    expect(formatDurationShort(0)).toBe('<1m');
    expect(formatDurationShort(59_999)).toBe('<1m');
    expect(formatDurationShort(-1)).toBe('<1m');
  });
  it('shows minutes under an hour', () => {
    expect(formatDurationShort(60_000)).toBe('1m');
    expect(formatDurationShort(42 * 60_000)).toBe('42m');
    expect(formatDurationShort(59 * 60_000 + 59_000)).toBe('59m');
  });
  it('shows hours and minutes', () => {
    expect(formatDurationShort(72 * 60_000)).toBe('1h 12m');
    expect(formatDurationShort(60 * 60_000)).toBe('1h 0m');
  });
});

describe('formatWeight', () => {
  it('still formats weights', () => {
    expect(formatWeight(undefined, 'kg')).toBe('—');
    expect(formatWeight(100, 'kg', { withUnit: true })).toBe('100 kg');
  });
});

describe('formatPreviousSet', () => {
  const set = (over: Partial<WorkoutSet>): WorkoutSet => ({
    id: 's',
    order: 0,
    type: 'normal',
    completed: true,
    ...over,
  });
  it('shows a dash when there is no set', () => {
    expect(formatPreviousSet(undefined, 'weight_reps', 'lb')).toBe('—');
  });
  it('formats weight_reps in lb and kg', () => {
    const s = set({ weightKg: lbToKg(135), reps: 5 });
    expect(formatPreviousSet(s, 'weight_reps', 'lb')).toBe('135 × 5');
    expect(formatPreviousSet(set({ weightKg: 60, reps: 5 }), 'weight_reps', 'kg')).toBe('60 × 5');
  });
  it('shows dashes for missing weight_reps fields', () => {
    expect(formatPreviousSet(set({ reps: 5 }), 'weight_reps', 'kg')).toBe('— × 5');
    expect(formatPreviousSet(set({ weightKg: 60 }), 'weight_reps', 'kg')).toBe('60 × —');
  });
  it('formats bodyweight_reps', () => {
    expect(formatPreviousSet(set({ reps: 10 }), 'bodyweight_reps', 'kg')).toBe('BW × 10');
    expect(formatPreviousSet(set({}), 'bodyweight_reps', 'kg')).toBe('BW × —');
  });
  it('formats weighted_bodyweight with added weight only when above 0', () => {
    expect(formatPreviousSet(set({ weightKg: 20, reps: 8 }), 'weighted_bodyweight', 'kg')).toBe(
      '+20 × 8',
    );
    expect(
      formatPreviousSet(set({ weightKg: lbToKg(45), reps: 8 }), 'weighted_bodyweight', 'lb'),
    ).toBe('+45 × 8');
    expect(formatPreviousSet(set({ weightKg: 0, reps: 8 }), 'weighted_bodyweight', 'kg')).toBe(
      'BW × 8',
    );
    expect(formatPreviousSet(set({ reps: 8 }), 'weighted_bodyweight', 'kg')).toBe('BW × 8');
  });
  it('formats duration', () => {
    expect(formatPreviousSet(set({ durationSec: 90 }), 'duration', 'kg')).toBe('1:30');
    expect(formatPreviousSet(set({}), 'duration', 'kg')).toBe('—');
  });
});
