import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { enqueue, runWrite } from '../repos/outbox';
import { OwnerChangedError, setOwner } from '../repos/meta';
import { applyServerRecords, getCursor, setCursor } from '../repos/syncApply';
import type { BodyweightEntry, Exercise, Settings, Workout } from '../../types/domain';

const wk = (id: string, name = 'W'): Workout => ({
  userId: 'u1',
  updatedAt: 1,
  id,
  name,
  startedAt: 1,
  status: 'in_progress',
  exercises: [],
  createdAt: 1,
});

const ex = (id: string, name = 'Squat', updatedAt = 1): Exercise => ({
  userId: 'u1',
  updatedAt,
  id,
  name,
  muscleGroup: 'quads',
  equipment: 'barbell',
  type: 'weight_reps',
  isCustom: false,
  archived: false,
  createdAt: 1,
});
const bw = (id: string, date: string, weightKg = 80): BodyweightEntry => ({
  userId: 'u1',
  updatedAt: 1,
  id,
  date,
  weightKg,
  createdAt: 1,
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
});

describe('applyServerRecords', () => {
  it('handles empty input', async () => {
    expect(await applyServerRecords('exercises', [], 'u1')).toEqual({ applied: 0, skipped: 0 });
  });

  it('puts new and updated records', async () => {
    await db.exercises.put(ex('a', 'Old'));
    const r = await applyServerRecords(
      'exercises',
      [
        { record: ex('a', 'New', 2), deleted: false },
        { record: ex('b'), deleted: false },
      ],
      'u1',
    );
    expect(r).toEqual({ applied: 2, skipped: 0 });
    expect((await db.exercises.get('a'))?.name).toBe('New');
    expect(await db.exercises.count()).toBe(2);
  });

  it('pending-wins: skips records with a pending outbox entry', async () => {
    await runWrite(['exercises'], async () => {
      await db.exercises.put(ex('a', 'Local'));
      await enqueue('exercises', 'a', 'upsert', ex('a', 'Local'));
    });
    const r = await applyServerRecords(
      'exercises',
      [
        { record: ex('a', 'Server', 9), deleted: false },
        { record: ex('b', 'Other', 9), deleted: false },
      ],
      'u1',
    );
    expect(r).toEqual({ applied: 1, skipped: 1 });
    expect((await db.exercises.get('a'))?.name).toBe('Local');
  });

  it('pending-wins also protects against server deletes', async () => {
    await runWrite(['exercises'], async () => {
      await db.exercises.put(ex('a'));
      await enqueue('exercises', 'a', 'upsert', ex('a'));
    });
    const r = await applyServerRecords('exercises', [{ record: ex('a'), deleted: true }], 'u1');
    expect(r.skipped).toBe(1);
    expect(await db.exercises.get('a')).toBeDefined();
  });

  it('deletes tombstoned rows and tolerates missing ones', async () => {
    await db.exercises.put(ex('a'));
    const r = await applyServerRecords(
      'exercises',
      [
        { record: ex('a'), deleted: true },
        { record: ex('ghost'), deleted: true },
      ],
      'u1',
    );
    expect(r.applied).toBe(2);
    expect(await db.exercises.count()).toBe(0);
  });

  it('bodyweight same-date different id replaces the local row', async () => {
    await db.bodyweight.put(bw('local', '2026-01-01', 80));
    const r = await applyServerRecords(
      'bodyweight_entries',
      [{ record: bw('server', '2026-01-01', 81), deleted: false }],
      'u1',
    );
    expect(r.applied).toBe(1);
    const rows = await db.bodyweight.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'server', weightKg: 81 });
  });

  it('bodyweight same id and date updates in place', async () => {
    await db.bodyweight.put(bw('a', '2026-01-01', 80));
    await applyServerRecords(
      'bodyweight_entries',
      [{ record: bw('a', '2026-01-01', 79), deleted: false }],
      'u1',
    );
    expect(await db.bodyweight.toArray()).toHaveLength(1);
    expect((await db.bodyweight.get('a'))?.weightKg).toBe(79);
  });

  it('skips the active workout for upserts and tombstones but applies others', async () => {
    await db.workouts.put(wk('act', 'Local'));
    await db.meta.put({ key: 'activeWorkoutId', value: 'act' });
    const up = await applyServerRecords(
      'workouts',
      [
        { record: wk('act', 'Server'), deleted: false },
        { record: wk('other', 'Server'), deleted: false },
      ],
      'u1',
    );
    expect(up).toEqual({ applied: 1, skipped: 1 });
    expect((await db.workouts.get('act'))?.name).toBe('Local');
    expect(await db.workouts.get('other')).toBeDefined();
    const del = await applyServerRecords(
      'workouts',
      [
        { record: wk('act'), deleted: true },
        { record: wk('other'), deleted: true },
      ],
      'u1',
    );
    expect(del).toEqual({ applied: 1, skipped: 1 });
    expect(await db.workouts.get('act')).toBeDefined();
    expect(await db.workouts.get('other')).toBeUndefined();
  });

  it('applies settings via the settings table', async () => {
    const settings: Settings = {
      userId: 'u1',
      updatedAt: 1,
      id: 'singleton',
      unit: 'kg',
      theme: 'dark',
      defaultRestSeconds: 90,
      restTimerAutoStart: true,
      keepScreenAwakeDuringWorkout: true,
      hapticsEnabled: true,
      soundEnabled: false,
      weightIncrementLb: 5,
      weightIncrementKg: 2.5,
      schemaVersion: 1,
    };
    await applyServerRecords('user_settings', [{ record: settings, deleted: false }], 'u1');
    expect(await db.settings.get('singleton')).toEqual(settings);
  });
});

describe('cursor', () => {
  it('defaults to nulls and round-trips the exact string', async () => {
    expect(await getCursor('workouts')).toEqual({ at: null, key: null });
    await setCursor('workouts', '2026-01-01T00:00:00.123456+00:00', 'id-1', 'u1');
    expect(await getCursor('workouts')).toEqual({
      at: '2026-01-01T00:00:00.123456+00:00',
      key: 'id-1',
    });
    expect(await getCursor('exercises')).toEqual({ at: null, key: null });
  });
});

describe('owner guard', () => {
  it('rejects apply after the owner changed and writes nothing', async () => {
    await setOwner('u2', 'b@b.c');
    await expect(
      applyServerRecords('exercises', [{ record: ex('a'), deleted: false }], 'u1'),
    ).rejects.toBeInstanceOf(OwnerChangedError);
    expect(await db.exercises.count()).toBe(0);
  });

  it('rejects setCursor after the owner changed', async () => {
    await db.meta.clear();
    await expect(
      setCursor('exercises', '2026-01-01T00:00:00+00:00', 'x', 'u1'),
    ).rejects.toBeInstanceOf(OwnerChangedError);
    expect(await db.syncState.count()).toBe(0);
  });
});
