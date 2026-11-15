import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { enqueue, runWrite } from '../../db/repos/outbox';
import { deleteWorkout, updateCompletedWorkout } from '../../db/repos/workouts';
import { wipeLocalData } from '../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../db/repos/settings';
import type { Exercise, Workout } from '../../types/domain';
import { pushOutbox } from '../push';
import { createFakeClient, exerciseRecord, FakeServer } from './fakeClient';

let server: FakeServer;

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
    const res = await pushOutbox(createFakeClient(server), { now: Date.now(), force: false });
    expect(res).toEqual({ pushed: 3, failed: 0, offline: false });
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
    await pushOutbox(createFakeClient(server), { now: Date.now(), force: false });
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
    await pushOutbox(createFakeClient(server), { now: Date.now(), force: false });
    const left = await db.syncQueue.toArray();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ op: 'upsert', payload: { name: 'edited-mid-push' } });

    await pushOutbox(createFakeClient(server), { now: Date.now(), force: false });
    expect(server.tables.exercises[0]?.name).toBe('edited-mid-push');
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('sends deletes as a deleted_at tombstone update', async () => {
    await removeExercise('a');
    const now = Date.parse('2026-03-01T00:00:00.000Z');
    await pushOutbox(createFakeClient(server), { now, force: true });
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
    await pushOutbox(createFakeClient(server), { now: Date.now(), force: false });
    expect(server.upsertCalls[0]?.onConflict).toBe('user_id');
    expect(server.tables.user_settings[0]?.user_id).toBe('u1');
  });

  it('replaying the same write is duplicate-safe', async () => {
    const client = createFakeClient(server);
    await saveExercise(exerciseRecord('a'));
    await pushOutbox(client, { now: Date.now(), force: false });
    await saveExercise(exerciseRecord('a'));
    await pushOutbox(client, { now: Date.now(), force: false });
    expect(server.tables.exercises).toHaveLength(1);
  });

  it('isolates a bad op, pushes the rest, and records the failure with backoff', async () => {
    await saveExercise(exerciseRecord('good'));
    await saveExercise(exerciseRecord('bad'));
    server.failWhen = (_t, rows) => (rows.some((r) => r.id === 'bad') ? 'check violation' : null);
    const now = Date.now() + 1_000_000;
    const res = await pushOutbox(createFakeClient(server), { now, force: true });
    expect(res).toEqual({ pushed: 1, failed: 1, offline: false });
    expect(server.tables.exercises.map((r) => r.id)).toEqual(['good']);
    const left = await db.syncQueue.toArray();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({
      recordId: 'bad',
      attempts: 1,
      lastError: 'check violation',
      nextAttemptAt: now + 2000,
    });
  });

  it('skips entries in backoff unless forced', async () => {
    await saveExercise(exerciseRecord('bad'));
    server.failWhen = () => 'boom';
    const client = createFakeClient(server);
    const now = Date.now() + 1_000_000;
    await pushOutbox(client, { now, force: false });
    server.upsertCalls.length = 0;

    const skipped = await pushOutbox(client, { now: now + 1000, force: false });
    expect(skipped).toEqual({ pushed: 0, failed: 0, offline: false });
    expect(server.upsertCalls).toHaveLength(0);

    const forced = await pushOutbox(client, { now: now + 1000, force: true });
    expect(forced.failed).toBe(1);
    expect((await db.syncQueue.toArray())[0]?.attempts).toBe(2);

    server.failWhen = undefined;
    const due = await pushOutbox(client, { now: now + 1_000_000, force: false });
    expect(due.pushed).toBe(1);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('reports offline on a fetch failure and leaves the outbox untouched', async () => {
    await saveExercise(exerciseRecord('a'));
    await saveExercise(exerciseRecord('b'));
    server.networkDown = true;
    const res = await pushOutbox(createFakeClient(server), { now: Date.now(), force: false });
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
    await pushOutbox(client, { now: Date.now(), force: false });
    server.networkDown = false;
    const res = await pushOutbox(client, { now: Date.now(), force: false });
    expect(res.pushed).toBe(1);
    expect(server.tables.exercises).toHaveLength(1);
  });

  it('failed old entry + new due entry sends the latest payload, clears both, no replay', async () => {
    await saveExercise(exerciseRecord('a', { name: 'old' }));
    server.failWhen = () => 'boom';
    const client = createFakeClient(server);
    const now = Date.now();
    await pushOutbox(client, { now, force: false });
    server.failWhen = undefined;
    server.upsertCalls.length = 0;
    await saveExercise(exerciseRecord('a', { name: 'new' }));
    const res = await pushOutbox(client, { now: now + 1000, force: false });
    expect(res.pushed).toBe(1);
    expect(server.upsertCalls).toHaveLength(1);
    expect(server.upsertCalls[0]?.rows[0]?.name).toBe('new');
    expect(await db.syncQueue.count()).toBe(0);
    await pushOutbox(client, { now: now + 10_000_000, force: false });
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
      await pushOutbox(createFakeClient(server), { now, force: true });
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
      const res = await pushOutbox(createFakeClient(server), { now: Date.now(), force: false });
      expect(res).toEqual({ pushed: 2, failed: 0, offline: false });
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
    await pushOutbox(client, { now, force: false });
    server.failWhen = undefined;
    server.upsertCalls.length = 0;
    await saveExercise(exerciseRecord('a', { name: 'new' }));
    const res = await pushOutbox(client, { now: now + 1000, force: false });
    expect(res.pushed).toBe(1);
    expect(server.upsertCalls).toHaveLength(1);
    expect(server.upsertCalls[0]?.rows[0]?.name).toBe('new');
    expect(await db.syncQueue.count()).toBe(0);
    await pushOutbox(client, { now: now + 10_000_000, force: false });
    expect(server.upsertCalls).toHaveLength(1);
  });
});
