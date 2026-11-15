import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../schema';
import { setOwner } from '../repos/meta';
import { DEFAULT_SETTINGS } from '../repos/settings';
import {
  DataOpBlockedError,
  assertNoActiveWorkout,
  clearUserDataLocal,
  readSnapshot,
  replaceAllLocal,
} from '../repos/dataOps';
import { enqueue } from '../repos/outbox';
import type { LiftBackup } from '../../lib/backup';
import type { BodyweightEntry, Exercise, Template, Workout } from '../../types/domain';

const NOW = 5_000;
const U = 'u1';

const ex = (id: string, name: string, isCustom = false): Exercise => ({
  id,
  userId: U,
  updatedAt: 1,
  name,
  muscleGroup: 'chest',
  equipment: 'barbell',
  type: 'weight_reps',
  isCustom,
  archived: false,
  createdAt: 1,
});

const wk = (id: string, status: Workout['status'] = 'completed'): Workout => ({
  id,
  userId: U,
  updatedAt: 1,
  name: `W ${id}`,
  startedAt: 10,
  endedAt: status === 'completed' ? 20 : undefined,
  status,
  exercises: [],
  createdAt: 10,
});

const tpl = (id: string): Template => ({
  id,
  userId: U,
  updatedAt: 1,
  name: `T ${id}`,
  exercises: [],
  createdAt: 1,
});

const bw = (id: string, date: string): BodyweightEntry => ({
  id,
  userId: U,
  updatedAt: 1,
  date,
  weightKg: 80,
  createdAt: 1,
});

function backup(over: Partial<LiftBackup> = {}): LiftBackup {
  return {
    format: 'lift-backup',
    schemaVersion: 1,
    exportedAt: '2026-11-15T00:00:00.000Z',
    appVersion: 'test',
    userId: U,
    exercises: [],
    workouts: [],
    templates: [],
    bodyweight: [],
    settings: { ...DEFAULT_SETTINGS },
    ...over,
  };
}

