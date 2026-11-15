export const STALE_OUTBOX_MS = 86_400_000;

export function isOutboxStale(oldestPendingAt: number | undefined, now: number): boolean {
  return oldestPendingAt !== undefined && now - oldestPendingAt > STALE_OUTBOX_MS;
}
