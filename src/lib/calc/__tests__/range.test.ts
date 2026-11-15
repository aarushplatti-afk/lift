import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANGE,
  filterRange,
  RANGE_KEYS,
  rangeStart,
  rangeStats,
  resolveRange,
} from '../range';
import type { Point } from '../series';

const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const DAY = 86_400_000;

function pt(t: number, value = 1): Point {
  return { t, value, workoutId: `w${t}`, setCount: 1 };
}

describe('rangeStart', () => {
  it('exposes keys and default', () => {
    expect(RANGE_KEYS).toEqual(['1M', '3M', '6M', '1Y', 'All']);
    expect(DEFAULT_RANGE).toBe('3M');
  });
  it('computes each cutoff in local time', () => {
    expect(rangeStart('1M', NOW)).toBe(new Date(2026, 9, 10, 12).getTime());
    expect(rangeStart('3M', NOW)).toBe(new Date(2026, 7, 10, 12).getTime());
    expect(rangeStart('6M', NOW)).toBe(new Date(2026, 4, 10, 12).getTime());
    expect(rangeStart('1Y', NOW)).toBe(new Date(2025, 10, 10, 12).getTime());
    expect(rangeStart('All', NOW)).toBeUndefined();
  });
  it('clamps Mar 31 minus 1M to the end of February', () => {
    expect(rangeStart('1M', new Date(2026, 2, 31, 9).getTime())).toBe(
      new Date(2026, 1, 28, 9).getTime(),
    );
    expect(rangeStart('1M', new Date(2028, 2, 31, 9).getTime())).toBe(
      new Date(2028, 1, 29, 9).getTime(),
    );
  });
  it('keeps local wall-clock time across a DST change', () => {
    const cutoff = rangeStart('3M', NOW) as number;
    expect(cutoff).toBe(new Date(2026, 7, 10, 12).getTime());
    expect(new Date(cutoff).getHours()).toBe(12);
    expect(NOW - cutoff).toBe(92 * DAY + 3_600_000);
  });
});

describe('filterRange', () => {
  it('includes a point exactly at the cutoff and excludes 1 ms earlier', () => {
    const cutoff = rangeStart('1M', NOW) as number;
    const out = filterRange([pt(cutoff - 1), pt(cutoff), pt(cutoff + 1)], '1M', NOW);
    expect(out.map((p) => p.t)).toEqual([cutoff, cutoff + 1]);
  });
  it('includes future points', () => {
    expect(filterRange([pt(NOW + 10 * DAY)], '1M', NOW)).toHaveLength(1);
  });
  it('All includes everything', () => {
    const pts = [pt(1), pt(2), pt(NOW)];
    expect(filterRange(pts, 'All', NOW)).toEqual(pts);
  });
});

describe('resolveRange', () => {
  const old = (n: number) => NOW - (200 + n) * DAY;
  it('falls back to all time when 0 in range but 3 total', () => {
    const r = resolveRange([pt(old(3)), pt(old(2)), pt(old(1))], '1M', NOW);
    expect(r.fellBack).toBe(true);
    expect(r.points).toHaveLength(3);
  });
  it('falls back when 1 in range and more total', () => {
    const r = resolveRange([pt(old(1)), pt(NOW - 1000)], '1M', NOW);
    expect(r.fellBack).toBe(true);
    expect(r.points).toHaveLength(2);
  });
  it('does not fall back when 1 point exists in total and in range', () => {
    const r = resolveRange([pt(NOW - 1000)], '1M', NOW);
    expect(r.fellBack).toBe(false);
    expect(r.points).toHaveLength(1);
  });
  it('does not fall back with 2 in range', () => {
    const r = resolveRange([pt(old(1)), pt(NOW - 2000), pt(NOW - 1000)], '1M', NOW);
    expect(r.fellBack).toBe(false);
    expect(r.points).toHaveLength(2);
  });
  it('does not fall back for All with one point', () => {
    const r = resolveRange([pt(old(1))], 'All', NOW);
    expect(r.fellBack).toBe(false);
    expect(r.points).toHaveLength(1);
  });
  it('returns empty without fallback for no points', () => {
    expect(resolveRange([], '3M', NOW)).toEqual({ points: [], fellBack: false });
  });
});

describe('rangeStats', () => {
  it('handles empty input', () => {
    expect(rangeStats([])).toEqual({ count: 0 });
  });
  it('handles a single point', () => {
    const p = pt(1, 5);
    expect(rangeStats([p])).toEqual({ count: 1, first: p, last: p, best: p });
  });
  it('finds first, last and best across many points', () => {
    const a = pt(1, 5);
    const b = pt(2, 9);
    const c = pt(3, 7);
    const s = rangeStats([a, b, c]);
    expect(s.count).toBe(3);
    expect(s.first).toBe(a);
    expect(s.last).toBe(c);
    expect(s.best).toBe(b);
  });
  it('resolves best ties to the earliest', () => {
    const a = pt(1, 9);
    const b = pt(2, 9);
    expect(rangeStats([a, b]).best).toBe(a);
  });
});
