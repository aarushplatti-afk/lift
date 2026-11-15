import { v5 } from 'uuid';
import { z } from 'zod';
import type { BodyweightEntry, Exercise, SettingsData, Template, Workout } from '../types/domain';
import { BW_NOTE_MAX, validateBodyweightKg } from './calc/bodyweight';
import { clampRestSeconds } from './calc/rest';
import { isLocalDateString, todayLocal } from './dates';
import { NAME_MAX, NOTES_MAX, nameKey } from './exercises';
import { bodyweightId, seededExerciseId, userNamespace } from './ids';

export const BACKUP_FORMAT = 'lift-backup';
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_MAX_BYTES = 25 * 1024 * 1024;

export interface BackupData {
  exercises: Exercise[];
  workouts: Workout[];
  templates: Template[];
  bodyweight: BodyweightEntry[];
  settings: SettingsData;
}

export interface LiftBackup extends BackupData {
  format: 'lift-backup';
  schemaVersion: 1;
  exportedAt: string;
  appVersion: string;
  userId: string;
}

export interface BackupCounts {
  exercises: number;
  customExercises: number;
  workouts: number;
  templates: number;
  bodyweight: number;
}

export interface BackupSummary extends BackupCounts {
  exportedAt: string;
  fromOtherAccount: boolean;
}

export type ParseResult =
  { ok: true; backup: LiftBackup } | { ok: false; error: string; issues: string[] };

// Mirrors DEFAULT_SETTINGS in src/db/repos/settings.ts, which cannot be imported
// here because that module pulls in Dexie. A test asserts the two stay equal.
const SETTINGS_DEFAULTS: SettingsData = {
  unit: 'lb',
  theme: 'dark',
  defaultRestSeconds: 90,
  restTimerAutoStart: true,
  keepScreenAwakeDuringWorkout: true,
  hapticsEnabled: true,
  soundEnabled: true,
  weightIncrementLb: 5,
  weightIncrementKg: 2.5,
  schemaVersion: 1,
};

const GOAL_MAX_KG = 700;
const WEIGHT_MAX_KG = 10000;
const MAX_ISSUES = 5;

const MSG_NEWER = 'This backup was made by a newer version of Lift.';
const MSG_TOO_BIG = 'This file is too large to be a Lift backup.';
const MSG_NOT_JSON = 'This file is not valid JSON.';
const MSG_WRONG_FORMAT = 'This file is not a Lift backup.';
const MSG_INVALID = 'This backup file is damaged or has invalid data.';

const topId = z.guid();
const nestedId = z.string().min(1).max(64);
const epoch = z.number().nonnegative();
const nonNegInt = z.number().int().nonnegative();
const kg = z.number().min(0).max(WEIGHT_MAX_KG);
const notes = z.string().max(NOTES_MAX);
const setType = z.enum(['normal', 'warmup', 'drop', 'failure']);

const exerciseSchema = z.object({
  id: topId,
  userId: nestedId,
  updatedAt: epoch,
  name: z.string().max(NAME_MAX),
  muscleGroup: z.enum([
    'chest',
    'back',
    'shoulders',
    'biceps',
    'triceps',
    'quads',
    'hamstrings',
    'glutes',
    'calves',
    'core',
    'forearms',
    'full_body',
    'cardio',
    'other',
  ]),
  equipment: z.enum([
    'barbell',
    'dumbbell',
    'machine',
    'cable',
    'bodyweight',
    'kettlebell',
    'band',
    'other',
  ]),
  type: z.enum(['weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'duration']),
  isCustom: z.boolean(),
  archived: z.boolean(),
  notes: notes.optional(),
  createdAt: epoch,
});

const workoutSetSchema = z.object({
  id: nestedId,
  order: nonNegInt,
  type: setType,
  weightKg: kg.optional(),
  reps: nonNegInt.optional(),
  durationSec: nonNegInt.optional(),
  completed: z.boolean(),
  completedAt: epoch.optional(),
  isPR: z.literal(true).optional(),
});

const workoutExerciseSchema = z.object({
  id: nestedId,
  exerciseId: nestedId,
  order: nonNegInt,
  notes: notes.optional(),
  restSeconds: nonNegInt.optional(),
  sets: z.array(workoutSetSchema),
});

const workoutSchema = z.object({
  id: topId,
  userId: nestedId,
  updatedAt: epoch,
  name: z.string().max(NAME_MAX),
  startedAt: epoch,
  endedAt: epoch,
  status: z.literal('completed', { error: 'Only completed workouts can be imported.' }),
  templateId: nestedId.optional(),
  notes: notes.optional(),
  exercises: z.array(workoutExerciseSchema),
  createdAt: epoch,
});

const templateSetSchema = z.object({
  type: setType,
  targetReps: nonNegInt.optional(),
  targetWeightKg: kg.optional(),
  targetDurationSec: nonNegInt.optional(),
});

const templateExerciseSchema = z.object({
  exerciseId: nestedId,
  order: nonNegInt,
  restSeconds: nonNegInt.optional(),
  sets: z.array(templateSetSchema),
});

const templateSchema = z.object({
  id: topId,
  userId: nestedId,
  updatedAt: epoch,
  name: z.string().max(NAME_MAX),
  exercises: z.array(templateExerciseSchema),
  createdAt: epoch,
  lastUsedAt: epoch.optional(),
});

const bodyweightSchema = z.object({
  id: topId,
  userId: nestedId,
  updatedAt: epoch,
  date: z.string(),
  weightKg: z.number(),
  note: z.string().max(BW_NOTE_MAX).optional(),
  createdAt: epoch,
});

const settingsSchema = z
  .object({
    unit: z.enum(['lb', 'kg']).optional(),
    theme: z.enum(['dark', 'light', 'system']).optional(),
    defaultRestSeconds: z.number().positive().optional(),
    restTimerAutoStart: z.boolean().optional(),
    keepScreenAwakeDuringWorkout: z.boolean().optional(),
    hapticsEnabled: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
    weightIncrementLb: z.number().positive().optional(),
    weightIncrementKg: z.number().positive().optional(),
    bodyweightGoalKg: z.number().gt(0).lt(GOAL_MAX_KG).optional(),
    schemaVersion: z.number().int().positive().optional(),
  })
  .transform((s): SettingsData => {
    const merged: SettingsData = { ...SETTINGS_DEFAULTS, ...s };
    return { ...merged, defaultRestSeconds: clampRestSeconds(merged.defaultRestSeconds) };
  });

type Path = (string | number)[];

function duplicateIds(
  ctx: z.RefinementCtx,
  collection: string,
  items: readonly { id: string }[],
): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: 'custom', path: [collection, i, 'id'], message: 'Duplicate id' });
    }
    seen.add(item.id);
  });
}

