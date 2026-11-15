import { create } from 'zustand';
import {
  discardWorkout,
  enqueueActiveWorkout,
  finishWorkout,
  getActiveWorkout,
  observeActiveWorkoutId,
  saveActiveWorkout,
  startWorkout,
  type FinishOutcome,
} from '../db/repos/workouts';
import { canCompleteSet, type CompleteResult } from '../lib/calc/validation';
import { newId } from '../lib/ids';
import { requestPersistentStorage } from '../lib/platform/storage';
import * as ops from '../lib/workoutOps';
import type { SetPatch, WorkoutInit } from '../lib/workoutOps';
import { useToastStore } from '../components/ui/toastStore';
import type { ExerciseType, SetType, Workout } from '../types/domain';

const SAVE_DEBOUNCE_MS = 300;
const ENQUEUE_DELAY_MS = 5000;
const SAVE_ERROR_MESSAGE = 'Couldn’t save. Storage may be full.';

export interface ActiveWorkoutState {
  status: 'idle' | 'loading' | 'ready';
  workout: Workout | null;
  saveError: boolean;
  start: (init?: WorkoutInit) => Promise<Workout>;
  addExercises: (ids: string[]) => void;
  removeExercise: (weId: string, name?: string) => void;
  moveExercise: (weId: string, dir: -1 | 1) => void;
  setExerciseNotes: (weId: string, notes: string) => void;
  addSet: (weId: string) => void;
  updateSet: (weId: string, setId: string, patch: SetPatch) => void;
  toggleComplete: (weId: string, setId: string, type: ExerciseType) => CompleteResult;
  removeSet: (weId: string, setId: string) => void;
  setSetType: (weId: string, setId: string, type: SetType) => void;
  setRestSeconds: (weId: string, sec: number | null) => void;
  rename: (name: string) => void;
  setNotes: (notes: string) => void;
  flush: () => Promise<void>;
  finish: (opts: { markIncomplete: boolean }) => Promise<FinishOutcome>;
  discard: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let enqueueTimer: ReturnType<typeof setTimeout> | null = null;
let saveDirty = false;
let enqueueDirty = false;
let chain: Promise<void> = Promise.resolve();

function ctx(): ops.OpsCtx {
  return { now: Date.now(), newId };
}

function resetPersistence(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  if (enqueueTimer !== null) clearTimeout(enqueueTimer);
  saveTimer = null;
  enqueueTimer = null;
  saveDirty = false;
  enqueueDirty = false;
}

function reportSaveFailure(): void {
  const already = useActiveWorkoutStore.getState().saveError;
  useActiveWorkoutStore.setState({ saveError: true });
  if (!already) useToastStore.getState().show({ message: SAVE_ERROR_MESSAGE });
}

function runExclusive(task: () => Promise<void>): Promise<void> {
  chain = chain.then(async () => {
    try {
      await task();
    } catch {
      reportSaveFailure();
    }
  });
  return chain;
}

function persistSave(w: Workout): Promise<void> {
  return runExclusive(async () => {
    await saveActiveWorkout(w);
    if (useActiveWorkoutStore.getState().saveError) {
      useActiveWorkoutStore.setState({ saveError: false });
    }
  });
}

function persistEnqueue(id: string): Promise<void> {
  return runExclusive(() => enqueueActiveWorkout(id));
}

function scheduleEnqueue(): void {
  enqueueDirty = true;
  if (enqueueTimer !== null) return;
  enqueueTimer = setTimeout(() => {
    enqueueTimer = null;
    const w = useActiveWorkoutStore.getState().workout;
    if (!w || !enqueueDirty) return;
    enqueueDirty = false;
    void persistEnqueue(w.id);
  }, ENQUEUE_DELAY_MS);
}

function scheduleSave(): void {
  saveDirty = true;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const w = useActiveWorkoutStore.getState().workout;
    if (!w || !saveDirty) return;
    saveDirty = false;
    void persistSave(w);
  }, SAVE_DEBOUNCE_MS);
}

function flushNow(): Promise<void> {
  const w = useActiveWorkoutStore.getState().workout;
  const needSave = saveDirty;
  const needEnqueue = enqueueDirty;
  resetPersistence();
  if (!w) return chain;
  if (needSave) void persistSave(w);
  if (needEnqueue) return persistEnqueue(w.id);
  return chain;
}

async function settleBeforeRepo(w: Workout): Promise<void> {
  const needSave = saveDirty;
  resetPersistence();
  if (needSave) await persistSave(w);
  await chain;
}

function rearmPersistence(): void {
  if (useActiveWorkoutStore.getState().saveError) scheduleSave();
  scheduleEnqueue();
}

async function ensurePersistence(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return;
    if (!(await navigator.storage.persisted())) await requestPersistentStorage();
  } catch {
    return;
  }
}

