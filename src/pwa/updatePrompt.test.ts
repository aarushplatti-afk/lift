import { act, renderHook } from '@testing-library/react';
import type { Workout } from '../types/domain';
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

const workout = (): Workout => ({
  id: 'w',
  userId: 'u',
  name: 'W',
  startedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  status: 'in_progress',
  exercises: [],
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

  it('stays hidden while a workout is active or loading, and shows after finish', async () => {
    const { result } = await setup();
    const { useActiveWorkoutStore } = await import('../store/activeWorkout');
    act(() => {
      callbacks.onNeedRefresh?.();
      useActiveWorkoutStore.setState({ status: 'loading' });
    });
    expect(result.current.visible).toBe(false);
    act(() => {
      useActiveWorkoutStore.setState({ status: 'ready', workout: workout() });
    });
    expect(result.current.visible).toBe(false);
    act(() => {
      useActiveWorkoutStore.setState({ workout: null });
    });
    expect(result.current.visible).toBe(true);
  });

  it('suppresses the prompt for a signed-in user until the store first becomes ready', async () => {
    const { result } = await setup();
    const { useAuthStore } = await import('../store/auth');
    const { useActiveWorkoutStore } = await import('../store/activeWorkout');
    act(() => {
      useAuthStore.setState({ status: 'signedIn' });
      callbacks.onNeedRefresh?.();
    });
    expect(result.current.visible).toBe(false);
    act(() => {
      useActiveWorkoutStore.setState({ status: 'ready' });
    });
    expect(result.current.visible).toBe(true);
    act(() => {
      useActiveWorkoutStore.setState({ status: 'idle' });
    });
    expect(result.current.visible).toBe(true);
  });

  it('re-suppresses after sign out and back in while the store is idle', async () => {
    const { result } = await setup();
    const { useAuthStore } = await import('../store/auth');
    const { useActiveWorkoutStore } = await import('../store/activeWorkout');
    act(() => {
      useAuthStore.setState({ status: 'signedIn' });
      useActiveWorkoutStore.setState({ status: 'ready' });
      useActiveWorkoutStore.setState({ status: 'idle' });
      useAuthStore.setState({ status: 'signedOut' });
      callbacks.onNeedRefresh?.();
    });
    expect(result.current.visible).toBe(true);
    act(() => {
      useAuthStore.setState({ status: 'signedIn' });
    });
    expect(result.current.visible).toBe(false);
  });

  it('still prompts a signed-out user whose store never initialized', async () => {
    const { result } = await setup();
    const { useAuthStore } = await import('../store/auth');
    act(() => {
      useAuthStore.setState({ status: 'signedOut' });
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
