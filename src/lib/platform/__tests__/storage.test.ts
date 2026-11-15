import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBytes, getStorageInfo, isQuotaError, requestPersistentStorage } from '../storage';
import { onQuotaExceeded, reportStorageError } from '../../storageEvents';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isQuotaError', () => {
  it('matches name, code, firefox name and dexie inner', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ name: 'X', code: 22 })).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toBe(true);
  });
  it('rejects others', () => {
    expect(isQuotaError(new Error('x'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError('QuotaExceededError')).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(2_300_000)).toBe('2.3 MB');
    expect(formatBytes(1_200_000_000)).toBe('1.2 GB');
  });
});

describe('storage info', () => {
  it('degrades when unsupported', async () => {
    vi.stubGlobal('navigator', {});
    expect(await getStorageInfo()).toEqual({ canPersist: false });
    expect(await requestPersistentStorage()).toBeUndefined();
  });
  it('reads estimate and persisted', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: () => Promise.resolve({ usage: 5, quota: 10 }),
        persisted: () => Promise.resolve(false),
        persist: () => Promise.resolve(true),
      },
    });
    expect(await getStorageInfo()).toEqual({
      canPersist: true,
      usageBytes: 5,
      quotaBytes: 10,
      persisted: false,
    });
    expect(await requestPersistentStorage()).toBe(true);
  });
});

describe('storageEvents', () => {
  it('emits only for quota errors and unsubscribes', () => {
    const cb = vi.fn();
    const off = onQuotaExceeded(cb);
    reportStorageError(new Error('nope'));
    expect(cb).not.toHaveBeenCalled();
    reportStorageError({ name: 'QuotaExceededError' });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    reportStorageError({ name: 'QuotaExceededError' });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