function crossChecks(b: Omit<LiftBackup, 'settings'>, ctx: z.RefinementCtx): void {
  const issue = (path: Path, message: string): void => {
    ctx.addIssue({ code: 'custom', path, message });
  };

  duplicateIds(ctx, 'exercises', b.exercises);
  duplicateIds(ctx, 'workouts', b.workouts);
  duplicateIds(ctx, 'templates', b.templates);
  duplicateIds(ctx, 'bodyweight', b.bodyweight);

  const exerciseIds = new Set(b.exercises.map((e) => e.id));
  const names = new Set<string>();
  b.exercises.forEach((e, i) => {
    if (nameKey(e.name) === '') issue(['exercises', i, 'name'], 'Name is required');
    if (e.archived) return;
    const key = nameKey(e.name);
    if (names.has(key)) issue(['exercises', i, 'name'], 'Duplicate exercise name');
    names.add(key);
  });

  b.workouts.forEach((w, wi) => {
    if (w.endedAt !== undefined && w.endedAt < w.startedAt) {
      issue(['workouts', wi, 'endedAt'], 'Ended before it started');
    }
    w.exercises.forEach((we, ei) => {
      if (!exerciseIds.has(we.exerciseId)) {
        issue(['workouts', wi, 'exercises', ei, 'exerciseId'], 'Unknown exercise');
      }
    });
  });

  b.templates.forEach((t, ti) => {
    if (nameKey(t.name) === '') issue(['templates', ti, 'name'], 'Name is required');
    t.exercises.forEach((te, ei) => {
      if (!exerciseIds.has(te.exerciseId)) {
        issue(['templates', ti, 'exercises', ei, 'exerciseId'], 'Unknown exercise');
      }
    });
  });

  const dates = new Set<string>();
  b.bodyweight.forEach((e, i) => {
    if (!isLocalDateString(e.date)) issue(['bodyweight', i, 'date'], 'Invalid date');
    if (dates.has(e.date)) issue(['bodyweight', i, 'date'], 'Duplicate date');
    dates.add(e.date);
    const bad = validateBodyweightKg(e.weightKg);
    if (bad !== undefined) issue(['bodyweight', i, 'weightKg'], 'Weight out of range');
  });
}

export const backupSchema: z.ZodType<LiftBackup> = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
    exportedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid timestamp'),
    appVersion: z.string().max(64),
    userId: topId,
    exercises: z.array(exerciseSchema),
    workouts: z.array(workoutSchema),
    templates: z.array(templateSchema),
    bodyweight: z.array(bodyweightSchema),
    settings: settingsSchema,
  })
  .superRefine((b, ctx) => {
    crossChecks(b, ctx);
  });

const PLACEHOLDER_NAME = 'Unknown exercise';

