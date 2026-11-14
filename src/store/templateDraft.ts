import { create } from 'zustand';
import { saveTemplate, type TemplateWriteResult } from '../db/repos/templates';
import { newId } from '../lib/ids';
import { draftKey, draftToInput, type TemplateDraft } from '../lib/templates';
import * as ops from '../lib/workoutOps';
import type { SetPatch } from '../lib/workoutOps';
import { useToastStore } from '../components/ui/toastStore';
import type { SetType } from '../types/domain';

export interface TemplateDraftState {
  draft: TemplateDraft | null;
  baselineKey: string;
  load: (d: TemplateDraft) => void;
  clear: () => void;
  isDirty: () => boolean;
  setName: (name: string) => void;
  addExercises: (ids: string[]) => void;
  removeExercise: (weId: string, name?: string) => void;
  moveExercise: (weId: string, dir: -1 | 1) => void;
  addSet: (weId: string) => void;
  updateSet: (weId: string, setId: string, patch: SetPatch) => void;
  removeSet: (weId: string, setId: string) => void;
  setSetType: (weId: string, setId: string, type: SetType) => void;
  setRestSeconds: (weId: string, sec: number | null) => void;
  save: () => Promise<TemplateWriteResult>;
}

let generation = 0;

function ctx(): ops.OpsCtx {
  return { now: Date.now(), newId };
}

export const useTemplateDraftStore = create<TemplateDraftState>((set, get) => {
  function mutate(fn: (d: TemplateDraft, c: ops.OpsCtx) => TemplateDraft): void {
    const d = get().draft;
    if (!d) return;
    const next = fn(d, ctx());
    if (next !== d) set({ draft: next });
  }

  return {
    draft: null,
    baselineKey: '',

    load(d) {
      generation += 1;
      set({ draft: d, baselineKey: draftKey(d) });
    },

    clear() {
      generation += 1;
      set({ draft: null, baselineKey: '' });
    },

    isDirty() {
      const { draft, baselineKey } = get();
      return draft !== null && draftKey(draft) !== baselineKey;
    },

    setName(name) {
      mutate((d, c) => ({ ...d, name, updatedAt: c.now }));
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
    addSet: (weId) => mutate((d, c) => ops.addSet(d, weId, c)),
    updateSet: (weId, setId, patch) => mutate((d, c) => ops.updateSet(d, weId, setId, patch, c)),

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

    async save() {
      const d = get().draft;
      if (!d) throw new Error('No template draft to save');
      const gen = generation;
      const result = await saveTemplate({ ...draftToInput(d), id: d.id ?? undefined });
      if (result.ok && gen === generation) {
        const cur = get().draft;
        if (cur) {
          const saved = { ...cur, id: result.template.id };
          set({ draft: saved, baselineKey: draftKey(d) });
        }
      }
      return result;
    },
  };
});
