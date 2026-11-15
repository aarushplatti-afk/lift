import { create } from 'zustand';
import { updateCompletedWorkout, type EditOutcome } from '../db/repos/workouts';
import { canCompleteSet, type CompleteResult } from '../lib/calc/validation';
import { newId } from '../lib/ids';
import { workoutEditKey } from '../lib/workoutEdit';
import * as ops from '../lib/workoutOps';
import type { SetPatch } from '../lib/workoutOps';
import { useToastStore } from '../components/ui/toastStore';
import type { ExerciseType, SetType, Workout } from '../types/domain';

export interface WorkoutEditState {
  draft: Workout | null;
  baselineKey: string;
  load: (w: Workout) => void;
  clear: () => void;
  isDirty: () => boolean;
  setName: (name: string) => void;
  setNotes: (notes: string) => void;
  setStartedAt: (ms: number) => void;
  setDurationMinutes: (min: number) => void;
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
  save: (opts: { markIncomplete: boolean }) => Promise<EditOutcome>;
}

let generation = 0;

function ctx(): ops.OpsCtx {
  return { now: Date.now(), newId };
}

export const useWorkoutEditStore = create<WorkoutEditState>((set, get) => {
  function mutate(fn: (d: Workout, c: ops.OpsCtx) => Workout): void {
    const d = get().draft;
    if (!d) return;
    const next = fn(d, ctx());
    if (next !== d) set({ draft: next });
  }

  return {
    draft: null,
    baselineKey: '',

    load(w) {
      generation += 1;
      const copy = structuredClone(w);
      set({ draft: copy, baselineKey: workoutEditKey(copy) });
    },

    clear() {
      generation += 1;
      set({ draft: null, baselineKey: '' });
    },

    isDirty() {
      const { draft, baselineKey } = get();
      return draft !== null && workoutEditKey(draft) !== baselineKey;
    },

    setName(name) {
      mutate((d, c) => ({ ...d, name, updatedAt: c.now }));
    },

    setNotes: (notes) => mutate((d, c) => ops.setNotes(d, notes, c)),

    setStartedAt(ms) {
      mutate((d, c) => {
        const next: Workout = { ...d, startedAt: ms, updatedAt: c.now };
        if (d.endedAt !== undefined) next.endedAt = ms + (d.endedAt - d.startedAt);
        return next;
      });
    },

    setDurationMinutes(min) {
      mutate((d, c) => ({ ...d, endedAt: d.startedAt + min * 60000, updatedAt: c.now }));
    },

    addExercises: (ids) => mutate((d, c) => ops.addExercises(d, ids, c)),

    removeExercise(weId, name) {
      const d = get().draft;
      const index = d?.exercises.findIndex((e) => e.id === weId) ?? -1;
      const we = d?.exercises[index];
      if (!we) return;
      const gen = generation;
      mutate((cur, c) => ops.removeExercise(cur, weId, c));
      useToastStore.getState().show({
        message: name ? `Removed ${name}` : 'Exercise removed',
        actionLabel: 'Undo',
        onAction: () => {
          if (gen !== generation) return;
          mutate((cur, c) => ops.restoreExercise(cur, we, index, c));
        },
      });
    },

    moveExercise: (weId, dir) => mutate((d, c) => ops.moveExercise(d, weId, dir, c)),
    setExerciseNotes: (weId, notes) => mutate((d, c) => ops.setExerciseNotes(d, weId, notes, c)),
    addSet: (weId) => mutate((d, c) => ops.addSet(d, weId, c)),
    updateSet: (weId, setId, patch) => mutate((d, c) => ops.updateSet(d, weId, setId, patch, c)),

    toggleComplete(weId, setId, type) {
      const target = get()
        .draft?.exercises.find((e) => e.id === weId)
        ?.sets.find((s) => s.id === setId);
      if (!target) return { ok: true, completed: false };
      if (target.completed) {
        mutate((d, c) => ops.setCompleted(d, weId, setId, false, c));
        return { ok: true, completed: false };
      }
      const check = canCompleteSet(target, type);
      if (!check.ok) return { ok: false, field: check.field };
      mutate((d, c) => ops.setCompleted(d, weId, setId, true, c));
      return { ok: true, completed: true };
    },

    removeSet(weId, setId) {
      const we = get().draft?.exercises.find((e) => e.id === weId);
      const index = we?.sets.findIndex((s) => s.id === setId) ?? -1;
      const removed = we?.sets[index];
      if (!removed) return;
      const gen = generation;
      mutate((d, c) => ops.removeSet(d, weId, setId, c));
      useToastStore.getState().show({
        message: 'Set deleted',
        actionLabel: 'Undo',
        onAction: () => {
          if (gen !== generation) return;
          mutate((d, c) => ops.restoreSet(d, weId, removed, index, c));
        },
      });
    },

    setSetType: (weId, setId, type) => mutate((d, c) => ops.setSetType(d, weId, setId, type, c)),
    setRestSeconds: (weId, sec) => mutate((d, c) => ops.setRestSeconds(d, weId, sec, c)),

    async save(opts) {
      const d = get().draft;
      if (!d) throw new Error('No workout draft to save');
      const gen = generation;
      const outcome = await updateCompletedWorkout(d, opts);
      if (outcome.status === 'saved' && gen === generation) {
        const saved = structuredClone(outcome.workout);
        set({ draft: saved, baselineKey: workoutEditKey(saved) });
      }
      return outcome;
    },
  };
});
