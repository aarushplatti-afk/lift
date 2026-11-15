import type { BodyweightEntry } from '../../types/domain';
import { parseLocalDate } from '../dates';
import { ewma } from './trend';

export const BW_MAX_KG = 700;
export const BW_NOTE_MAX = 200;

export type BodyweightWeightError = 'missing' | 'too_low' | 'too_high';

export function roundBodyweightKg(kg: number): number {
  return Math.round(kg * 1000) / 1000;
}

export function validateBodyweightKg(kg: number | undefined): BodyweightWeightError | undefined {
  if (kg === undefined || Number.isNaN(kg)) return 'missing';
  const rounded = roundBodyweightKg(kg);
  if (rounded <= 0) return 'too_low';
  if (rounded >= BW_MAX_KG) return 'too_high';
  return undefined;
}

export interface BodyweightPoint {
  t: number;
  value: number;
  trend: number;
  entry: BodyweightEntry;
}

export function bodyweightSeries(entries: readonly BodyweightEntry[]): BodyweightPoint[] {
  return ewma(entries).map(({ entry, trendKg }) => ({
    t: parseLocalDate(entry.date),
    value: entry.weightKg,
    trend: trendKg,
    entry,
  }));
}

export interface BodyweightStats {
  count: number;
  first?: BodyweightPoint;
  last?: BodyweightPoint;
  min?: BodyweightPoint;
  max?: BodyweightPoint;
  averageKg?: number;
}

export function bodyweightStats(points: readonly BodyweightPoint[]): BodyweightStats {
  const first = points[0];
  if (!first) return { count: 0 };
  let min = first;
  let max = first;
  let sum = 0;
  for (const p of points) {
    if (p.value < min.value) min = p;
    if (p.value > max.value) max = p;
    sum += p.value;
  }
  return {
    count: points.length,
    first,
    last: points[points.length - 1],
    min,
    max,
    averageKg: sum / points.length,
  };
}
