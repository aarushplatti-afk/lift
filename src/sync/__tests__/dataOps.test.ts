import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { setOwner, wipeLocalData } from '../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../db/repos/settings';
import { enqueue, runWrite } from '../../db/repos/outbox';
import type { LiftBackup } from '../../lib/backup';
import type { Exercise, Workout } from '../../types/domain';
import { createDataOps, type DataOps } from '../dataOps';
import { createSyncEngine } from '../engine';
import { createFakeClient, exerciseRecord, exerciseRow, FakeServer } from './fakeClient';

const U = 'u1';
const NOW = 1_800_000_000_000;

let server: FakeServer;
let online = true;
let ops: DataOps;

const workout = (id: string, status: Workout['status'] = 'completed'): Workout => ({
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

function backupOf(over: Partial<LiftBackup> = {}): LiftBackup {
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

function build(): DataOps {
  const client = createFakeClient(server);
  const engine = createSyncEngine({
    client,
    now: () => NOW,
    isOnline: () => online,
    seed: async () => 0,
  });
  return createDataOps({ client, engine, isOnline: () => online, now: () => NOW });
}

async function saveLocalExercise(id: string, over: Partial<Exercise> = {}): Promise<void> {
  const rec = exerciseRecord(id, over);
  await runWrite(['exercises'], async () => {
    await db.exercises.put(rec);
    await enqueue('exercises', id, 'upsert', rec);
  });
}

async function localState(): Promise<unknown> {
  return {
    exercises: await db.exercises.toArray(),
    workouts: await db.workouts.toArray(),
    queue: await db.syncQueue.toArray(),
    meta: await db.meta.toArray(),
  };
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner(U, 'a@example.com');
  server = new FakeServer();
  online = true;
  ops = build();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportBackup', () => {
  it('syncs first, then exports completed workouts with the owner id', async () => {
    await saveLocalExercise('e1');
    await db.workouts.bulkPut([workout('w1'), workout('w2', 'in_progress')]);
    const { backup, synced } = await ops.exportBackup();
    expect(synced).toBe(true);
    expect(server.tables.exercises.map((r) => r.id)).toEqual(['e1']);
    expect(backup.userId).toBe(U);
    expect(backup.exportedAt).toBe(new Date(NOW).toISOString());
    expect(backup.workouts.map((w) => w.id)).toEqual(['w1']);
    expect(backup.exercises.map((e) => e.id)).toEqual(['e1']);
  });

  it('exports from the cache without syncing when offline', async () => {
    await saveLocalExercise('e1');
    online = false;
    const { backup, synced } = await ops.exportBackup();
    expect(synced).toBe(false);
    expect(server.upsertCalls).toHaveLength(0);
    expect(backup.exercises).toHaveLength(1);
  });

  it('still exports when the sync leaves entries unsent', async () => {
    await saveLocalExercise('e1');
    server.networkDown = true;
    const { backup, synced } = await ops.exportBackup();
    expect(synced).toBe(false);
    expect(backup.exercises).toHaveLength(1);
  });
});

describe('exportCsv', () => {
  it('uses the settings unit and returns CSV with a header', async () => {
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      id: 'singleton',
      userId: U,
      updatedAt: 1,
      unit: 'kg',
    });
    const csv = await ops.exportCsv();
    expect(csv).toContain(
      'date,workout,exercise,set_order,set_type,weight,reps,notes,unit,duration_sec',
    );
  });
});

