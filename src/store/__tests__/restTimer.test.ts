import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RestTimerSnapshot } from '../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../db/repos/settings';
import type { Workout } from '../../types/domain';

const mocks = vi.hoisted(() => ({
  playChime: vi.fn(),
  vibrate: vi.fn(),
  getRestTimer: vi.fn<() => Promise<RestTimerSnapshot | undefined>>(),
  setRestTimer: vi.fn<(s: RestTimerSnapshot | null) => Promise<void>>(),
}));

vi.mock('../../lib/platform/chime', () => ({ playChime: mocks.playChime }));
vi.mock('../../lib/platform/haptics', () => ({
  HAPTIC_REST_DONE: [200, 100, 200],
  vibrate: mocks.vibrate,
}));
vi.mock('../../db/repos/meta', () => ({
  getRestTimer: mocks.getRestTimer,
  setRestTimer: mocks.setRestTimer,
}));

import { useActiveWorkoutStore } from '../activeWorkout';
import {
  DONE_DISPLAY_MS,
  LATE_GRACE_MS,
  initRestTimer,
  remainingMs,
  useRestTimerStore,
} from '../restTimer';
import { useSettingsStore } from '../settings';

const timer = () => useRestTimerStore.getState();
const T0 = 1_000_000;

const workout = (id: string): Workout => ({
  id,
  userId: 'u',
  name: id,
  startedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  status: 'in_progress',
  exercises: [],
});

function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function setEffects(soundEnabled: boolean, hapticsEnabled: boolean): void {
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, soundEnabled, hapticsEnabled } });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(T0);
  mocks.playChime.mockClear();
  mocks.vibrate.mockClear();
  mocks.getRestTimer.mockReset();
  mocks.getRestTimer.mockResolvedValue(undefined);
  mocks.setRestTimer.mockReset();
  mocks.setRestTimer.mockResolvedValue(undefined);
  setEffects(true, true);
  setVisibility('visible');
  useActiveWorkoutStore.setState({ status: 'idle', workout: null });
  useRestTimerStore.getState().skip();
  mocks.setRestTimer.mockClear();
});

afterEach(() => {
  useRestTimerStore.getState().skip();
  vi.useRealTimers();
});

