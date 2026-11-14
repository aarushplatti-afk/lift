import { create } from 'zustand';
import { getRestTimer, setRestTimer } from '../db/repos/meta';
import { playChime } from '../lib/platform/chime';
import { HAPTIC_REST_DONE, vibrate } from '../lib/platform/haptics';
import { useActiveWorkoutStore } from './activeWorkout';
import { useSettingsStore } from './settings';

export const DONE_DISPLAY_MS = 3000;
export const LATE_GRACE_MS = 5000;
export const REST_ADJUST_CAP_SEC = 3600;

export type RestPhase = 'idle' | 'running' | 'done';

interface RestTimerState {
  phase: RestPhase;
  endsAt: number | null;
  durationSec: number;
  workoutId: string | null;
  start: (sec: number, workoutId: string) => void;
  adjust: (deltaSec: 15 | -15) => void;
  skip: () => void;
  tick: (now?: number) => void;
}

let runTimeout: ReturnType<typeof setTimeout> | null = null;
let doneTimeout: ReturnType<typeof setTimeout> | null = null;

function clearTimers(): void {
  if (runTimeout !== null) clearTimeout(runTimeout);
  if (doneTimeout !== null) clearTimeout(doneTimeout);
  runTimeout = null;
  doneTimeout = null;
}

function persist(
  snapshot: { workoutId: string; endsAt: number; durationSec: number } | null,
): void {
  void setRestTimer(snapshot).catch(() => undefined);
}

export function remainingMs(
  s: { endsAt: number | null; durationSec: number },
  now: number,
): number {
  if (s.endsAt === null) return 0;
  return Math.min(Math.max(s.endsAt - now, 0), s.durationSec * 1000);
}

function arm(endsAt: number, durationSec: number): void {
  if (runTimeout !== null) clearTimeout(runTimeout);
  const delay = Math.min(Math.max(endsAt - Date.now(), 0), durationSec * 1000);
  runTimeout = setTimeout(() => {
    runTimeout = null;
    useRestTimerStore.getState().tick();
  }, delay);
}

export const useRestTimerStore = create<RestTimerState>((set, get) => ({
  phase: 'idle',
  endsAt: null,
  durationSec: 0,
  workoutId: null,

  start(sec, workoutId) {
    clearTimers();
    const endsAt = Date.now() + sec * 1000;
    set({ phase: 'running', endsAt, durationSec: sec, workoutId });
    arm(endsAt, sec);
    persist({ workoutId, endsAt, durationSec: sec });
  },

  adjust(deltaSec) {
    const { phase, endsAt, durationSec, workoutId } = get();
    if (phase !== 'running' || endsAt === null || workoutId === null) return;
    const now = Date.now();
    const cappedEnd = Math.min(endsAt + deltaSec * 1000, now + REST_ADJUST_CAP_SEC * 1000);
    if (cappedEnd - now <= 0) {
      get().skip();
      return;
    }
    const nextDuration = durationSec + (cappedEnd - endsAt) / 1000;
    set({ endsAt: cappedEnd, durationSec: nextDuration });
    arm(cappedEnd, nextDuration);
    persist({ workoutId, endsAt: cappedEnd, durationSec: nextDuration });
  },

  skip() {
    clearTimers();
    set({ phase: 'idle', endsAt: null, durationSec: 0, workoutId: null });
    persist(null);
  },

  tick(now = Date.now()) {
    const { phase, endsAt } = get();
    if (phase !== 'running' || endsAt === null || now < endsAt) return;
    clearTimers();
    set({ phase: 'done' });
    persist(null);
    const visible = document.visibilityState === 'visible';
    if (visible && now - endsAt <= LATE_GRACE_MS) {
      const { soundEnabled, hapticsEnabled } = useSettingsStore.getState().settings;
      if (soundEnabled) playChime();
      if (hapticsEnabled) vibrate(HAPTIC_REST_DONE);
    }
    doneTimeout = setTimeout(() => {
      doneTimeout = null;
      if (get().phase === 'done') {
        set({ phase: 'idle', endsAt: null, durationSec: 0, workoutId: null });
      }
    }, DONE_DISPLAY_MS);
  },
}));

export function initRestTimer(): () => void {
  let stopped = false;
  let restoreStarted = false;

  const restore = (): void => {
    if (restoreStarted) return;
    restoreStarted = true;
    void getRestTimer()
      .then((snap) => {
        if (stopped || !snap) return;
        const active = useActiveWorkoutStore.getState().workout;
        const timer = useRestTimerStore.getState();
        if (timer.phase !== 'idle') return;
        if (active?.id !== snap.workoutId || snap.endsAt <= Date.now()) {
          persist(null);
          return;
        }
        useRestTimerStore.setState({
          phase: 'running',
          endsAt: snap.endsAt,
          durationSec: snap.durationSec,
          workoutId: snap.workoutId,
        });
        arm(snap.endsAt, snap.durationSec);
      })
      .catch(() => undefined);
  };

  const unsubscribe = useActiveWorkoutStore.subscribe((s) => {
    if (s.status !== 'ready') return;
    restore();
    const timer = useRestTimerStore.getState();
    if (timer.phase !== 'idle' && timer.workoutId !== (s.workout?.id ?? null)) {
      timer.skip();
    }
  });
  if (useActiveWorkoutStore.getState().status === 'ready') restore();

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') useRestTimerStore.getState().tick();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true;
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibility);
    clearTimers();
    useRestTimerStore.setState({ phase: 'idle', endsAt: null, durationSec: 0, workoutId: null });
  };
}