function placeholderExercises(
  data: BackupData,
  meta: { userId: string; exportedAt: number },
): Exercise[] {
  const known = new Set(data.exercises.map((e) => e.id));
  const taken = new Set(data.exercises.map((e) => nameKey(e.name)));
  const missing: string[] = [];
  const note = (id: string): void => {
    if (known.has(id)) return;
    known.add(id);
    missing.push(id);
  };
  for (const w of data.workouts) for (const we of w.exercises) note(we.exerciseId);
  for (const t of data.templates) for (const te of t.exercises) note(te.exerciseId);

  return missing.map((id) => {
    let name = PLACEHOLDER_NAME;
    for (let n = 2; taken.has(nameKey(name)); n++) name = `${PLACEHOLDER_NAME} ${n}`;
    taken.add(nameKey(name));
    return {
      id,
      userId: meta.userId,
      updatedAt: meta.exportedAt,
      name,
      muscleGroup: 'other',
      equipment: 'other',
      type: 'weight_reps',
      isCustom: true,
      archived: true,
      createdAt: meta.exportedAt,
    };
  });
}

export function buildBackup(
  data: BackupData,
  meta: { userId: string; exportedAt: number; appVersion: string },
): LiftBackup {
  const placeholders = placeholderExercises(data, meta);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date(meta.exportedAt).toISOString(),
    appVersion: meta.appVersion,
    userId: meta.userId,
    exercises: placeholders.length === 0 ? data.exercises : [...data.exercises, ...placeholders],
    workouts: data.workouts,
    templates: data.templates,
    bodyweight: data.bodyweight,
    settings: data.settings,
  };
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => normalize(v));
  if (value !== null && typeof value === 'object') {
    const entries: [string, unknown][] = [];
    for (const [k, v] of Object.entries(value)) {
      if (v === null || (k === 'isPR' && v === false)) continue;
      entries.push([k, normalize(v)]);
    }
    return Object.fromEntries(entries);
  }
  return value;
}

function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const part of path) {
    if (typeof part === 'number') out += `[${part}]`;
    else out += out === '' ? String(part) : `.${String(part)}`;
  }
  return out;
}

function fail(error: string, issues: string[] = []): ParseResult {
  return { ok: false, error, issues };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function parseBackup(text: string): ParseResult {
  if (
    text.length > BACKUP_MAX_BYTES ||
    (text.length * 3 > BACKUP_MAX_BYTES && byteLength(text) > BACKUP_MAX_BYTES)
  ) {
    return fail(MSG_TOO_BIG);
  }
  let json: unknown;
  try {
    json = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return fail(MSG_NOT_JSON);
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return fail(MSG_WRONG_FORMAT);
  }
  const head = json as { format?: unknown; schemaVersion?: unknown };
  if (head.format !== BACKUP_FORMAT) return fail(MSG_WRONG_FORMAT);
  if (typeof head.schemaVersion === 'number' && head.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return fail(MSG_NEWER);
  }
  const result = backupSchema.safeParse(normalize(json));
  if (result.success) return { ok: true, backup: result.data };
  const issues = result.error.issues
    .slice(0, MAX_ISSUES)
    .map((i) => `${formatPath(i.path)}: ${i.message}`);
  return fail(MSG_INVALID, issues);
}

export function summarizeBackup(b: LiftBackup, ownerId: string): BackupSummary {
  return {
    exercises: b.exercises.length,
    customExercises: b.exercises.filter((e) => e.isCustom).length,
    workouts: b.workouts.length,
    templates: b.templates.length,
    bodyweight: b.bodyweight.length,
    exportedAt: b.exportedAt,
    fromOtherAccount: b.userId !== ownerId,
  };
}

export function remapForUser(b: LiftBackup, ownerId: string): LiftBackup {
  if (b.userId === ownerId) return b;
  const ns = userNamespace(ownerId);
  const derive = (oldId: string): string => v5(oldId, ns);

  const exerciseIds = new Map<string, string>();
  const taken = new Set<string>();
  for (const e of b.exercises) {
    let id = e.isCustom ? derive(e.id) : seededExerciseId(ownerId, e.name);
    if (taken.has(id)) id = derive(e.id);
    taken.add(id);
    exerciseIds.set(e.id, id);
  }
  const mapExercise = (id: string): string => exerciseIds.get(id) ?? derive(id);

  return {
    ...b,
    userId: ownerId,
    exercises: b.exercises.map((e) => ({ ...e, id: mapExercise(e.id), userId: ownerId })),
    workouts: b.workouts.map((w) => ({
      ...w,
      id: derive(w.id),
      userId: ownerId,
      ...(w.templateId === undefined ? {} : { templateId: derive(w.templateId) }),
      exercises: w.exercises.map((we) => ({ ...we, exerciseId: mapExercise(we.exerciseId) })),
    })),
    templates: b.templates.map((t) => ({
      ...t,
      id: derive(t.id),
      userId: ownerId,
      exercises: t.exercises.map((te) => ({ ...te, exerciseId: mapExercise(te.exerciseId) })),
    })),
    bodyweight: b.bodyweight.map((e) => ({
      ...e,
      id: bodyweightId(ownerId, e.date),
      userId: ownerId,
    })),
  };
}

export function backupFileName(now: number): string {
  return `lift-backup-${todayLocal(now)}.json`;
}
