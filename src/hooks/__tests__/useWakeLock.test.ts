import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '../useWakeLock';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
});

function install() {
  const sentinel = {
    released: false,
    release: vi.fn(() => {
      sentinel.released = true;
      return Promise.resolve();
    }),
  };
  const request = vi.fn(() => Promise.resolve(sentinel));
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { sentinel, request };
}

describe('useWakeLock', () => {
  it('acquires when enabled and releases on unmount', async () => {
    const { sentinel, request } = install();
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    unmount();
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const { request } = install();
    renderHook(() => useWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('releases when toggled off', async () => {
    const { sentinel } = install();
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await flush();
    rerender({ on: false });
    expect(sentinel.release).toHaveBeenCalled();
  });
});
