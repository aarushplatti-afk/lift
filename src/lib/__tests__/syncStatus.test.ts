import { describe, expect, it } from 'vitest';
import { isOutboxStale, STALE_OUTBOX_MS } from '../syncStatus';

describe('isOutboxStale', () => {
  it('is false for an empty outbox and at exactly 24 h', () => {
    expect(isOutboxStale(undefined, 1_000_000_000)).toBe(false);
    expect(isOutboxStale(1000, 1000 + STALE_OUTBOX_MS)).toBe(false);
  });

  it('is true one millisecond past 24 h', () => {
    expect(isOutboxStale(1000, 1000 + STALE_OUTBOX_MS + 1)).toBe(true);
  });
});