export const useActiveWorkoutStore = create<ActiveWorkoutState>((set, get) => {
  function mutate(fn: (w: Workout, c: ops.OpsCtx) => Workout): void {
    const w = get().workout;
    if (!w) return;
    const next = fn(w, ctx());
    if (next === w) return;
    set({ workout: next });
    scheduleSave();
    scheduleEnqueue();
  }

  return {
    status: 'idle',
    workout: null,
    saveError: false,

    async start(init) {
      const w = await startWorkout(init);
      set({ workout: w });
      scheduleEnqueue();
      return w;
    },

    addExercises: (ids) => mutate((w, c) => ops.addExercises(w, ids, c)),

    removeExercise(weId, name) {
      const w = get().workout;
      const index = w?.exercises.findIndex((e) => e.id === weId) ?? -1;
      const we = w?.exercises[index];
      if (!w || !we) return;
      const workoutId = w.id;
      mutate((cur, c) => ops.removeExercise(cur, weId, c));
      useToastStore.getState().show({
        message: name ? `Removed ${name}` : 'Exercise removed',
        actionLabel: 'Undo',
        onAction: () => {
          if (get().workout?.id !== workoutId) return;
          mutate((cur, c) => ops.restoreExercise(cur, we, index, c));
        },
      });
    },

    moveExercise: (weId, dir) => mutate((w, c) => ops.moveExercise(w, weId, dir, c)),
    setExerciseNotes: (weId, notes) => mutate((w, c) => ops.setExerciseNotes(w, weId, notes, c)),
    addSet: (weId) => mutate((w, c) => ops.addSet(w, weId, c)),
    updateSet: (weId, setId, patch) => mutate((w, c) => ops.updateSet(w, weId, setId, patch, c)),

    toggleComplete(weId, setId, type) {
      const target = get()
        .workout?.exercises.find((e) => e.id === weId)
        ?.sets.find((s) => s.id === setId);
      if (!target) return { ok: true, completed: false };
      if (target.completed) {
        mutate((w, c) => ops.setCompleted(w, weId, setId, false, c));
        return { ok: true, completed: false };
      }
      const check = canCompleteSet(target, type);
      if (!check.ok) return { ok: false, field: check.field };
      mutate((w, c) => ops.setCompleted(w, weId, setId, true, c));
      return { ok: true, completed: true };
    },

    removeSet(weId, setId) {
      const we = get().workout?.exercises.find((e) => e.id === weId);
      const index = we?.sets.findIndex((s) => s.id === setId) ?? -1;
      const removed = we?.sets[index];
      const workoutId = get().workout?.id;
      if (!removed || workoutId === undefined) return;
      mutate((w, c) => ops.removeSet(w, weId, setId, c));
      useToastStore.getState().show({
        message: 'Set deleted',
        actionLabel: 'Undo',
        onAction: () => {
          if (get().workout?.id !== workoutId) return;
          mutate((w, c) => ops.restoreSet(w, weId, removed, index, c));
        },
      });
    },

    setSetType: (weId, setId, type) => mutate((w, c) => ops.setSetType(w, weId, setId, type, c)),
    setRestSeconds: (weId, sec) => mutate((w, c) => ops.setRestSeconds(w, weId, sec, c)),

    rename: (name) => mutate((w, c) => ops.rename(w, name, c)),
    setNotes: (notes) => mutate((w, c) => ops.setNotes(w, notes, c)),

    flush: flushNow,

    async finish(opts) {
      let w = get().workout;
      if (!w) return { status: 'empty' };
      await settleBeforeRepo(w);
      const latest = get().workout;
      if (latest && latest !== w && latest.id === w.id) {
        w = latest;
        await settleBeforeRepo(w);
      }
      let outcome: FinishOutcome;
      try {
        outcome = await finishWorkout(w, opts);
      } catch (error) {
        rearmPersistence();
        throw error;
      }
      if (outcome.status === 'finished') {
        set({ workout: null });
        void ensurePersistence();
      } else rearmPersistence();
      return outcome;
    },

    async discard() {
      const w = get().workout;
      if (!w) return;
      await settleBeforeRepo(w);
      try {
        await discardWorkout(w.id);
      } catch (error) {
        rearmPersistence();
        throw error;
      }
      set({ workout: null });
    },
  };
});

export function isWorkoutActive(s: ActiveWorkoutState): boolean {
  return s.workout !== null || s.status === 'loading';
}

let hydrateGen = 0;

function sameId(row: Workout | undefined): boolean {
  return (row?.id ?? null) === (useActiveWorkoutStore.getState().workout?.id ?? null);
}

let latestHydrate: Promise<void> = Promise.resolve();

function hydrate(): Promise<void> {
  latestHydrate = runHydrate();
  return latestHydrate;
}

async function settleHydration(): Promise<void> {
  let current: Promise<void>;
  do {
    current = latestHydrate;
    await current.catch(() => undefined);
  } while (current !== latestHydrate);
}

async function runHydrate(): Promise<void> {
  hydrateGen += 1;
  const gen = hydrateGen;
  if (sameId(await getActiveWorkout())) return;
  await flushNow();
  if (gen !== hydrateGen) return;
  const row = await getActiveWorkout();
  if (gen !== hydrateGen || sameId(row)) return;
  resetPersistence();
  useActiveWorkoutStore.setState({ workout: row ?? null });
}

export function initActiveWorkoutStore(): () => void {
  useActiveWorkoutStore.setState({ status: 'loading' });
  let stopped = false;
  void hydrate()
    .catch(() => undefined)
    .then(settleHydration)
    .then(() => {
      if (!stopped) useActiveWorkoutStore.setState({ status: 'ready' });
    });

  const sub = observeActiveWorkoutId().subscribe({
    next: (id) => {
      const current = useActiveWorkoutStore.getState().workout;
      if (id === current?.id || (id === undefined && current === null)) return;
      void hydrate().catch(() => undefined);
    },
    error: () => undefined,
  });

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') void flushNow();
  };
  const onPageHide = (): void => {
    void flushNow();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    stopped = true;
    sub.unsubscribe();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    void flushNow();
    useActiveWorkoutStore.setState({ status: 'idle', workout: null, saveError: false });
  };
}
