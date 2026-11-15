import { subMonths, subYears } from 'date-fns';
import type { Point } from './series';

export type RangeKey = '1M' | '3M' | '6M' | '1Y' | 'All';

export const RANGE_KEYS: readonly RangeKey[] = ['1M', '3M', '6M', '1Y', 'All'];
export const DEFAULT_RANGE: RangeKey = '3M';

export function rangeStart(range: RangeKey, now: number): number | undefined {
  switch (range) {
    case '1M':
      return subMonths(now, 1).getTime();
    case '3M':
      return subMonths(now, 3).getTime();
    case '6M':
      return subMonths(now, 6).getTime();
    case '1Y':
      return subYears(now, 1).getTime();
    case 'All':
      return undefined;
  }
}

export function filterRange<T extends { t: number }>(
  points: readonly T[],
  range: RangeKey,
  now: number,
): T[] {
  const cutoff = rangeStart(range, now);
  if (cutoff === undefined) return [...points];
  return points.filter((p) => p.t >= cutoff);
}

export function resolveRange<T extends { t: number }>(
  points: readonly T[],
  range: RangeKey,
  now: number,
): { points: T[]; fellBack: boolean } {
  const inRange = filterRange(points, range, now);
  if (inRange.length < 2 && points.length > inRange.length) {
    return { points: [...points], fellBack: true };
  }
  return { points: inRange, fellBack: false };
}

export interface RangeStats {
  count: number;
  first?: Point;
  last?: Point;
  best?: Point;
}

export function rangeStats(points: readonly Point[]): RangeStats {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return { count: 0 };
  let best = first;
  for (const p of points) {
    if (p.value > best.value) best = p;
  }
  return { count: points.length, first, last, best };
}
