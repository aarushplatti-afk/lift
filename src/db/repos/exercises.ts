import { db } from '../schema';
import { enqueue, runWrite } from './outbox';
import { requireUserId } from './meta';
import { newId } from '../../lib/ids';
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  NAME_MAX,
  NOTES_MAX,
  matchesQuery,
  nameKey,
  normalizeName,
} from '../../lib/exercises';
import type { Equipment, Exercise, ExerciseType, MuscleGroup } from '../../types/domain';

export interface ExerciseInput {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  type: ExerciseType;
  notes?: string;
}
export type ExercisePatch = Partial<ExerciseInput>;
export interface ExerciseQuery {
  includeArchived?: boolean;
  query?: string;
  muscleGroup?: MuscleGroup;
}
export type ExerciseFieldError =
  | { field: 'name'; code: 'required' | 'too_long' | 'duplicate' | 'locked' }
  | { field: 'muscleGroup' | 'equipment'; code: 'required' }
  | { field: 'type'; code: 'locked' }
  | { field: 'notes'; code: 'too_long' };
export type ExerciseWriteResult =
  { ok: true; exercise: Exercise } | { ok: false; error: ExerciseFieldError };

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function compareExercises(a: Exercise, b: Exercise): number {
  return collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function normalizeNotes(notes: string | undefined): string | undefined {
  const t = notes?.trim();
  return t ? t : undefined;
}

function validateFields(fields: {
  name: string;
  muscleGroup: string;
  equipment: string;
  notes?: string;
}): ExerciseFieldError | undefined {
  if (fields.name === '') return { field: 'name', code: 'required' };
  if (fields.name.length > NAME_MAX) return { field: 'name', code: 'too_long' };
  if (!MUSCLE_GROUPS.some((m) => m.value === fields.muscleGroup)) {
    return { field: 'muscleGroup', code: 'required' };
  }
  if (!EQUIPMENT.some((e) => e.value === fields.equipment)) {
    return { field: 'equipment', code: 'required' };
  }
  if (fields.notes !== undefined && fields.notes.length > NOTES_MAX) {
    return { field: 'notes', code: 'too_long' };
  }
  return undefined;
}

function requireValidType(type: string): void {
  if (!EXERCISE_TYPES.some((t) => t.value === type)) {
    throw new RangeError(`Invalid exercise type: ${type}`);
  }
}

export async function listExercises(q: ExerciseQuery = {}): Promise<Exercise[]> {
  const query = q.query?.trim() ?? '';
  const rows = await db.exercises.toArray();
  return rows
    .filter(
      (e) =>
        (q.includeArchived === true || !e.archived) &&
        (q.muscleGroup === undefined || e.muscleGroup === q.muscleGroup) &&
        matchesQuery(e.name, query),
    )
    .sort(compareExercises);
}

export function getExercise(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id);
}

export async function isNameTaken(name: string, excludeId?: string): Promise<boolean> {
  const key = nameKey(name);
  const hit = await db.exercises
    .filter((e) => !e.archived && e.id !== excludeId && nameKey(e.name) === key)
    .first();
  return hit !== undefined;
}

export async function isExerciseUsed(id: string): Promise<boolean> {
  const workout = await db.workouts
    .filter((w) => w.exercises.some((e) => e.exerciseId === id))
    .first();
  if (workout) return true;
  const template = await db.templates
    .filter((t) => t.exercises.some((e) => e.exerciseId === id))
    .first();
  return template !== undefined;
}

