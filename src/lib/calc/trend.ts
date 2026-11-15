import { daysBetween } from '../dates';

export const TREND_ALPHA = 0.1;

function idOf(entry: object): string {
  return 'id' in entry && typeof entry.id === 'string' ? entry.id : '';
}

export function ewma<T extends { date: string; weightKg: number }>(
  entries: readonly T[],
  alpha: number = TREND_ALPHA,
): { entry: T; trendKg: number }[] {
  if (!(alpha > 0 && alpha <= 1)) throw new RangeError(`alpha must be in (0, 1], got ${alpha}`);
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ia = idOf(a);
    const ib = idOf(b);
    if (ia === ib) return 0;
    return ia < ib ? -1 : 1;
  });
  const out: { entry: T; trendKg: number }[] = [];
  let prev: { entry: T; trendKg: number } | undefined;
  for (const entry of sorted) {
    let trendKg = entry.weightKg;
    if (prev) {
      const days = daysBetween(prev.entry.date, entry.date);
      const eff = 1 - (1 - alpha) ** days;
      trendKg = prev.trendKg + eff * (entry.weightKg - prev.trendKg);
    }
    prev = { entry, trendKg };
    out.push(prev);
  }
  return out;
}
