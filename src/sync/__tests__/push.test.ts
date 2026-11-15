import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { enqueue, runWrite } from '../../db/repos/outbox';
import { deleteWorkout, updateCompletedWorkout } from '../../db/repos/workouts';
import { wipeLocalData } from '../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../db/repos/settings';
import type { Exercise, Workout } from '../../types/domain';
import { createAuthRetry } from '../authRetry';
import { pushOutbox } from '../push';
import type { LiftClient } from '../../lib/supabase';
import { createFakeClient, exerciseRecord, FakeServer } from './fakeClient';

let server: FakeServer;

const passThrough = <T>(fn: () => Promise<T>): Promise<T> => fn();

function push(client: LiftClient, opts: { now: number; force: boolean }) {
  return pushOutbox(client, { ...opts, authRetry: passThrough });
}

async function saveExercise(rec: Exercise): Promise<void> {
  await runWrite(['exercises'], async () => {
    await db.exercises.put(rec);
    await enqueue('exercises', rec.id, 'upsert', rec);
  });
}

async function removeExercise(id: string): Promise<void> {
  await runWrite(['exercises'], async () => {
    await db.exercises.delete(id);
    await enqueue('exercises', id, 'delete');
  });
}

beforeEach(async () => {
  await wipeLocalData();
  server = new FakeServer();
});

