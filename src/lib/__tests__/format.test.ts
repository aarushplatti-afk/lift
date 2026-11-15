import { describe, expect, it } from 'vitest';
import {
  formatDurationShort,
  formatElapsed,
  formatLastUsed,
  formatPreviousSet,
  formatSetDetail,
  formatVolume,
  formatWeight,
  formatWorkoutDate,
  formatWorkoutDateTime,
} from '../format';
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

describe('formatLastUsed', () => {
  const at = (y: number, m: number, d: number, h = 12): number =>
    new Date(y, m - 1, d, h).getTime();

  it('handles never used and same day', () => {
    expect(formatLastUsed(undefined, at(2026, 11, 14))).toBe('Never used');
    expect(formatLastUsed(at(2026, 11, 14, 0), at(2026, 11, 14, 23))).toBe('Used today');
  });

  it('treats a future timestamp as today', () => {
    expect(formatLastUsed(at(2026, 11, 15), at(2026, 11, 14))).toBe('Used today');
  });

  it('compares calendar days, not 24h spans', () => {
    expect(formatLastUsed(at(2026, 11, 13, 23), at(2026, 11, 14, 1))).toBe('Used yesterday');
  });

  it('uses days for 2-6 days and weeks for 7-34 days', () => {
    expect(formatLastUsed(at(2026, 11, 8), at(2026, 11, 14))).toBe('Used 6 days ago');
    expect(formatLastUsed(at(2026, 11, 7), at(2026, 11, 14))).toBe('Used 1 week ago');
    expect(formatLastUsed(at(2026, 11, 1), at(2026, 11, 14))).toBe('Used 1 week ago');
    expect(formatLastUsed(at(2026, 10, 11), at(2026, 11, 14))).toBe('Used 4 weeks ago');
  });

  it('is exact across the US spring-forward and fall-back changes', () => {
    expect(formatLastUsed(at(2026, 3, 7, 23), at(2026, 3, 9, 0))).toBe('Used 2 days ago');
    expect(formatLastUsed(at(2026, 3, 8, 12), at(2026, 3, 9, 12))).toBe('Used yesterday');
    expect(formatLastUsed(at(2026, 10, 31, 12), at(2026, 11, 2, 0))).toBe('Used 2 days ago');
    expect(formatLastUsed(at(2026, 11, 1, 12), at(2026, 11, 2, 12))).toBe('Used yesterday');
  });

  it('shows a date from 35 days, with the year only when it differs', () => {
    expect(formatLastUsed(at(2026, 10, 10), at(2026, 11, 14))).toBe('Used Oct 10');
    expect(formatLastUsed(at(2025, 11, 2), at(2026, 1, 20))).toBe('Used Nov 2, 2025');
  });

  it('crosses a year boundary by calendar day', () => {
    expect(formatLastUsed(at(2025, 12, 31, 23), at(2026, 1, 1, 1))).toBe('Used yesterday');
    expect(formatLastUsed(at(2025, 12, 30), at(2026, 1, 2))).toBe('Used 3 days ago');
  });
});

describe('formatWorkoutDate', () => {
  const nov12 = new Date(2026, 10, 12, 18, 5).getTime();
  it('formats weekday, month and day', () => {
    expect(formatWorkoutDate(nov12)).toBe('Thu, Nov 12');
  });
  it('adds the year only when now is given and the year differs', () => {
    expect(formatWorkoutDate(nov12, new Date(2026, 11, 1).getTime())).toBe('Thu, Nov 12');
    expect(formatWorkoutDate(nov12, new Date(2027, 0, 1).getTime())).toBe('Thu, Nov 12, 2026');
  });
});

describe('formatWorkoutDateTime', () => {
  it('formats date and 12-hour time', () => {
    expect(formatWorkoutDateTime(new Date(2026, 10, 12, 18, 5).getTime())).toBe(
      'Thu, Nov 12, 2026 · 6:05 PM',
    );
    expect(formatWorkoutDateTime(new Date(2026, 10, 12, 0, 7).getTime())).toBe(
      'Thu, Nov 12, 2026 · 12:07 AM',
    );
  });
});

describe('formatVolume', () => {
  it('rounds and groups in lb', () => {
    expect(formatVolume(lbToKg(12345.6), 'lb')).toBe('12,346 lb');
  });
  it('rounds and groups in kg', () => {
    expect(formatVolume(1234.4, 'kg')).toBe('1,234 kg');
    expect(formatVolume(0, 'kg')).toBe('0 kg');
  });
});

describe('formatSetDetail', () => {
  const set = (over: Partial<WorkoutSet>): WorkoutSet => ({
    id: 's',
    order: 0,
    type: 'normal',
    completed: true,
    ...over,
  });
  it('formats weight_reps', () => {
    expect(formatSetDetail(set({ weightKg: 100, reps: 5 }), 'weight_reps', 'kg')).toBe(
      '100 kg × 5',
    );
    expect(formatSetDetail(set({ weightKg: lbToKg(135), reps: 8 }), 'weight_reps', 'lb')).toBe(
      '135 lb × 8',
    );
  });
  it('formats bodyweight_reps', () => {
    expect(formatSetDetail(set({ reps: 12 }), 'bodyweight_reps', 'kg')).toBe('12 reps');
    expect(formatSetDetail(set({}), 'bodyweight_reps', 'kg')).toBe('0 reps');
  });
  it('formats weighted_bodyweight with a plus', () => {
    expect(formatSetDetail(set({ weightKg: 10, reps: 6 }), 'weighted_bodyweight', 'kg')).toBe(
      '+10 kg × 6',
    );
  });
  it('formats duration', () => {
    expect(formatSetDetail(set({ durationSec: 75 }), 'duration', 'kg')).toBe('1:15');
    expect(formatSetDetail(set({}), 'duration', 'kg')).toBe('0:00');
  });
});
