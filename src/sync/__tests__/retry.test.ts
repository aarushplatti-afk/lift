import { describe, expect, it } from 'vitest';
import {
  classifyError,
  describeSyncError,
  isAuthError,
  nextDelay,
  RETRY_DELAYS_MS,
  SyncRequestError,
} from '../retry';

describe('nextDelay', () => {
  it('follows the schedule and caps at 300 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(nextDelay)).toEqual([
      2000, 5000, 15000, 60000, 120000, 300000, 300000,
    ]);
    expect(RETRY_DELAYS_MS).toHaveLength(6);
  });
});

describe('classifyError', () => {
  const err = (status?: number, code?: string) => new SyncRequestError('x', status, code);

  it('treats network, 5xx, 429, 401, 408 and unknown errors as retryable', () => {
    expect(classifyError(new TypeError('Failed to fetch'), 0)).toBe('retryable');
    expect(classifyError(err(503), 0)).toBe('retryable');
    expect(classifyError(err(429), 3)).toBe('retryable');
    expect(classifyError(err(401), 0)).toBe('retryable');
    expect(classifyError(err(408), 0)).toBe('retryable');
    expect(classifyError(new Error('weird'), 9)).toBe('retryable');
    expect(classifyError('str', 0)).toBe('retryable');
  });

  it('treats RLS, constraint, data and 4xx errors as permanent', () => {
    expect(classifyError(err(403, '42501'), 0)).toBe('permanent');
    expect(classifyError(err(400, '23514'), 0)).toBe('permanent');
    expect(classifyError(err(400, '22P02'), 0)).toBe('permanent');
    expect(classifyError(err(400), 0)).toBe('permanent');
    expect(classifyError(err(413), 0)).toBe('permanent');
    expect(classifyError(err(422), 0)).toBe('permanent');
    expect(classifyError(err(409), 0)).toBe('permanent');
  });

  it('retries 23505 once, then makes it permanent', () => {
    expect(classifyError(err(409, '23505'), 0)).toBe('retryable');
    expect(classifyError(err(409, '23505'), 1)).toBe('permanent');
  });

  it('treats a missing schema as retryable', () => {
    expect(classifyError(err(404, 'PGRST205'), 0)).toBe('retryable');
    expect(classifyError(err(400, 'PGRST204'), 5)).toBe('retryable');
  });
});

describe('isAuthError', () => {
  it('detects 401, JWT codes and expired-JWT messages', () => {
    expect(isAuthError(new SyncRequestError('x', 401))).toBe(true);
    expect(isAuthError(new SyncRequestError('x', 400, 'PGRST301'))).toBe(true);
    expect(isAuthError(new SyncRequestError('x', 400, 'PGRST303'))).toBe(true);
    expect(isAuthError(new Error('JWT expired'))).toBe(true);
    expect(isAuthError(new SyncRequestError('x', 403, '42501'))).toBe(false);
    expect(isAuthError(null)).toBe(false);
  });
});

describe('describeSyncError', () => {
  it('maps known codes and falls back to the message', () => {
    expect(describeSyncError(new SyncRequestError('x', 409, '23505'))).toBe('Duplicate name');
    expect(describeSyncError(new SyncRequestError('x', 403, '42501'))).toBe(
      'Not allowed by the server',
    );
    expect(describeSyncError(new SyncRequestError('x', 400, '23514'))).toBe('Value out of range');
    expect(describeSyncError(new SyncRequestError('x', 400, '22003'))).toBe('Value out of range');
    expect(describeSyncError(new Error('boom'))).toBe('boom');
    expect(describeSyncError(undefined)).toBe('Unknown sync error');
  });
});
