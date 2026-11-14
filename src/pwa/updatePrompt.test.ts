import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Callbacks {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}

const updateSW = vi.fn<(reload?: boolean) => Promise<void>>(() => Promise.resolve());
let callbacks: Callbacks = {};
const registerSW = vi.fn((options: Callbacks) => {
  callbacks = options;
  return updateSW;
});

vi.mock('virtual:pwa-register', () => ({ registerSW }));

describe('useUpdatePrompt', () => {
  beforeEach(() => {
    vi.resetModules();
    updateSW.mockClear();
    registerSW.mockClear();
    callbacks = {};
  });

  async function setup() {
    const { useUpdatePrompt } = await import('./updatePrompt');
    return renderHook(() => useUpdatePrompt());
  }

  it('does not reload or show without user action', async () => {
    const { result } = await setup();
    expect(result.current.visible).toBe(false);
    act(() => {
      callbacks.onNeedRefresh?.();
    });
    expect(updateSW).not.toHaveBeenCalled();
  });

  it('becomes visible after onNeedRefresh', async () => {
    const { result } = await setup();
    act(() => {
      callbacks.onNeedRefresh?.();
    });
    expect(result.current.visible).toBe(true);
  });

  it('apply calls updateSW(true)', async () => {
    const { result } = await setup();
    act(() => {
      callbacks.onNeedRefresh?.();
    });
    act(() => {
      result.current.apply();
    });
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('dismiss hides until the next needRefresh', async () => {
    const { result } = await setup();
    act(() => {
      callbacks.onNeedRefresh?.();
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.visible).toBe(false);
    act(() => {
      callbacks.onNeedRefresh?.();
    });
    expect(result.current.visible).toBe(true);
  });

  it('registers once across multiple mounts', async () => {
    const { useUpdatePrompt } = await import('./updatePrompt');
    renderHook(() => useUpdatePrompt());
    renderHook(() => useUpdatePrompt());
    expect(registerSW).toHaveBeenCalledTimes(1);
  });

  it('reports offlineReady', async () => {
    const { result } = await setup();
    act(() => {
      callbacks.onOfflineReady?.();
    });
    expect(result.current.offlineReady).toBe(true);
  });
});
