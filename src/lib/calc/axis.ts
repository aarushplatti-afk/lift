const DAY_MS = 86_400_000;
const NICE_MANTISSAS = [1, 2, 2.5, 5, 10] as const;
const MAX_INTERVALS = 4;

function clean(v: number): number {
  return Math.round(v * 1e9) / 1e9;
}

function niceTicks(lo: number, hi: number): number[] {
  const exp = Math.floor(Math.log10((hi - lo) / MAX_INTERVALS));
  for (let e = exp; e <= exp + 2; e += 1) {
    for (const m of NICE_MANTISSAS) {
      const step = m * 10 ** e;
      const start = Math.floor(clean(lo / step)) * step;
      const end = Math.ceil(clean(hi / step)) * step;
      const count = Math.round((end - start) / step);
      if (count <= MAX_INTERVALS) {
        const ticks: number[] = [];
        for (let i = 0; i <= count; i += 1) ticks.push(clean(start + i * step));
        return ticks;
      }
    }
  }
  return [lo, hi];
}

export function yAxis(
  values: readonly number[],
  zeroBased: boolean,
): { domain: [number, number]; ticks: number[] } {
  if (values.length === 0) return { domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  let lo: number;
  let hi: number;
  if (zeroBased) {
    lo = 0;
    hi = max > 0 ? max : 1;
  } else {
    const spread = max - min;
    const pad = spread === 0 ? Math.max(Math.abs(max) * 0.05, 1) : Math.max(spread * 0.1, 1);
    lo = Math.max(0, min - pad);
    hi = max + pad;
  }
  const ticks = niceTicks(lo, hi);
  return { domain: [ticks[0] as number, ticks[ticks.length - 1] as number], ticks };
}

export function xDomain(ts: readonly number[]): [number, number] {
  if (ts.length === 0) return [0, DAY_MS];
  const min = Math.min(...ts);
  const max = Math.max(...ts);
  if (min === max) return [min - DAY_MS, max + DAY_MS];
  return [min, max];
}
