import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { getSeedVersion, setOwner, setSeedVersion, wipeLocalData } from '../repos/meta';
import {
  createExercise,
  deleteOrArchiveExercise,
  getExercise,
  isExerciseUsed,
  isNameTaken,
  listExercises,
  restoreExercise,
  updateExercise,
  type ExerciseInput,
} from '../repos/exercises';
import type { Exercise, Template, Workout } from '../../types/domain';

const BENCH: ExerciseInput = {
  name: 'Bench Press',
  muscleGroup: 'chest',
  equipment: 'barbell',
  type: 'weight_reps',
};

function row(id: string, name: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id,
    userId: 'u1',
    name,
    muscleGroup: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
    isCustom: true,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function workoutWith(exerciseId: string, status: Workout['status'] = 'completed'): Workout {
  return {
    id: `w-${exerciseId}`,
    userId: 'u1',
    name: 'W',
    startedAt: 1,
    status,
    createdAt: 1,
    updatedAt: 1,
    exercises: [{ id: 'we1', exerciseId, order: 0, sets: [] }],
  };
}

function templateWith(exerciseId: string): Template {
  return {
    id: `t-${exerciseId}`,
    userId: 'u1',
    name: 'T',
    createdAt: 1,
    updatedAt: 1,
    exercises: [{ exerciseId, order: 0, sets: [] }],
  };
}

async function created(input: ExerciseInput = BENCH): Promise<Exercise> {
  const r = await createExercise(input);
  if (!r.ok) throw new Error('create failed');
  await db.syncQueue.clear();
  return r.exercise;
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
});

