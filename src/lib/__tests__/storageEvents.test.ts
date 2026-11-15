import { describe, expect, it, vi } from 'vitest';
import { installStorageErrorListener, onQuotaExceeded } from '../storageEvents';

function rejection(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason });
}

function quotaError(): Error {
  return Object.assign(new Error('full'), { name: 'QuotaExceededError' });
}

describe('installStorageErrorListener', () => {
  it('reports quota rejections, ignores others, and stops after uninstall', () => {
    const seen = vi.fn();
    const off = onQuotaExceeded(seen);
    const uninstall = installStorageErrorListener();
    window.dispatchEvent(rejection(quotaError()));
    window.dispatchEvent(rejection(new Error('other')));
    expect(seen).toHaveBeenCalledTimes(1);
    uninstall();
    window.dispatchEvent(rejection(quotaError()));
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });
});
