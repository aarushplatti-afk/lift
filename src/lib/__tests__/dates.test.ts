import { describe, expect, it } from 'vitest';
import { daysBetween, isLocalDateString, parseLocalDate, todayLocal } from '../dates';

describe('todayLocal', () => {
  it('uses the local calendar date at the day boundaries', () => {
    expect(todayLocal(new Date(2026, 5, 10, 23, 59, 59, 999).getTime())).toBe('2026-06-10');
    expect(todayLocal(new Date(2026, 5, 11, 0, 0, 0, 0).getTime())).toBe('2026-06-11');
  });

  it('is correct around the spring-forward day', () => {
    expect(todayLocal(new Date(2026, 2, 8, 0, 30).getTime())).toBe('2026-03-08');
    expect(todayLocal(new Date(2026, 2, 8, 1, 30).getTime())).toBe('2026-03-08');
    expect(todayLocal(new Date(2026, 2, 8, 3, 0).getTime())).toBe('2026-03-08');
  });

  it('is correct around the fall-back day', () => {
    expect(todayLocal(new Date(2026, 10, 1, 0, 30).getTime())).toBe('2026-11-01');
    expect(todayLocal(new Date(2026, 10, 1, 1, 30).getTime())).toBe('2026-11-01');
    expect(todayLocal(new Date(2026, 10, 1, 3, 0).getTime())).toBe('2026-11-01');
  });

  it('rolls over month and year', () => {
    expect(todayLocal(new Date(2026, 0, 31, 23, 59).getTime())).toBe('2026-01-31');
    expect(todayLocal(new Date(2026, 1, 1, 0, 0).getTime())).toBe('2026-02-01');
    expect(todayLocal(new Date(2026, 11, 31, 23, 59).getTime())).toBe('2026-12-31');
    expect(todayLocal(new Date(2027, 0, 1, 0, 0).getTime())).toBe('2027-01-01');
  });

  it('defaults to the current time', () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isLocalDateString', () => {
  it('accepts real calendar dates', () => {
    expect(isLocalDateString('2028-02-29')).toBe(true);
    expect(isLocalDateString('1900-01-01')).toBe(true);
    expect(isLocalDateString('9999-12-31')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    expect(isLocalDateString('2026-02-30')).toBe(false);
    expect(isLocalDateString('2027-02-29')).toBe(false);
    expect(isLocalDateString('2026-2-3')).toBe(false);
    expect(isLocalDateString('')).toBe(false);
    expect(isLocalDateString('1899-12-31')).toBe(false);
    expect(isLocalDateString('2026-13-01')).toBe(false);
    expect(isLocalDateString('2026-00-10')).toBe(false);
    expect(isLocalDateString('2026-01-00')).toBe(false);
    expect(isLocalDateString('2026-01-01T00:00')).toBe(false);
  });
});

describe('parseLocalDate', () => {
  it('returns local midnight and round-trips through todayLocal', () => {
    for (const date of ['2026-03-08', '2026-11-01', '2028-02-29', '1900-01-01']) {
      const t = parseLocalDate(date);
      const d = new Date(t);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(todayLocal(t)).toBe(date);
    }
  });

  it('throws RangeError for invalid input', () => {
    expect(() => parseLocalDate('2026-02-30')).toThrow(RangeError);
    expect(() => parseLocalDate('nope')).toThrow(RangeError);
  });
});

describe('daysBetween', () => {
  it('counts one day across both DST transitions', () => {
    expect(daysBetween('2026-03-07', '2026-03-08')).toBe(1);
    expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1);
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
  });

  it('counts whole spans across DST', () => {
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14);
    expect(daysBetween('2026-10-25', '2026-11-08')).toBe(14);
  });

  it('handles years and leap years', () => {
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('is zero for same date and negative when reversed', () => {
    expect(daysBetween('2026-05-05', '2026-05-05')).toBe(0);
    expect(daysBetween('2026-05-06', '2026-05-05')).toBe(-1);
  });

  it('throws RangeError for invalid input', () => {
    expect(() => daysBetween('2026-02-30', '2026-03-01')).toThrow(RangeError);
    expect(() => daysBetween('2026-03-01', 'x')).toThrow(RangeError);
  });
});
