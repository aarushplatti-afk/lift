import type {
  Exercise,
  Template,
  TemplateExercise,
  TemplateSet,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../types/domain';
import { clampRestSeconds } from './calc/rest';
import { NAME_MAX, normalizeName } from './exercises';
import type { ExerciseContainer, OpsCtx, WorkoutInit } from './workoutOps';

export interface TemplateInput {
  name: string;
  exercises: TemplateExercise[];
}

export interface TemplateDraft extends ExerciseContainer {
  id: string | null;
  name: string;
}

export type TemplateFieldError =
  { field: 'name'; code: 'required' | 'too_long' } | { field: 'exercises'; code: 'required' };

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

export function validateTemplateInput(i: TemplateInput): TemplateFieldError | undefined {
  const name = normalizeName(i.name);
  if (name === '') return { field: 'name', code: 'required' };
  if (name.length > NAME_MAX) return { field: 'name', code: 'too_long' };
  if (i.exercises.length === 0) return { field: 'exercises', code: 'required' };
  return undefined;
}

function checkTarget(v: number, what: string, integer: boolean): number {
  if (!Number.isFinite(v) || v < 0 || (integer && !Number.isInteger(v))) {
    throw new RangeError(`Invalid ${what}: ${v}`);
  }
  return v;
}

function normalizeSet(s: TemplateSet): TemplateSet {
  const out: TemplateSet = { type: s.type };
  if (s.targetReps !== undefined) out.targetReps = checkTarget(s.targetReps, 'targetReps', true);
  if (s.targetWeightKg !== undefined) {
    out.targetWeightKg = checkTarget(s.targetWeightKg, 'targetWeightKg', false);
  }
  if (s.targetDurationSec !== undefined) {
    out.targetDurationSec = checkTarget(s.targetDurationSec, 'targetDurationSec', false);
  }
  return out;
}

function byOrder<T extends { order: number }>(list: readonly T[]): T[] {
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.order - b.item.order || a.index - b.index)
    .map((x) => x.item);
}

export function normalizeTemplateExercises(list: readonly TemplateExercise[]): TemplateExercise[] {
  return byOrder(list).map((e, order) => {
    const out: TemplateExercise = {
      exerciseId: e.exerciseId,
      order,
      sets: e.sets.map(normalizeSet),
    };
    if (e.restSeconds !== undefined) out.restSeconds = clampRestSeconds(e.restSeconds);
    return out;
  });
}

function templateSetFromWorkoutSet(s: WorkoutSet): TemplateSet {
  const out: TemplateSet = { type: s.type };
  if (s.reps !== undefined) out.targetReps = s.reps;
  if (s.weightKg !== undefined) out.targetWeightKg = s.weightKg;
  if (s.durationSec !== undefined) out.targetDurationSec = s.durationSec;
  return out;
}

export function templateExercisesFromDraft(list: readonly WorkoutExercise[]): TemplateExercise[] {
  return byOrder(list).map((we, order) => {
    const out: TemplateExercise = {
      exerciseId: we.exerciseId,
      order,
      sets: byOrder(we.sets).map(templateSetFromWorkoutSet),
    };
    if (we.restSeconds !== undefined) out.restSeconds = we.restSeconds;
    return out;
  });
}

export function templateFromWorkout(w: Workout): TemplateInput {
  const kept = byOrder(w.exercises)
    .map((we) => ({ ...we, sets: we.sets.filter((s) => s.completed) }))
    .filter((we) => we.sets.length > 0);
  return { name: w.name, exercises: templateExercisesFromDraft(kept) };
}

export function workoutExercisesFromTemplate(
  list: readonly TemplateExercise[],
  ctx: OpsCtx,
): WorkoutExercise[] {
  return mapTemplateExercises(list, ctx, true);
}

function mapTemplateExercises(
  list: readonly TemplateExercise[],
  ctx: OpsCtx,
  fillEmpty: boolean,
): WorkoutExercise[] {
  return byOrder(list).map((te) => {
    const sets: WorkoutSet[] =
      te.sets.length === 0 && fillEmpty
        ? [{ id: ctx.newId(), order: 0, type: 'normal', completed: false }]
        : te.sets.map((ts, j) => {
            const s: WorkoutSet = { id: ctx.newId(), order: j, type: ts.type, completed: false };
            if (ts.targetWeightKg !== undefined) s.weightKg = ts.targetWeightKg;
            if (ts.targetReps !== undefined) s.reps = ts.targetReps;
            if (ts.targetDurationSec !== undefined) s.durationSec = ts.targetDurationSec;
            return s;
          });
    const we: WorkoutExercise = {
      id: ctx.newId(),
      exerciseId: te.exerciseId,
      order: te.order,
      sets,
    };
    if (te.restSeconds !== undefined) we.restSeconds = te.restSeconds;
    return we;
  });
}

export function workoutInitFromTemplate(t: Template, ctx: OpsCtx): WorkoutInit {
  return {
    name: t.name,
    templateId: t.id,
    exercises: workoutExercisesFromTemplate(t.exercises, ctx),
  };
}

export function draftFromTemplate(t: Template, ctx: OpsCtx): TemplateDraft {
  return {
    id: t.id,
    name: t.name,
    exercises: mapTemplateExercises(t.exercises, ctx, false),
    updatedAt: ctx.now,
  };
}

export function emptyDraft(now: number): TemplateDraft {
  return { id: null, name: '', exercises: [], updatedAt: now };
}

export function draftToInput(d: TemplateDraft): TemplateInput {
  return { name: d.name, exercises: templateExercisesFromDraft(d.exercises) };
}

export function draftKey(d: TemplateDraft): string {
  const input = draftToInput(d);
  return JSON.stringify({ name: input.name.trim(), exercises: input.exercises });
}

export function templateSummary(t: Template, names: ReadonlyMap<string, Exercise>): string {
  const list = byOrder(t.exercises);
  if (list.length === 0) return 'No exercises';
  const shown = list.slice(0, 2).map((e) => names.get(e.exerciseId)?.name ?? 'Deleted exercise');
  if (list.length > 2) shown.push(`+${list.length - 2}`);
  return shown.join(', ');
}

export function compareTemplates(a: Template, b: Template): number {
  const ka = a.lastUsedAt ?? a.createdAt;
  const kb = b.lastUsedAt ?? b.createdAt;
  if (ka !== kb) return kb - ka;
  const byName = collator.compare(a.name, b.name);
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function duplicateName(name: string): string {
  return `Copy of ${name}`.slice(0, NAME_MAX).trimEnd();
}
