import { describe, expect, it } from 'vitest';
import { formatDurationShort, formatElapsed, formatWeight } from '../format';

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
