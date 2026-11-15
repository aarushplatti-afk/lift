const YEAR_MS = 365 * 86_400_000;

export const Y_AXIS_WIDTH = 48;

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function xTicks([lo, hi]: [number, number]): number[] {
  const count = hi - lo > 2 * 86_400_000 ? 4 : 3;
  return Array.from({ length: count }, (_, i) => Math.round(lo + ((hi - lo) * i) / (count - 1)));
}

export function formatTick(t: number, spanMs: number): string {
  const d = new Date(t);
  if (spanMs <= YEAR_MS) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${month} ’${String(d.getFullYear()).slice(-2)}`;
}