describe('createExercise', () => {
  it('normalizes the name and enqueues one upsert', async () => {
    const r = await createExercise({ ...BENCH, name: '  Zercher   Squat ', notes: '  hi  ' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.exercise).toMatchObject({
      name: 'Zercher Squat',
      notes: 'hi',
      userId: 'u1',
      isCustom: true,
      archived: false,
    });
    expect(await db.exercises.get(r.exercise.id)).toEqual(r.exercise);
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ table: 'exercises', recordId: r.exercise.id, op: 'upsert' });
    expect(q[0]?.payload).toEqual(r.exercise);
  });

  it('omits empty notes', async () => {
    const r = await createExercise({ ...BENCH, notes: '   ' });
    expect(r.ok && 'notes' in r.exercise).toBe(false);
  });

  it('validates fields without writing', async () => {
    expect(await createExercise({ ...BENCH, name: '   ' })).toEqual({
      ok: false,
      error: { field: 'name', code: 'required' },
    });
    expect(await createExercise({ ...BENCH, name: 'x'.repeat(61) })).toEqual({
      ok: false,
      error: { field: 'name', code: 'too_long' },
    });
    expect((await createExercise({ ...BENCH, name: 'x'.repeat(60) })).ok).toBe(true);
    await db.exercises.clear();
    await db.syncQueue.clear();
    expect(
      await createExercise({ ...BENCH, muscleGroup: '' as ExerciseInput['muscleGroup'] }),
    ).toEqual({ ok: false, error: { field: 'muscleGroup', code: 'required' } });
    expect(await createExercise({ ...BENCH, equipment: '' as ExerciseInput['equipment'] })).toEqual(
      { ok: false, error: { field: 'equipment', code: 'required' } },
    );
    expect(await createExercise({ ...BENCH, notes: 'n'.repeat(501) })).toEqual({
      ok: false,
      error: { field: 'notes', code: 'too_long' },
    });
    expect(await db.exercises.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('rejects an invalid type', async () => {
    await expect(
      createExercise({ ...BENCH, type: 'nope' as ExerciseInput['type'] }),
    ).rejects.toThrow(RangeError);
  });

  it('detects duplicates by normalized, case-insensitive name', async () => {
    await created();
    const r = await createExercise({ ...BENCH, name: '  bench PRESS ' });
    expect(r).toEqual({ ok: false, error: { field: 'name', code: 'duplicate' } });
    expect(await db.exercises.count()).toBe(1);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('does not collide with an archived row of the same name', async () => {
    await db.exercises.put(row('a1', 'Bench Press', { archived: true }));
    expect((await createExercise(BENCH)).ok).toBe(true);
  });
});

describe('updateExercise', () => {
  it('throws when the exercise does not exist', async () => {
    await expect(updateExercise('missing', { notes: 'x' })).rejects.toThrow('Exercise not found');
  });

  it('updates fields, bumps updatedAt, and enqueues one upsert', async () => {
    const ex = await created();
    await db.exercises.update(ex.id, { updatedAt: 1 });
    const r = await updateExercise(ex.id, { muscleGroup: 'triceps', notes: ' note ' });
    expect(r.ok).toBe(true);
    const saved = await getExercise(ex.id);
    expect(saved).toMatchObject({ muscleGroup: 'triceps', notes: 'note' });
    expect(saved?.updatedAt).toBeGreaterThan(1);
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]?.payload).toEqual(saved);
  });

  it('clears notes with an empty string', async () => {
    const ex = await created({ ...BENCH, notes: 'x' });
    await updateExercise(ex.id, { notes: '' });
    expect(await getExercise(ex.id)).not.toHaveProperty('notes');
  });

  it('is a no-op when nothing changes', async () => {
    const ex = await created();
    const before = await getExercise(ex.id);
    const r = await updateExercise(ex.id, { name: '  Bench   Press ', muscleGroup: 'chest' });
    expect(r.ok).toBe(true);
    expect(await getExercise(ex.id)).toEqual(before);
    expect(await db.syncQueue.count()).toBe(0);
    await updateExercise(ex.id, {});
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('allows renaming to a different case of its own name', async () => {
    const ex = await created();
    const r = await updateExercise(ex.id, { name: 'BENCH press' });
    expect(r.ok).toBe(true);
    expect((await getExercise(ex.id))?.name).toBe('BENCH press');
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('rejects renaming onto another exercise, but not onto an archived one', async () => {
    const a = await created();
    await db.exercises.put(row('x1', 'Squat'));
    const b = await created({ ...BENCH, name: 'Row' });
    expect(await updateExercise(b.id, { name: 'squat' })).toEqual({
      ok: false,
      error: { field: 'name', code: 'duplicate' },
    });
    await db.exercises.update('x1', { archived: true });
    expect((await updateExercise(b.id, { name: 'squat' })).ok).toBe(true);
    expect(a.id).not.toBe(b.id);
  });

  it('skips the duplicate check for archived rows', async () => {
    await db.exercises.put(row('a1', 'Squat'));
    await db.exercises.put(row('a2', 'Row', { archived: true }));
    expect((await updateExercise('a2', { name: 'squat' })).ok).toBe(true);
  });

  it('validates merged fields', async () => {
    const ex = await created();
    expect(await updateExercise(ex.id, { name: ' ' })).toEqual({
      ok: false,
      error: { field: 'name', code: 'required' },
    });
    expect(await updateExercise(ex.id, { notes: 'n'.repeat(501) })).toEqual({
      ok: false,
      error: { field: 'notes', code: 'too_long' },
    });
  });

  it('locks name and type on seeded rows but allows other fields', async () => {
    await db.exercises.put(row('s1', 'Deadlift', { isCustom: false }));
    expect(await updateExercise('s1', { name: 'Dead Lift' })).toEqual({
      ok: false,
      error: { field: 'name', code: 'locked' },
    });
    expect(await updateExercise('s1', { type: 'duration' })).toEqual({
      ok: false,
      error: { field: 'type', code: 'locked' },
    });
    expect((await updateExercise('s1', { notes: 'ok', equipment: 'other' })).ok).toBe(true);
  });

  it('locks type on a used custom exercise but allows it when unused', async () => {
    const ex = await created();
    expect((await updateExercise(ex.id, { type: 'duration' })).ok).toBe(true);
    await db.workouts.put(workoutWith(ex.id));
    expect(await updateExercise(ex.id, { type: 'weight_reps' })).toEqual({
      ok: false,
      error: { field: 'type', code: 'locked' },
    });
    expect((await updateExercise(ex.id, { name: 'Renamed' })).ok).toBe(true);
  });
});

describe('isExerciseUsed', () => {
  it('is false with no references', async () => {
    expect(await isExerciseUsed('e1')).toBe(false);
  });

  it('is true for completed or in-progress workouts', async () => {
    await db.workouts.put(workoutWith('e1', 'in_progress'));
    expect(await isExerciseUsed('e1')).toBe(true);
    await db.workouts.clear();
    await db.workouts.put(workoutWith('e1', 'completed'));
    expect(await isExerciseUsed('e1')).toBe(true);
    expect(await isExerciseUsed('e2')).toBe(false);
  });

  it('is true for templates', async () => {
    await db.templates.put(templateWith('e1'));
    expect(await isExerciseUsed('e1')).toBe(true);
  });
});

describe('deleteOrArchiveExercise', () => {
  it('throws when not found', async () => {
    await expect(deleteOrArchiveExercise('nope')).rejects.toThrow('Exercise not found');
  });

  it('hard-deletes an unused custom exercise with one delete entry', async () => {
    const ex = await created();
    expect(await deleteOrArchiveExercise(ex.id)).toBe('deleted');
    expect(await db.exercises.get(ex.id)).toBeUndefined();
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ table: 'exercises', recordId: ex.id, op: 'delete' });
  });

  it('hard-deletes an archived unused custom exercise', async () => {
    await db.exercises.put(row('a1', 'Old', { archived: true }));
    expect(await deleteOrArchiveExercise('a1')).toBe('deleted');
    expect(await db.exercises.get('a1')).toBeUndefined();
  });

  it('archives a custom exercise used in a workout', async () => {
    const ex = await created();
    await db.workouts.put(workoutWith(ex.id));
    expect(await deleteOrArchiveExercise(ex.id)).toBe('archived');
    expect((await getExercise(ex.id))?.archived).toBe(true);
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ op: 'upsert', recordId: ex.id });
  });

  it('archives a custom exercise used in a template', async () => {
    const ex = await created();
    await db.templates.put(templateWith(ex.id));
    expect(await deleteOrArchiveExercise(ex.id)).toBe('archived');
    expect((await getExercise(ex.id))?.archived).toBe(true);
  });

  it('archives a seeded exercise', async () => {
    await db.exercises.put(row('s1', 'Deadlift', { isCustom: false }));
    expect(await deleteOrArchiveExercise('s1')).toBe('archived');
    expect((await getExercise('s1'))?.archived).toBe(true);
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('does not write when an archived seeded row is archived again', async () => {
    await db.exercises.put(row('s1', 'Deadlift', { isCustom: false, archived: true }));
    expect(await deleteOrArchiveExercise('s1')).toBe('archived');
    expect(await db.syncQueue.count()).toBe(0);
  });
});

describe('restoreExercise', () => {
  it('is a no-op for a row that is not archived', async () => {
    await db.exercises.put(row('a1', 'Squat'));
    expect(await restoreExercise('a1')).toEqual({ ok: true });
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('is blocked by a name collision', async () => {
    await db.exercises.put(row('a1', 'Squat', { archived: true }));
    await db.exercises.put(row('a2', 'squat'));
    expect(await restoreExercise('a1')).toEqual({ ok: false, reason: 'name_taken' });
    expect((await getExercise('a1'))?.archived).toBe(true);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('unarchives and enqueues an upsert otherwise', async () => {
    await db.exercises.put(row('a1', 'Squat', { archived: true }));
    expect(await restoreExercise('a1')).toEqual({ ok: true });
    expect((await getExercise('a1'))?.archived).toBe(false);
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ op: 'upsert', recordId: 'a1' });
  });
});

describe('isNameTaken', () => {
  it('honors excludeId and ignores archived rows', async () => {
    await db.exercises.put(row('a1', 'Squat'));
    await db.exercises.put(row('a2', 'Row', { archived: true }));
    expect(await isNameTaken(' SQUAT ')).toBe(true);
    expect(await isNameTaken('squat', 'a1')).toBe(false);
    expect(await isNameTaken('Row')).toBe(false);
  });
});

describe('listExercises', () => {
  beforeEach(async () => {
    await db.exercises.bulkPut([
      row('1', 'Café Curl', { muscleGroup: 'biceps' }),
      row('2', 'Pull-Up', { muscleGroup: 'back' }),
      row('3', 'Archived Thing', { archived: true }),
      row('4', 'Exercise 10'),
      row('5', 'Exercise 2'),
      row('6', 'apple'),
      row('7', 'Banana'),
    ]);
  });

  it('excludes archived rows by default and includes them on request', async () => {
    const names = (await listExercises()).map((e) => e.name);
    expect(names).not.toContain('Archived Thing');
    expect((await listExercises({ includeArchived: true })).map((e) => e.name)).toContain(
      'Archived Thing',
    );
  });

  it('sorts with a case-insensitive numeric collator', async () => {
    expect((await listExercises()).map((e) => e.name)).toEqual([
      'apple',
      'Banana',
      'Café Curl',
      'Exercise 2',
      'Exercise 10',
      'Pull-Up',
    ]);
  });

  it('breaks name ties by id', async () => {
    await db.exercises.bulkPut([row('b', 'Same'), row('a', 'same')]);
    const ids = (await listExercises({ query: 'same' })).map((e) => e.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('folds diacritics and hyphens when searching', async () => {
    expect((await listExercises({ query: 'cafe' })).map((e) => e.id)).toEqual(['1']);
    expect((await listExercises({ query: ' pull up ' })).map((e) => e.id)).toEqual(['2']);
    expect(await listExercises({ query: 'zzz' })).toEqual([]);
  });

  it('filters by muscle group exactly', async () => {
    expect((await listExercises({ muscleGroup: 'back' })).map((e) => e.id)).toEqual(['2']);
    expect(await listExercises({ muscleGroup: 'back', query: 'cafe' })).toEqual([]);
  });

  it('returns an empty list when there are no exercises', async () => {
    await db.exercises.clear();
    expect(await listExercises()).toEqual([]);
  });
});

describe('seed version meta', () => {
  it('defaults to 0 and round-trips', async () => {
    expect(await getSeedVersion()).toBe(0);
    await setSeedVersion(3);
    expect(await getSeedVersion()).toBe(3);
  });
});

describe('without an owner', () => {
  it('every write throws', async () => {
    await db.exercises.put(row('a1', 'Squat', { archived: true }));
    await db.meta.clear();
    await expect(createExercise(BENCH)).rejects.toThrow('No local owner');
    await expect(updateExercise('a1', { notes: 'x' })).rejects.toThrow('No local owner');
    await expect(deleteOrArchiveExercise('a1')).rejects.toThrow('No local owner');
    await expect(restoreExercise('a1')).rejects.toThrow('No local owner');
    expect(await db.syncQueue.count()).toBe(0);
  });
});
