import { describe, expect, it } from 'vitest';
import type { BodyweightEntry } from '../../../types/domain';
import { parseLocalDate } from '../../dates';
import { fromDisplayInput } from '../../units';
import {
  BW_MAX_KG,
  BW_NOTE_MAX,
  bodyweightSeries,
  bodyweightStats,
  roundBodyweightKg,
  validateBodyweightKg,
} from '../bodyweight';

function entry(date: string, weightKg: number, id = date): BodyweightEntry {
  return { id, userId: 'u', date, weightKg, createdAt: 1, updatedAt: 1 };
}

describe('constants', () => {
  it('match the spec', () => {
    expect(BW_MAX_KG).toBe(700);
    expect(BW_NOTE_MAX).toBe(200);
  });
});

describe('validateBodyweightKg', () => {
  it('flags missing values', () => {
    expect(validateBodyweightKg(undefined)).toBe('missing');
    expect(validateBodyweightKg(Number.NaN)).toBe('missing');
  });

  it('flags values that are or round to zero or below', () => {
    expect(validateBodyweightKg(0)).toBe('too_low');
    expect(validateBodyweightKg(0.0004)).toBe('too_low');
    expect(validateBodyweightKg(-5)).toBe('too_low');
  });

  it('accepts the lower and upper valid edges', () => {
    expect(validateBodyweightKg(0.001)).toBeUndefined();
    expect(validateBodyweightKg(699.999)).toBeUndefined();
    expect(validateBodyweightKg(80)).toBeUndefined();
  });

  it('flags values that are or round to 700 or above', () => {
    expect(validateBodyweightKg(699.9996)).toBe('too_high');
    expect(validateBodyweightKg(700)).toBe('too_high');
    expect(validateBodyweightKg(1000)).toBe('too_high');
  });
});

describe('roundBodyweightKg', () => {
  it('rounds to 3 decimals', () => {
    expect(roundBodyweightKg(80.9214)).toBe(80.921);
    expect(roundBodyweightKg(80.9216)).toBe(80.922);
    expect(roundBodyweightKg(80)).toBe(80);
  });

  it('178.4 lb round trips to 80.921 kg', () => {
    const kg = roundBodyweightKg(fromDisplayInput('178.4', 'lb') ?? Number.NaN);
    expect(kg).toBe(80.921);
  });

  it('accepts a comma decimal', () => {
    expect(fromDisplayInput('178,4', 'lb')).toBe(fromDisplayInput('178.4', 'lb'));
  });
});

describe('bodyweightSeries', () => {
  it('is empty for empty input', () => {
    expect(bodyweightSeries([])).toEqual([]);
  });

  it('orders ascending, sets local-midnight t, and computes the trend', () => {
    const a = entry('2026-01-03', 82);
    const b = entry('2026-01-01', 80);
    const c = entry('2026-01-02', 81);
    const input = [a, b, c];
    const series = bodyweightSeries(input);
    expect(input).toEqual([a, b, c]);
    expect(series.map((p) => p.entry.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(series[0]?.t).toBe(parseLocalDate('2026-01-01'));
    expect(series[0]?.value).toBe(80);
    expect(series[0]?.trend).toBe(80);
    expect(series[1]?.trend).toBeCloseTo(80.1, 10);
    expect(series[2]?.trend).toBeCloseTo(80.1 + 0.1 * (82 - 80.1), 10);
  });
});

describe('bodyweightStats', () => {
  it('handles empty input', () => {
    expect(bodyweightStats([])).toEqual({ count: 0 });
  });

  it('handles a single point', () => {
    const points = bodyweightSeries([entry('2026-01-01', 80)]);
    const stats = bodyweightStats(points);
    expect(stats.count).toBe(1);
    expect(stats.first).toBe(points[0]);
    expect(stats.last).toBe(points[0]);
    expect(stats.min).toBe(points[0]);
    expect(stats.max).toBe(points[0]);
    expect(stats.averageKg).toBe(80);
  });

  it('computes min, max, first, last, average over many points', () => {
    const points = bodyweightSeries([
      entry('2026-01-01', 80),
      entry('2026-01-02', 78),
      entry('2026-01-03', 84),
      entry('2026-01-04', 82),
    ]);
    const stats = bodyweightStats(points);
    expect(stats.count).toBe(4);
    expect(stats.first?.entry.date).toBe('2026-01-01');
    expect(stats.last?.entry.date).toBe('2026-01-04');
    expect(stats.min?.value).toBe(78);
    expect(stats.max?.value).toBe(84);
    expect(stats.averageKg).toBe(81);
  });

  it('resolves ties to the earliest point', () => {
    const points = bodyweightSeries([
      entry('2026-01-01', 80),
      entry('2026-01-02', 78),
      entry('2026-01-03', 80),
      entry('2026-01-04', 78),
    ]);
    const stats = bodyweightStats(points);
    expect(stats.min?.entry.date).toBe('2026-01-02');
    expect(stats.max?.entry.date).toBe('2026-01-01');
  });
});
