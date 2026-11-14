export function elapsedMs(startedAt: number, now: number): number {
  return Math.max(0, now - startedAt);
}
