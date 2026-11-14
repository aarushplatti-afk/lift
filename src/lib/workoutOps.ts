import type { SetType, Workout, WorkoutExercise, WorkoutSet } from '../types/domain';
import { clampRestSeconds } from './calc/rest';
import { NAME_MAX, NOTES_MAX } from './exercises';

export type SetPatch = {
  weightKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
};

export interface ExerciseContainer {
  exercises: WorkoutExercise[];
  updatedAt: number;
}

export interface WorkoutInit {
  name?: string;
  templateId?: string;
  exercises?: WorkoutExercise[];
}

export interface OpsCtx {
  now: number;
  newId: () => string;
}

function renumber(exercises: WorkoutExercise[]): WorkoutExercise[] {
  return exercises.map((we, i) => ({
    ...we,
    order: i,
    sets: we.sets.map((s, j) => ({ ...s, order: j })),
  }));
}

function withExercises<W extends ExerciseContainer>(
  w: W,
  exercises: WorkoutExercise[],
  ctx: OpsCtx,
): W {
  return { ...w, exercises: renumber(exercises), updatedAt: ctx.now };
}

function mapExercise<W extends ExerciseContainer>(
  w: W,
  weId: string,
  ctx: OpsCtx,
  fn: (we: WorkoutExercise) => WorkoutExercise,
): W {
  if (!w.exercises.some((we) => we.id === weId)) return w;
  return withExercises(
    w,
    w.exercises.map((we) => (we.id === weId ? fn(we) : we)),
    ctx,
  );
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(0, index), length);
}

function emptySet(ctx: OpsCtx): WorkoutSet {
  return { id: ctx.newId(), order: 0, type: 'normal', completed: false };
}

function cleanNotes(notes: string): string {
  return notes.trim().slice(0, NOTES_MAX);
}

export function addExercises<W extends ExerciseContainer>(
  w: W,
  exerciseIds: readonly string[],
  ctx: OpsCtx,
): W {
  const added: WorkoutExercise[] = exerciseIds.map((exerciseId) => ({
    id: ctx.newId(),
    exerciseId,
    order: 0,
    sets: [emptySet(ctx)],
  }));
  return withExercises(w, [...w.exercises, ...added], ctx);
}

export function removeExercise<W extends ExerciseContainer>(w: W, weId: string, ctx: OpsCtx): W {
  return withExercises(
    w,
    w.exercises.filter((we) => we.id !== weId),
    ctx,
  );
}

export function restoreExercise<W extends ExerciseContainer>(
  w: W,
  we: WorkoutExercise,
  index: number,
  ctx: OpsCtx,
): W {
  const list = w.exercises.filter((e) => e.id !== we.id);
  list.splice(clampIndex(index, list.length), 0, we);
  return withExercises(w, list, ctx);
}

export function moveExercise<W extends ExerciseContainer>(
  w: W,
  weId: string,
  dir: -1 | 1,
  ctx: OpsCtx,
): W {
  const from = w.exercises.findIndex((we) => we.id === weId);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= w.exercises.length) return w;
  const list = [...w.exercises];
  const [moved] = list.splice(from, 1);
  if (!moved) return w;
  list.splice(to, 0, moved);
  return withExercises(w, list, ctx);
}

export function setExerciseNotes<W extends ExerciseContainer>(
  w: W,
  weId: string,
  notes: string,
  ctx: OpsCtx,
): W {
  const text = cleanNotes(notes);
  return mapExercise(w, weId, ctx, (we) => {
    const next: WorkoutExercise = { ...we };
    delete next.notes;
    if (text !== '') next.notes = text;
    return next;
  });
}

export function addSet<W extends ExerciseContainer>(w: W, weId: string, ctx: OpsCtx): W {
  return mapExercise(w, weId, ctx, (we) => {
    const last = we.sets[we.sets.length - 1];
    const next = emptySet(ctx);
    if (last?.weightKg !== undefined) next.weightKg = last.weightKg;
    if (last?.reps !== undefined) next.reps = last.reps;
    if (last?.durationSec !== undefined) next.durationSec = last.durationSec;
    return { ...we, sets: [...we.sets, next] };
  });
}