describe('rest timer store', () => {
  it('start sets endsAt, persists, and completes exactly once at endsAt', () => {
    timer().start(90, 'w1');
    expect(timer()).toMatchObject({
      phase: 'running',
      endsAt: T0 + 90_000,
      durationSec: 90,
      workoutId: 'w1',
    });
    expect(mocks.setRestTimer).toHaveBeenCalledWith({
      workoutId: 'w1',
      endsAt: T0 + 90_000,
      durationSec: 90,
    });
    vi.advanceTimersByTime(89_999);
    expect(timer().phase).toBe('running');
    expect(mocks.playChime).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(timer().phase).toBe('done');
    expect(mocks.playChime).toHaveBeenCalledTimes(1);
    expect(mocks.vibrate).toHaveBeenCalledTimes(1);
    expect(mocks.vibrate).toHaveBeenCalledWith([200, 100, 200]);
    expect(mocks.setRestTimer).toHaveBeenLastCalledWith(null);
    timer().tick(T0 + 200_000);
    vi.advanceTimersByTime(1000);
    expect(mocks.playChime).toHaveBeenCalledTimes(1);
  });

  it('returns to idle after DONE_DISPLAY_MS', () => {
    timer().start(15, 'w1');
    vi.advanceTimersByTime(15_000);
    expect(timer().phase).toBe('done');
    vi.advanceTimersByTime(DONE_DISPLAY_MS - 1);
    expect(timer().phase).toBe('done');
    vi.advanceTimersByTime(1);
    expect(timer()).toMatchObject({ phase: 'idle', endsAt: null, workoutId: null });
  });

  it('a failed persist is ignored', () => {
    mocks.setRestTimer.mockRejectedValue(new Error('quota'));
    expect(() => timer().start(30, 'w1')).not.toThrow();
    expect(timer().phase).toBe('running');
  });

  it.each([
    [true, true, 1, 1],
    [true, false, 1, 0],
    [false, true, 0, 1],
    [false, false, 0, 0],
  ])('effects follow settings (sound %s, haptics %s)', (sound, haptics, chimes, buzzes) => {
    setEffects(sound, haptics);
    timer().start(15, 'w1');
    vi.advanceTimersByTime(15_000);
    expect(mocks.playChime).toHaveBeenCalledTimes(chimes);
    expect(mocks.vibrate).toHaveBeenCalledTimes(buzzes);
  });

  it('+15 extends both the remaining time and the duration', () => {
    timer().start(30, 'w1');
    vi.advanceTimersByTime(10_000);
    timer().adjust(15);
    expect(timer().endsAt).toBe(T0 + 45_000);
    expect(timer().durationSec).toBe(45);
    expect(mocks.setRestTimer).toHaveBeenLastCalledWith({
      workoutId: 'w1',
      endsAt: T0 + 45_000,
      durationSec: 45,
    });
    vi.advanceTimersByTime(34_999);
    expect(timer().phase).toBe('running');
    vi.advanceTimersByTime(1);
    expect(timer().phase).toBe('done');
  });

  it('caps the remaining time at 3600 s', () => {
    timer().start(3595, 'w1');
    timer().adjust(15);
    expect(timer().endsAt).toBe(T0 + 3_600_000);
    expect(timer().durationSec).toBe(3600);
    timer().adjust(15);
    expect(timer().durationSec).toBe(3600);
  });

  it('-15 shortens, and -15 past zero stops silently', () => {
    timer().start(60, 'w1');
    timer().adjust(-15);
    expect(timer().endsAt).toBe(T0 + 45_000);
    expect(timer().durationSec).toBe(45);
    vi.advanceTimersByTime(30_000);
    timer().adjust(-15);
    expect(timer().phase).toBe('idle');
    expect(mocks.setRestTimer).toHaveBeenLastCalledWith(null);
    vi.advanceTimersByTime(60_000);
    expect(mocks.playChime).not.toHaveBeenCalled();
    expect(mocks.vibrate).not.toHaveBeenCalled();
  });

  it('adjust is ignored when not running', () => {
    timer().adjust(15);
    expect(timer().phase).toBe('idle');
    expect(mocks.setRestTimer).not.toHaveBeenCalled();
  });

  it('skip stops without effects and clears the snapshot', () => {
    timer().start(30, 'w1');
    timer().skip();
    expect(timer()).toMatchObject({ phase: 'idle', endsAt: null, workoutId: null });
    expect(mocks.setRestTimer).toHaveBeenLastCalledWith(null);
    vi.advanceTimersByTime(60_000);
    expect(mocks.playChime).not.toHaveBeenCalled();
    expect(mocks.vibrate).not.toHaveBeenCalled();
  });

  it('start again replaces the running timer', () => {
    timer().start(30, 'w1');
    vi.advanceTimersByTime(10_000);
    timer().start(60, 'w1');
    expect(timer().endsAt).toBe(T0 + 70_000);
    vi.advanceTimersByTime(20_000);
    expect(timer().phase).toBe('running');
    vi.advanceTimersByTime(40_000);
    expect(timer().phase).toBe('done');
    expect(mocks.playChime).toHaveBeenCalledTimes(1);
  });

  it('a simulated lock completes silently on visible and the stale timeout does nothing', () => {
    timer().start(90, 'w1');
    setVisibility('hidden');
    vi.setSystemTime(T0 + 120_000);
    setVisibility('visible');
    const stop = initRestTimer();
    setVisibility('visible');
    expect(timer().phase).toBe('done');
    expect(mocks.playChime).not.toHaveBeenCalled();
    expect(mocks.vibrate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(90_000);
    expect(mocks.playChime).not.toHaveBeenCalled();
    stop();
  });

  it('completion within the grace window is audible; beyond it is silent', () => {
    timer().start(15, 'w1');
    timer().tick(T0 + 15_000 + LATE_GRACE_MS);
    expect(mocks.playChime).toHaveBeenCalledTimes(1);
    timer().skip();
    timer().start(15, 'w1');
    timer().tick(T0 + 15_000 + LATE_GRACE_MS + 1);
    expect(mocks.playChime).toHaveBeenCalledTimes(1);
  });

  it('completion while the page is hidden is silent', () => {
    timer().start(15, 'w1');
    setVisibility('hidden');
    vi.advanceTimersByTime(15_000);
    expect(timer().phase).toBe('done');
    expect(mocks.playChime).not.toHaveBeenCalled();
  });

  it('remainingMs clamps to 0..duration and handles a backwards clock', () => {
    const s = { endsAt: T0 + 30_000, durationSec: 30 };
    expect(remainingMs(s, T0)).toBe(30_000);
    expect(remainingMs(s, T0 + 10_000)).toBe(20_000);
    expect(remainingMs(s, T0 + 40_000)).toBe(0);
    expect(remainingMs(s, T0 - 3_600_000)).toBe(30_000);
    expect(remainingMs({ endsAt: null, durationSec: 30 }, T0)).toBe(0);
  });

  it('a clock moved backwards does not fire early or schedule past the duration', () => {
    timer().start(30, 'w1');
    vi.setSystemTime(T0 - 3_600_000);
    timer().tick();
    expect(timer().phase).toBe('running');
    timer().adjust(15);
    expect(timer().phase).toBe('running');
    expect(mocks.playChime).not.toHaveBeenCalled();
  });

  it('re-arms when the timeout fires before the wall clock reaches endsAt', () => {
    timer().start(30, 'w1');
    vi.setSystemTime(T0 - 5_000);
    vi.advanceTimersByTime(30_000);
    expect(timer().phase).toBe('running');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    vi.advanceTimersByTime(5_000);
    expect(timer().phase).toBe('done');
    expect(mocks.playChime).toHaveBeenCalledTimes(1);
  });
});

describe('initRestTimer', () => {
  const snap = (over: Partial<RestTimerSnapshot> = {}): RestTimerSnapshot => ({
    workoutId: 'w1',
    endsAt: T0 + 40_000,
    durationSec: 90,
    ...over,
  });

  async function ready(workoutId: string | null): Promise<void> {
    useActiveWorkoutStore.setState({
      status: 'ready',
      workout: workoutId === null ? null : workout(workoutId),
    });
    await vi.advanceTimersByTimeAsync(0);
  }

  it('restores a live snapshot for the active workout once ready, then completes', async () => {
    mocks.getRestTimer.mockResolvedValue(snap());
    const stop = initRestTimer();
    expect(timer().phase).toBe('idle');
    await ready('w1');
    expect(timer()).toMatchObject({
      phase: 'running',
      endsAt: T0 + 40_000,
      durationSec: 90,
      workoutId: 'w1',
    });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(timer().phase).toBe('done');
    expect(mocks.playChime).toHaveBeenCalledTimes(1);
    stop();
  });

  it('rejects a snapshot for a different workout', async () => {
    mocks.getRestTimer.mockResolvedValue(snap({ workoutId: 'other' }));
    const stop = initRestTimer();
    await ready('w1');
    expect(timer().phase).toBe('idle');
    expect(mocks.setRestTimer).toHaveBeenCalledWith(null);
    stop();
  });

  it('drops an expired snapshot silently', async () => {
    mocks.getRestTimer.mockResolvedValue(snap({ endsAt: T0 - 1 }));
    const stop = initRestTimer();
    await ready('w1');
    expect(timer().phase).toBe('idle');
    expect(mocks.setRestTimer).toHaveBeenCalledWith(null);
    expect(mocks.playChime).not.toHaveBeenCalled();
    stop();
  });

  it('restores when the store is already ready at init', async () => {
    useActiveWorkoutStore.setState({ status: 'ready', workout: workout('w1') });
    mocks.getRestTimer.mockResolvedValue(snap());
    const stop = initRestTimer();
    await vi.advanceTimersByTimeAsync(0);
    expect(timer().phase).toBe('running');
    stop();
  });

  it('does not restore before the store is ready', async () => {
    mocks.getRestTimer.mockResolvedValue(snap());
    const stop = initRestTimer();
    useActiveWorkoutStore.setState({ status: 'loading' });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.getRestTimer).not.toHaveBeenCalled();
    expect(timer().phase).toBe('idle');
    stop();
  });

  it('resets when the active workout becomes null or changes', async () => {
    const stop = initRestTimer();
    await ready('w1');
    timer().start(60, 'w1');
    useActiveWorkoutStore.setState({ workout: null });
    expect(timer().phase).toBe('idle');
    timer().start(60, 'w1');
    useActiveWorkoutStore.setState({ workout: workout('w2') });
    expect(timer().phase).toBe('idle');
    stop();
  });

  it('keeps running while the active workout stays the same', async () => {
    const stop = initRestTimer();
    await ready('w1');
    timer().start(60, 'w1');
    useActiveWorkoutStore.setState({ workout: { ...workout('w1'), name: 'renamed' } });
    expect(timer().phase).toBe('running');
    stop();
  });

  it('ticks on visibilitychange to visible', () => {
    const stop = initRestTimer();
    timer().start(30, 'w1');
    setVisibility('hidden');
    vi.setSystemTime(T0 + 31_000);
    setVisibility('visible');
    expect(timer().phase).toBe('done');
    stop();
  });

  it('cleanup removes listeners, clears timers, resets to idle, and keeps the snapshot', () => {
    const stop = initRestTimer();
    timer().start(30, 'w1');
    mocks.setRestTimer.mockClear();
    stop();
    expect(timer().phase).toBe('idle');
    expect(mocks.setRestTimer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(mocks.playChime).not.toHaveBeenCalled();
    timer().start(30, 'w1');
    setVisibility('hidden');
    vi.setSystemTime(T0 + 100_000);
    setVisibility('visible');
    expect(timer().phase).toBe('running');
  });
});