export async function createExercise(input: ExerciseInput): Promise<ExerciseWriteResult> {
  const userId = await requireUserId();
  const name = normalizeName(input.name);
  const notes = normalizeNotes(input.notes);
  const error = validateFields({
    name,
    muscleGroup: input.muscleGroup,
    equipment: input.equipment,
    notes,
  });
  if (error) return { ok: false, error };
  requireValidType(input.type);
  return runWrite(['exercises'], async (): Promise<ExerciseWriteResult> => {
    if (await isNameTaken(name)) return { ok: false, error: { field: 'name', code: 'duplicate' } };
    const now = Date.now();
    const exercise: Exercise = {
      id: newId(),
      userId,
      name,
      muscleGroup: input.muscleGroup,
      equipment: input.equipment,
      type: input.type,
      isCustom: true,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    if (notes !== undefined) exercise.notes = notes;
    await db.exercises.put(exercise);
    await enqueue('exercises', exercise.id, 'upsert', exercise);
    return { ok: true, exercise };
  });
}

export async function updateExercise(
  id: string,
  patch: ExercisePatch,
): Promise<ExerciseWriteResult> {
  await requireUserId();
  return runWrite(
    ['exercises', 'workouts', 'templates'],
    async (): Promise<ExerciseWriteResult> => {
      const current = await db.exercises.get(id);
      if (!current) throw new Error('Exercise not found');

      const name = patch.name === undefined ? current.name : normalizeName(patch.name);
      const muscleGroup = patch.muscleGroup ?? current.muscleGroup;
      const equipment = patch.equipment ?? current.equipment;
      const type = patch.type ?? current.type;
      const notes = patch.notes === undefined ? current.notes : normalizeNotes(patch.notes);

      const error = validateFields({ name, muscleGroup, equipment, notes });
      if (error) return { ok: false, error };
      requireValidType(type);

      if (name !== current.name && !current.isCustom) {
        return { ok: false, error: { field: 'name', code: 'locked' } };
      }
      if (type !== current.type && (!current.isCustom || (await isExerciseUsed(id)))) {
        return { ok: false, error: { field: 'type', code: 'locked' } };
      }
      if (
        !current.archived &&
        nameKey(name) !== nameKey(current.name) &&
        (await isNameTaken(name, id))
      ) {
        return { ok: false, error: { field: 'name', code: 'duplicate' } };
      }

      if (
        name === current.name &&
        muscleGroup === current.muscleGroup &&
        equipment === current.equipment &&
        type === current.type &&
        notes === current.notes
      ) {
        return { ok: true, exercise: current };
      }

      const exercise: Exercise = {
        id: current.id,
        userId: current.userId,
        name,
        muscleGroup,
        equipment,
        type,
        isCustom: current.isCustom,
        archived: current.archived,
        createdAt: current.createdAt,
        updatedAt: Date.now(),
      };
      if (notes !== undefined) exercise.notes = notes;
      await db.exercises.put(exercise);
      await enqueue('exercises', id, 'upsert', exercise);
      return { ok: true, exercise };
    },
  );
}

export async function deleteOrArchiveExercise(id: string): Promise<'deleted' | 'archived'> {
  await requireUserId();
  return runWrite(['exercises', 'workouts', 'templates'], async () => {
    const current = await db.exercises.get(id);
    if (!current) throw new Error('Exercise not found');
    if (current.isCustom && !(await isExerciseUsed(id))) {
      await db.exercises.delete(id);
      await enqueue('exercises', id, 'delete');
      return 'deleted' as const;
    }
    if (!current.archived) {
      const archived: Exercise = { ...current, archived: true, updatedAt: Date.now() };
      await db.exercises.put(archived);
      await enqueue('exercises', id, 'upsert', archived);
    }
    return 'archived' as const;
  });
}

export async function restoreExercise(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: 'name_taken' }> {
  await requireUserId();
  return runWrite(['exercises'], async () => {
    const current = await db.exercises.get(id);
    if (!current) throw new Error('Exercise not found');
    if (!current.archived) return { ok: true as const };
    if (await isNameTaken(current.name, id)) {
      return { ok: false as const, reason: 'name_taken' as const };
    }
    const restored: Exercise = { ...current, archived: false, updatedAt: Date.now() };
    await db.exercises.put(restored);
    await enqueue('exercises', id, 'upsert', restored);
    return { ok: true as const };
  });
}