function applyPatch(set: WorkoutSet, patch: SetPatch): WorkoutSet {
  const out: WorkoutSet = { ...set };
  for (const k of ['weightKg', 'reps', 'durationSec'] as const) {
    const v = patch[k];
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

function mapSet<W extends ExerciseContainer>(
  w: W,
  weId: string,
  setId: string,
  ctx: OpsCtx,
  fn: (s: WorkoutSet) => WorkoutSet,
): W {
  const found = w.exercises.some((we) => we.id === weId && we.sets.some((s) => s.id === setId));
  if (!found) return w;
  return mapExercise(w, weId, ctx, (we) => ({
    ...we,
    sets: we.sets.map((s) => (s.id === setId ? fn(s) : s)),
  }));
}

export function updateSet<W extends ExerciseContainer>(
  w: W,
  weId: string,
  setId: string,
  patch: SetPatch,
  ctx: OpsCtx,
): W {
  return mapSet(w, weId, setId, ctx, (s) => applyPatch(s, patch));
}

export function setCompleted(
  w: Workout,
  weId: string,
  setId: string,
  completed: boolean,
  ctx: OpsCtx,
): Workout {
  return mapSet(w, weId, setId, ctx, (s) => {
    const next: WorkoutSet = { ...s, completed };
    delete next.completedAt;
    if (completed) next.completedAt = ctx.now;
    return next;
  });
}

export function removeSet<W extends ExerciseContainer>(
  w: W,
  weId: string,
  setId: string,
  ctx: OpsCtx,
): W {
  return mapExercise(w, weId, ctx, (we) => ({
    ...we,
    sets: we.sets.filter((s) => s.id !== setId),
  }));
}

export function restoreSet<W extends ExerciseContainer>(
  w: W,
  weId: string,
  set: WorkoutSet,
  index: number,
  ctx: OpsCtx,
): W {
  return mapExercise(w, weId, ctx, (we) => {
    const sets = we.sets.filter((s) => s.id !== set.id);
    sets.splice(clampIndex(index, sets.length), 0, set);
    return { ...we, sets };
  });
}

export function setSetType<W extends ExerciseContainer>(
  w: W,
  weId: string,
  setId: string,
  type: SetType,
  ctx: OpsCtx,
): W {
  const current = w.exercises.find((we) => we.id === weId)?.sets.find((s) => s.id === setId);
  if (!current || current.type === type) return w;
  return mapSet(w, weId, setId, ctx, (s) => ({ ...s, type }));
}

export function setRestSeconds<W extends ExerciseContainer>(
  w: W,
  weId: string,
  sec: number | null,
  ctx: OpsCtx,
): W {
  const we = w.exercises.find((e) => e.id === weId);
  if (!we) return w;
  const next = sec === null ? undefined : clampRestSeconds(sec);
  if (we.restSeconds === next) return w;
  return mapExercise(w, weId, ctx, (e) => {
    const out: WorkoutExercise = { ...e };
    delete out.restSeconds;
    if (next !== undefined) out.restSeconds = next;
    return out;
  });
}

export function rename(w: Workout, name: string, ctx: OpsCtx): Workout {
  const text = name.trim().slice(0, NAME_MAX);
  if (text === '') return w;
  return { ...w, name: text, updatedAt: ctx.now };
}

export function setNotes(w: Workout, notes: string, ctx: OpsCtx): Workout {
  const text = cleanNotes(notes);
  const next: Workout = { ...w, updatedAt: ctx.now };
  delete next.notes;
  if (text !== '') next.notes = text;
  return next;
}

export function defaultWorkoutName(startedAt: number): string {
  const h = new Date(startedAt).getHours();
  if (h >= 5 && h <= 11) return 'Morning Workout';
  if (h >= 12 && h <= 16) return 'Afternoon Workout';
  if (h >= 17 && h <= 21) return 'Evening Workout';
  return 'Night Workout';
}
