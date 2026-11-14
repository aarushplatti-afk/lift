import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWakeLockSupported, keepAwake } from '../wakeLock';

interface FakeSentinel {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
}

function makeSentinel(): FakeSentinel {
  const s: FakeSentinel = {
    released: false,
    release: vi.fn(() => {
      s.released = true;
      return Promise.resolve();
    }),
  };
  return s;
}

function installLock(request: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('wakeLock', () => {
  it('does not throw when unsupported', () => {
    expect(isWakeLockSupported()).toBe(false);
    expect(() => keepAwake()()).not.toThrow();
  });

  it('acquires when visible', async () => {
    const request = vi.fn(() => Promise.resolve(makeSentinel()));
    installLock(request);
    const stop = keepAwake();
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    stop();
  });

  it('does not acquire while hidden, then acquires on visible', async () => {
    const request = vi.fn(() => Promise.resolve(makeSentinel()));
    installLock(request);
    setVisibility('hidden');
    const stop = keepAwake();
    await flush();
    expect(request).not.toHaveBeenCalled();
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    stop();
  });

  it('re-acquires on visible after a release', async () => {
    const first = makeSentinel();
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(makeSentinel());
    installLock(request);
    const stop = keepAwake();
    await flush();
    first.released = true;
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    stop();
  });

  it('cleanup releases the lock and removes the listener', async () => {
    const s = makeSentinel();
    const request = vi.fn(() => Promise.resolve(s));
    installLock(request);
    const stop = keepAwake();
    await flush();
    stop();
    expect(s.release).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('releases a lock that resolves after cleanup', async () => {
    const s = makeSentinel();
    installLock(vi.fn(() => Promise.resolve(s)));
    keepAwake()();
    await flush();
    expect(s.release).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected request', async () => {
    installLock(vi.fn(() => Promise.reject(new Error('denied'))));
    const stop = keepAwake();
    await flush();
    expect(() => stop()).not.toThrow();
  });
});