describe('pushOutbox', () => {
  it('pushes in FIFO order across tables and clears the outbox', async () => {
    await saveExercise(exerciseRecord('a'));
    await runWrite(['templates'], async () => {
      const rec = { id: 't1', userId: 'u1', name: 'T', exercises: [], createdAt: 1, updatedAt: 1 };
      await db.templates.put(rec);
      await enqueue('templates', 't1', 'upsert', rec);
    });
    await saveExercise(exerciseRecord('b'));
    const res = await push(createFakeClient(server), { now: Date.now(), force: false });
    expect(res).toEqual({ pushed: 3, failed: 0, offline: false, authExpired: false });
    expect(server.upsertCalls.map((c) => `${c.table}:${c.rows.length}`)).toEqual([
      'exercises:1',
      'templates:1',
      'exercises:1',
    ]);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('coalesces repeated edits into one upsert carrying the latest payload', async () => {
    await saveExercise(exerciseRecord('a', { name: 'one' }));
    await saveExercise(exerciseRecord('a', { name: 'two' }));
    await push(createFakeClient(server), { now: Date.now(), force: false });
    expect(server.upsertCalls).toHaveLength(1);
    expect(server.upsertCalls[0]?.rows[0]?.name).toBe('two');
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('keeps an entry added while a push is in flight', async () => {
    await saveExercise(exerciseRecord('a', { name: 'one' }));
    server.onUpsert = async () => {
      server.onUpsert = undefined;
      await saveExercise(exerciseRecord('a', { name: 'edited-mid-push' }));
    };
    await push(createFakeClient(server), { now: Date.now(), force: false });
    const left = await db.syncQueue.toArray();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ op: 'upsert', payload: { name: 'edited-mid-push' } });

    await push(createFakeClient(server), { now: Date.now(), force: false });
    expect(server.tables.exercises[0]?.name).toBe('edited-mid-push');
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('sends deletes as a deleted_at tombstone update', async () => {
    await removeExercise('a');
    const now = Date.parse('2026-03-01T00:00:00.000Z');
    await push(createFakeClient(server), { now, force: true });
    expect(server.updateCalls).toEqual([
      {
        table: 'exercises',
        values: { deleted_at: '2026-03-01T00:00:00.000Z' },
        ids: ['a'],
      },
    ]);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('upserts user_settings on user_id', async () => {
    const rec = { ...DEFAULT_SETTINGS, id: 'singleton' as const, userId: 'u1', updatedAt: 1 };
    await runWrite(['user_settings'], async () => {
      await db.settings.put(rec);
      await enqueue('user_settings', 'singleton', 'upsert', rec);
    });
    await push(createFakeClient(server), { now: Date.now(), force: false });
    expect(server.upsertCalls[0]?.onConflict).toBe('user_id');
    expect(server.tables.user_settings[0]?.user_id).toBe('u1');
  });

  it('replaying the same write is duplicate-safe', async () => {
    const client = createFakeClient(server);
    await saveExercise(exerciseRecord('a'));
    await push(client, { now: Date.now(), force: false });
    await saveExercise(exerciseRecord('a'));
    await push(client, { now: Date.now(), force: false });
    expect(server.tables.exercises).toHaveLength(1);
  });

  it('isolates a permanently bad op, pushes the rest, and marks it failed', async () => {
    await saveExercise(exerciseRecord('good'));
    await saveExercise(exerciseRecord('bad'));
    server.failWhen = (_t, rows) =>
      rows.some((r) => r.id === 'bad') ? { message: 'check violation', code: '23514' } : null;
    const now = Date.now() + 1_000_000;
    const res = await push(createFakeClient(server), { now, force: true });
    expect(res).toEqual({ pushed: 1, failed: 1, offline: false, authExpired: false });
    expect(server.tables.exercises.map((r) => r.id)).toEqual(['good']);
    const left = await db.syncQueue.toArray();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({
      recordId: 'bad',
      attempts: 1,
      state: 'failed',
      lastError: 'Value out of range',
      lastErrorCode: '23514',
    });
  });

  it('splits a batch of 3 with one permanent op: 2 land, 1 failed', async () => {
    await saveExercise(exerciseRecord('a'));
    await saveExercise(exerciseRecord('bad'));
    await saveExercise(exerciseRecord('c'));
    server.failWhen = (_t, rows) =>
      rows.length > 1 || rows.some((r) => r.id === 'bad')
        ? { message: 'bad input', code: '22P02', status: 400 }
        : null;
    const res = await push(createFakeClient(server), { now: Date.now(), force: false });
    expect(res.pushed).toBe(2);
    expect(res.failed).toBe(1);
    const left = await db.syncQueue.toArray();
    expect(left.map((e) => [e.recordId, e.state])).toEqual([['bad', 'failed']]);
  });

  it('does not split a batch hitting a 5xx: all entries back off', async () => {
    await saveExercise(exerciseRecord('a'));
    await saveExercise(exerciseRecord('b'));
    await saveExercise(exerciseRecord('c'));
    server.failWhen = () => ({ message: 'upstream', status: 503 });
    const now = Date.now();
    const res = await push(createFakeClient(server), { now, force: false });
    expect(res.failed).toBe(3);
    expect(server.upsertCalls).toHaveLength(1);
    const left = await db.syncQueue.toArray();
    expect(left).toHaveLength(3);
    for (const e of left) {
      expect(e).toMatchObject({ state: 'pending', attempts: 1, nextAttemptAt: now + 2000 });
    }
    server.upsertCalls.length = 0;
    await push(createFakeClient(server), { now: now + 1000, force: false });
    expect(server.upsertCalls).toHaveLength(0);
  });

  it('never retries a failed entry, forced or not', async () => {
    await saveExercise(exerciseRecord('bad'));
    server.failWhen = () => ({ message: 'rls', code: '42501', status: 403 });
    const client = createFakeClient(server);
    const now = Date.now();
    await push(client, { now, force: false });
    server.failWhen = undefined;
    server.upsertCalls.length = 0;
    await push(client, { now: now + 10_000_000, force: false });
    await push(client, { now: now + 10_000_000, force: true });
    expect(server.upsertCalls).toHaveLength(0);
    expect(await db.syncQueue.where('state').equals('failed').count()).toBe(1);
  });

  it('a failed entry plus a newer pending edit clears both after a successful push', async () => {
    await saveExercise(exerciseRecord('a', { name: 'old' }));
    server.failWhen = () => ({ message: 'rls', code: '42501', status: 403 });
    const client = createFakeClient(server);
    const now = Date.now();
    await push(client, { now, force: false });
    server.failWhen = undefined;
    await saveExercise(exerciseRecord('a', { name: 'new' }));
    const res = await push(client, { now: now + 1000, force: false });
    expect(res.pushed).toBe(1);
    expect(server.tables.exercises[0]?.name).toBe('new');
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('retries a first-attempt 23505 once, then fails it permanently', async () => {
    await saveExercise(exerciseRecord('a'));
    server.failWhen = () => ({ message: 'dup', code: '23505', status: 409 });
    const client = createFakeClient(server);
    const now = Date.now();
    await push(client, { now, force: false });
    expect((await db.syncQueue.toArray())[0]).toMatchObject({ state: 'pending', attempts: 1 });
    await push(client, { now: now + 10_000, force: false });
    expect((await db.syncQueue.toArray())[0]).toMatchObject({
      state: 'failed',
      attempts: 2,
      lastError: 'Duplicate name',
    });
  });

  describe('auth', () => {
    it('refreshes once on a 401, retries, and adds no attempts', async () => {
      await saveExercise(exerciseRecord('a'));
      await saveExercise(exerciseRecord('b'));
      server.tokenValid = false;
      const client = createFakeClient(server);
      const res = await pushOutbox(client, {
        now: Date.now(),
        force: false,
        authRetry: createAuthRetry(client),
      });
      expect(res).toEqual({ pushed: 2, failed: 0, offline: false, authExpired: false });
      expect(server.refreshCalls).toBe(1);
      expect(server.tables.exercises).toHaveLength(2);
      expect(await db.syncQueue.count()).toBe(0);
    });

    it('stops with authExpired when the refresh is rejected, entries untouched', async () => {
      await saveExercise(exerciseRecord('a'));
      server.tokenValid = false;
      server.refreshMode = 'rejected';
      const client = createFakeClient(server);
      const res = await pushOutbox(client, {
        now: Date.now(),
        force: false,
        authRetry: createAuthRetry(client),
      });
      expect(res).toEqual({ pushed: 0, failed: 0, offline: false, authExpired: true });
      const left = await db.syncQueue.toArray();
      expect(left).toHaveLength(1);
      expect(left[0]).toMatchObject({ state: 'pending', attempts: 0 });
      expect(left[0]?.lastError).toBeUndefined();
    });

    it('reports offline when the refresh hits the network', async () => {
      await saveExercise(exerciseRecord('a'));
      server.tokenValid = false;
      server.refreshMode = 'network';
      const client = createFakeClient(server);
      const res = await pushOutbox(client, {
        now: Date.now(),
        force: false,
        authRetry: createAuthRetry(client),
      });
      expect(res.offline).toBe(true);
      expect((await db.syncQueue.toArray())[0]?.attempts).toBe(0);
    });

    it('refreshes only once per instance', async () => {
      await saveExercise(exerciseRecord('a'));
      server.tokenValid = false;
      server.refreshMode = 'rejected';
      const client = createFakeClient(server);
      const authRetry = createAuthRetry(client);
      await pushOutbox(client, { now: Date.now(), force: false, authRetry });
      await pushOutbox(client, { now: Date.now(), force: false, authRetry });
      expect(server.refreshCalls).toBe(1);
    });
  });

  it('skips entries in backoff unless forced', async () => {
    await saveExercise(exerciseRecord('bad'));
    server.failWhen = () => 'boom';
    const client = createFakeClient(server);
    const now = Date.now() + 1_000_000;
    await push(client, { now, force: false });
    server.upsertCalls.length = 0;

    const skipped = await push(client, { now: now + 1000, force: false });
    expect(skipped).toEqual({ pushed: 0, failed: 0, offline: false, authExpired: false });
    expect(server.upsertCalls).toHaveLength(0);

    const forced = await push(client, { now: now + 1000, force: true });
    expect(forced.failed).toBe(1);
    expect((await db.syncQueue.toArray())[0]?.attempts).toBe(2);

    server.failWhen = undefined;
    const due = await push(client, { now: now + 1_000_000, force: false });
    expect(due.pushed).toBe(1);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('reports offline on a fetch failure and leaves the outbox untouched', async () => {
    await saveExercise(exerciseRecord('a'));
    await saveExercise(exerciseRecord('b'));
    server.networkDown = true;
    const res = await push(createFakeClient(server), { now: Date.now(), force: false });
    expect(res.offline).toBe(true);
    const left = await db.syncQueue.toArray();
    expect(left).toHaveLength(2);
    expect(left.every((e) => e.attempts === 0)).toBe(true);
    expect(server.upsertCalls).toHaveLength(1);
  });

  it('delivers queued offline writes once the network returns', async () => {
    await saveExercise(exerciseRecord('a'));
    const client = createFakeClient(server);
    server.networkDown = true;
    await push(client, { now: Date.now(), force: false });
    server.networkDown = false;
    const res = await push(client, { now: Date.now(), force: false });
    expect(res.pushed).toBe(1);
    expect(server.tables.exercises).toHaveLength(1);
  });

  it('failed old entry + new due entry sends the latest payload, clears both, no replay', async () => {
    await saveExercise(exerciseRecord('a', { name: 'old' }));
    server.failWhen = () => 'boom';
    const client = createFakeClient(server);
    const now = Date.now();
    await push(client, { now, force: false });
    server.failWhen = undefined;
    server.upsertCalls.length = 0;
    await saveExercise(exerciseRecord('a', { name: 'new' }));
    const res = await push(client, { now: now + 1000, force: false });
    expect(res.pushed).toBe(1);
    expect(server.upsertCalls).toHaveLength(1);
    expect(server.upsertCalls[0]?.rows[0]?.name).toBe('new');
    expect(await db.syncQueue.count()).toBe(0);
    await push(client, { now: now + 10_000_000, force: false });
    expect(server.upsertCalls).toHaveLength(1);
  });

  describe('workout history writes', () => {
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    const completed = (id: string, day: number, weightKg: number, isPR = false): Workout => ({
      id,
      userId: 'u1',
      name: id,
      startedAt: base + day * 86_400_000,
      endedAt: base + day * 86_400_000 + 3_600_000,
      status: 'completed',
      createdAt: 1,
      updatedAt: 1,
      exercises: [
        {
          id: `we-${id}`,
          exerciseId: 'bench',
          order: 0,
          sets: [
            {
              id: `s-${id}`,
              order: 0,
              type: 'normal',
              weightKg,
              reps: 5,
              completed: true,
              ...(isPR ? { isPR: true } : {}),
            },
          ],
        },
      ],
    });

    beforeEach(async () => {
      await db.exercises.put(exerciseRecord('bench'));
      await db.workouts.bulkPut([
        completed('w1', 1, 100),
        completed('w2', 2, 110, true),
        completed('w3', 3, 105),
      ]);
    });

    it('a deleted workout pushes a soft-delete tombstone', async () => {
      await deleteWorkout('w1');
      const now = Date.parse('2026-03-01T00:00:00.000Z');
      await push(createFakeClient(server), { now, force: true });
      expect(server.updateCalls).toEqual([
        { table: 'workouts', values: { deleted_at: '2026-03-01T00:00:00.000Z' }, ids: ['w1'] },
      ]);
      expect(await db.syncQueue.count()).toBe(0);
    });

    it('a recompute pushes every changed row', async () => {
      const stored = await db.workouts.get('w2');
      if (!stored) throw new Error('fixture');
      const lowered: Workout = { ...stored, exercises: completed('w2', 2, 95).exercises };
      await updateCompletedWorkout(lowered, { markIncomplete: false });
      const res = await push(createFakeClient(server), { now: Date.now(), force: false });
      expect(res).toEqual({ pushed: 2, failed: 0, offline: false, authExpired: false });
      expect(server.tables.workouts.map((r) => r.id).sort()).toEqual(['w2', 'w3']);
      expect(await db.syncQueue.count()).toBe(0);
    });
  });

  it('delete in backoff + newer upsert sends only the upsert, clears both, no replay', async () => {
    await saveExercise(exerciseRecord('a'));
    await removeExercise('a');
    server.failWhen = () => 'boom';
    const client = createFakeClient(server);
    const now = Date.now();
    await push(client, { now, force: false });
    server.failWhen = undefined;
    server.upsertCalls.length = 0;
    await saveExercise(exerciseRecord('a', { name: 'new' }));
    const res = await push(client, { now: now + 1000, force: false });
    expect(res.pushed).toBe(1);
    expect(server.upsertCalls).toHaveLength(1);
    expect(server.upsertCalls[0]?.rows[0]?.name).toBe('new');
    expect(await db.syncQueue.count()).toBe(0);
    await push(client, { now: now + 10_000_000, force: false });
    expect(server.upsertCalls).toHaveLength(1);
  });
});