describe('importReplace', () => {
  it('returns offline without writing', async () => {
    online = false;
    const before = await localState();
    const result = await ops.importReplace(backupOf({ exercises: [exerciseRecord('x')] }));
    expect(result).toMatchObject({ ok: false, error: 'offline' });
    expect(await localState()).toEqual(before);
  });

  it('returns active_workout without writing', async () => {
    await db.meta.put({ key: 'activeWorkoutId', value: 'w9' });
    const before = await localState();
    const result = await ops.importReplace(backupOf({ exercises: [exerciseRecord('x')] }));
    expect(result).toMatchObject({ ok: false, error: 'active_workout' });
    expect(await localState()).toEqual(before);
    expect(server.upsertCalls).toHaveLength(0);
  });

  it('returns unsynced_changes when entries remain after the pre-sync', async () => {
    await saveLocalExercise('e1');
    server.failWhen = () => ({ message: 'denied', code: '42501', status: 403 });
    const before = await localState();
    const result = await ops.importReplace(backupOf({ exercises: [exerciseRecord('x')] }));
    expect(result).toMatchObject({ ok: false, error: 'unsynced_changes' });
    expect(await db.exercises.get('x')).toBeUndefined();
    expect(((await localState()) as { exercises: unknown[] }).exercises).toEqual(
      (before as { exercises: unknown[] }).exercises,
    );
  });

  it('replaces local data, pushes it and reports zero failures', async () => {
    await saveLocalExercise('old');
    const result = await ops.importReplace(
      backupOf({
        exercises: [exerciseRecord('e1'), exerciseRecord('e2', { isCustom: false })],
        workouts: [workout('w1')],
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      counts: { exercises: 2, customExercises: 1, workouts: 1, templates: 0, bodyweight: 0 },
      failed: 0,
      pending: 0,
    });
    expect(await db.exercises.get('old')).toBeUndefined();
    expect(server.tables.workouts.map((r) => r.id)).toEqual(['w1']);
    const old = server.tables.exercises.find((r) => r.id === 'old');
    expect(old?.deleted_at).toBeTruthy();
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('succeeds with failed >= 1 when the server rejects a row', async () => {
    server.failWhen = (table) =>
      table === 'workouts' ? { message: 'check', code: '23514', status: 400 } : null;
    const result = await ops.importReplace(backupOf({ workouts: [workout('w1')] }));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(await db.workouts.get('w1')).toBeDefined();
  });

  it('maps a quota error to storage_full and leaves local data unchanged', async () => {
    await db.workouts.put(workout('keep'));
    await ops.exportBackup();
    const before = await localState();
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    vi.spyOn(db.exercises, 'put').mockRejectedValue(quota);
    const result = await ops.importReplace(backupOf({ exercises: [exerciseRecord('e1')] }));
    expect(result).toMatchObject({ ok: false, error: 'storage_full' });
    vi.restoreAllMocks();
    expect(await localState()).toEqual(before);
  });

  it('remaps ids and owner when the backup is from another account', async () => {
    const result = await ops.importReplace(
      backupOf({
        userId: 'someone-else',
        exercises: [exerciseRecord('e1', { userId: 'someone-else' })],
        workouts: [{ ...workout('w1'), userId: 'someone-else' }],
      }),
    );
    expect(result).toMatchObject({ ok: true, failed: 0 });
    const ids = (await db.workouts.toArray()).map((w) => w.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe('w1');
    expect((await db.workouts.toArray())[0]?.userId).toBe(U);
    expect(server.tables.workouts.every((r) => r.user_id === U)).toBe(true);
  });
});

describe('deleteAllData', () => {
  it('rejects anything but the exact text', async () => {
    const result = await ops.deleteAllData('delete');
    expect(result).toMatchObject({ ok: false, error: 'confirm_mismatch' });
    expect(server.bulkCalls).toHaveLength(0);
  });

  it('is blocked offline', async () => {
    online = false;
    expect(await ops.deleteAllData('DELETE')).toMatchObject({ ok: false, error: 'offline' });
    expect(server.bulkCalls).toHaveLength(0);
  });

  it('is blocked by an active workout', async () => {
    await db.meta.put({ key: 'activeWorkoutId', value: 'w9' });
    expect(await ops.deleteAllData('DELETE')).toMatchObject({
      ok: false,
      error: 'active_workout',
    });
    expect(server.bulkCalls).toHaveLength(0);
  });

  it('tombstones every server row, resets settings and clears local data', async () => {
    server.seed('exercises', [exerciseRow('s1', '2026-01-01T00:00:00.000001+00:00')]);
    server.seed('workouts', [
      {
        id: 'w1',
        user_id: U,
        name: 'x',
        updated_at: '2026-01-01T00:00:00.000001+00:00',
        deleted_at: null,
      },
      {
        id: 'w-other',
        user_id: 'u2',
        name: 'x',
        updated_at: '2026-01-01T00:00:00.000001+00:00',
        deleted_at: null,
      },
    ]);
    server.seed('user_settings', [
      { user_id: U, data: { unit: 'kg' }, updated_at: '2026-01-01T00:00:00.000001+00:00' },
    ]);
    await saveLocalExercise('local');
    const result = await ops.deleteAllData('DELETE');
    expect(result).toEqual({ ok: true, failed: 0 });
    expect(server.bulkCalls.map((c) => c.table)).toEqual([
      'workouts',
      'templates',
      'bodyweight_entries',
      'exercises',
    ]);
    expect(server.tables.exercises.every((r) => r.deleted_at)).toBe(true);
    expect(server.tables.workouts.find((r) => r.id === 'w1')?.deleted_at).toBeTruthy();
    expect(server.tables.workouts.find((r) => r.id === 'w-other')?.deleted_at).toBeNull();
    expect(server.tables.user_settings[0]?.data).toEqual(DEFAULT_SETTINGS);
    expect(await db.exercises.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('leaves local data and the outbox untouched when the third table fails', async () => {
    await saveLocalExercise('local');
    await db.workouts.put(workout('w1'));
    const before = await localState();
    server.failBulkWhen = (table) => table === 'bodyweight_entries';
    const result = await ops.deleteAllData('DELETE');
    expect(result).toMatchObject({ ok: false, error: 'server_error' });
    expect(server.bulkCalls.map((c) => c.table)).toEqual([
      'workouts',
      'templates',
      'bodyweight_entries',
    ]);
    expect(await localState()).toEqual(before);
  });

  it('refreshes an expired token once and completes', async () => {
    server.tokenValid = false;
    const result = await ops.deleteAllData('DELETE');
    expect(result).toEqual({ ok: true, failed: 0 });
    expect(server.refreshCalls).toBe(1);
  });
});