async function snapshotState(): Promise<unknown> {
  return {
    exercises: await db.exercises.toArray(),
    workouts: await db.workouts.toArray(),
    templates: await db.templates.toArray(),
    bodyweight: await db.bodyweight.toArray(),
    settings: await db.settings.toArray(),
    queue: await db.syncQueue.toArray(),
    meta: await db.meta.toArray(),
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner(U, 'a@b.c');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readSnapshot', () => {
  it('returns completed workouts only plus all other data and the owner', async () => {
    await db.exercises.put(ex('e1', 'Bench', true));
    await db.workouts.bulkPut([wk('w1'), wk('w2', 'in_progress')]);
    await db.templates.put(tpl('t1'));
    await db.bodyweight.put(bw('b1', '2026-01-01'));
    const snap = await readSnapshot();
    expect(snap.userId).toBe(U);
    expect(snap.workouts.map((w) => w.id)).toEqual(['w1']);
    expect(snap.exercises).toHaveLength(1);
    expect(snap.templates).toHaveLength(1);
    expect(snap.bodyweight).toHaveLength(1);
    expect(snap.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('handles an empty database', async () => {
    const snap = await readSnapshot();
    expect(snap).toMatchObject({ exercises: [], workouts: [], templates: [], bodyweight: [] });
  });

  it('throws without an owner', async () => {
    await db.meta.clear();
    await expect(readSnapshot()).rejects.toThrow(/owner/);
  });
});

describe('assertNoActiveWorkout', () => {
  it('passes with no active workout and throws with one', async () => {
    await expect(assertNoActiveWorkout()).resolves.toBeUndefined();
    await db.meta.put({ key: 'activeWorkoutId', value: 'w9' });
    await expect(assertNoActiveWorkout()).rejects.toMatchObject({ reason: 'active_workout' });
  });
});

describe('replaceAllLocal', () => {
  it('makes local equal the backup with updatedAt = now', async () => {
    await db.exercises.put(ex('old', 'Old'));
    await db.workouts.put(wk('oldw'));
    const b = backup({
      exercises: [ex('e1', 'Bench', true), ex('e2', 'Squat')],
      workouts: [wk('w1')],
      templates: [tpl('t1')],
      bodyweight: [bw('b1', '2026-01-01')],
      settings: { ...DEFAULT_SETTINGS, unit: 'kg', theme: 'light' },
    });
    const res = await replaceAllLocal(b, U, NOW);
    expect(res).toEqual({
      exercises: 2,
      customExercises: 1,
      workouts: 1,
      templates: 1,
      bodyweight: 1,
      deleted: 2,
    });
    const stamp = <T extends { updatedAt: number }>(rows: T[]): T[] =>
      rows.map((r) => ({ ...r, updatedAt: NOW }));
    expect((await db.exercises.toArray()).sort((a, c) => a.id.localeCompare(c.id))).toEqual(
      stamp(b.exercises),
    );
    expect(await db.workouts.toArray()).toEqual(stamp(b.workouts));
    expect(await db.templates.toArray()).toEqual(stamp(b.templates));
    expect(await db.bodyweight.toArray()).toEqual(stamp(b.bodyweight));
    expect(await db.settings.get('singleton')).toEqual({
      ...b.settings,
      id: 'singleton',
      userId: U,
      updatedAt: NOW,
    });
  });

  it('enqueues deletes (workouts, templates, bodyweight, exercises) before all upserts', async () => {
    await db.workouts.put(wk('ow'));
    await db.templates.put(tpl('ot'));
    await db.bodyweight.put(bw('ob', '2025-01-01'));
    await db.exercises.put(ex('oe', 'Old'));
    const b = backup({
      exercises: [ex('e1', 'A')],
      workouts: [wk('w1')],
      templates: [tpl('t1')],
      bodyweight: [bw('b1', '2026-01-01')],
    });
    await replaceAllLocal(b, U, NOW);
    const q = (await db.syncQueue.orderBy('id').toArray()).map((e) => [e.op, e.table, e.recordId]);
    expect(q).toEqual([
      ['delete', 'workouts', 'ow'],
      ['delete', 'templates', 'ot'],
      ['delete', 'bodyweight_entries', 'ob'],
      ['delete', 'exercises', 'oe'],
      ['upsert', 'exercises', 'e1'],
      ['upsert', 'templates', 't1'],
      ['upsert', 'workouts', 'w1'],
      ['upsert', 'bodyweight_entries', 'b1'],
      ['upsert', 'user_settings', 'singleton'],
    ]);
  });

  it('enqueues one upsert per row and keeps ids present in both without a delete', async () => {
    await db.exercises.put(ex('e1', 'Keep'));
    const b = backup({ exercises: [ex('e1', 'Keep'), ex('e2', 'New')] });
    const res = await replaceAllLocal(b, U, NOW);
    expect(res.deleted).toBe(0);
    const q = await db.syncQueue.toArray();
    expect(q.filter((e) => e.op === 'delete')).toHaveLength(0);
    expect(q.filter((e) => e.table === 'exercises')).toHaveLength(2);
    expect(q.filter((e) => e.table === 'user_settings')).toHaveLength(1);
    expect(q.find((e) => e.recordId === 'e1')?.payload).toMatchObject({ updatedAt: NOW });
  });

  it('removes in-progress workouts from other devices that are absent from the backup', async () => {
    await db.workouts.put(wk('remote', 'in_progress'));
    const res = await replaceAllLocal(backup(), U, NOW);
    expect(res.deleted).toBe(1);
    expect(await db.workouts.count()).toBe(0);
  });

  it('merges partial settings over defaults and enqueues them', async () => {
    const partial = { unit: 'kg' } as unknown as LiftBackup['settings'];
    await replaceAllLocal(backup({ settings: partial }), U, NOW);
    const row = await db.settings.get('singleton');
    expect(row).toMatchObject({ ...DEFAULT_SETTINGS, unit: 'kg' });
  });

  it('handles bodyweight rows swapping dates', async () => {
    await db.bodyweight.bulkPut([bw('a', '2026-01-01'), bw('b', '2026-01-02')]);
    const b = backup({ bodyweight: [bw('a', '2026-01-02'), bw('b', '2026-01-01')] });
    await replaceAllLocal(b, U, NOW);
    expect((await db.bodyweight.get('a'))?.date).toBe('2026-01-02');
    expect((await db.bodyweight.get('b'))?.date).toBe('2026-01-01');
  });

  it('works for an empty backup on an empty database', async () => {
    const res = await replaceAllLocal(backup(), U, NOW);
    expect(res).toEqual({
      exercises: 0,
      customExercises: 0,
      workouts: 0,
      templates: 0,
      bodyweight: 0,
      deleted: 0,
    });
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('throws DataOpBlockedError for an active workout and changes nothing', async () => {
    await db.meta.put({ key: 'activeWorkoutId', value: 'w9' });
    await db.exercises.put(ex('x', 'X'));
    const before = await snapshotState();
    const err = await replaceAllLocal(backup({ exercises: [ex('e1', 'A')] }), U, NOW).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DataOpBlockedError);
    expect(err).toMatchObject({ reason: 'active_workout' });
    expect(await snapshotState()).toEqual(before);
  });

  it('throws DataOpBlockedError for a non-empty outbox and changes nothing', async () => {
    await db.transaction('rw', db.bodyweight, db.syncQueue, async () => {
      const r = bw('b1', '2026-01-01');
      await db.bodyweight.put(r);
      await enqueue('bodyweight_entries', r.id, 'upsert', r);
    });
    const before = await snapshotState();
    const err = await replaceAllLocal(backup(), U, NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataOpBlockedError);
    expect(err).toMatchObject({ reason: 'unsynced_changes' });
    expect(await snapshotState()).toEqual(before);
  });

  it('rejects when the owner differs', async () => {
    await expect(replaceAllLocal(backup(), 'other', NOW)).rejects.toThrow(/owner/i);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('rolls back Dexie and the outbox when a quota error hits mid-transaction', async () => {
    await db.exercises.put(ex('old', 'Old'));
    await db.workouts.put(wk('oldw'));
    const before = await snapshotState();
    const quota = new DOMException('full', 'QuotaExceededError');
    vi.spyOn(db.workouts, 'put').mockImplementation(() => {
      throw quota;
    });
    const b = backup({
      exercises: [ex('e1', 'A')],
      workouts: [wk('w1')],
      templates: [tpl('t1')],
      bodyweight: [bw('b1', '2026-01-01')],
    });
    await expect(replaceAllLocal(b, U, NOW)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
    vi.restoreAllMocks();
    expect(await snapshotState()).toEqual(before);
  });
});

describe('clearUserDataLocal', () => {
  it('clears data, outbox and sync state, drops transient meta, keeps owner and initialPullDone', async () => {
    await db.exercises.put(ex('e1', 'A'));
    await db.workouts.put(wk('w1'));
    await db.templates.put(tpl('t1'));
    await db.bodyweight.put(bw('b1', '2026-01-01'));
    await db.settings.put({ ...DEFAULT_SETTINGS, id: 'singleton', userId: U, updatedAt: 1 });
    await db.transaction('rw', db.syncQueue, db.exercises, async () => {
      await enqueue('exercises', 'e1', 'delete');
    });
    await db.syncState.put({ table: 'workouts', lastPulledAt: 'x', lastPulledKey: null });
    await db.meta.bulkPut([
      { key: 'seedVersion', value: 2 },
      { key: 'activeWorkoutId', value: 'w1' },
      { key: 'restTimer', value: { workoutId: 'w1', endsAt: 1, durationSec: 60 } },
      { key: 'initialPullDone', value: true },
    ]);
    await clearUserDataLocal(U);
    for (const t of [
      db.exercises,
      db.workouts,
      db.templates,
      db.bodyweight,
      db.settings,
      db.syncQueue,
      db.syncState,
    ]) {
      expect(await t.count()).toBe(0);
    }
    const keys = (await db.meta.toArray()).map((m) => m.key).sort();
    expect(keys).toEqual(['initialPullDone', 'ownerEmail', 'ownerUserId']);
  });

  it('is a no-op error for the wrong owner', async () => {
    await db.exercises.put(ex('e1', 'A'));
    await expect(clearUserDataLocal('other')).rejects.toThrow(/owner/i);
    expect(await db.exercises.count()).toBe(1);
  });

  it('works on an empty database', async () => {
    await expect(clearUserDataLocal(U)).resolves.toBeUndefined();
  });
});
