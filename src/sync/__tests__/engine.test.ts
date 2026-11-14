import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { enqueue, runWrite } from '../../db/repos/outbox';
import { getOwner, isInitialPullDone, setOwner, wipeLocalData } from '../../db/repos/meta';
import type { SyncStatus } from '../../types/sync';
import { createSyncEngine } from '../engine';
import { createFakeClient, exerciseRecord, exerciseRow, FakeServer } from './fakeClient';

let server: FakeServer;
let online = true;

function makeEngine() {
  return createSyncEngine({
    client: createFakeClient(server),
    now: () => Date.now(),
    isOnline: () => online,
  });
}

async function saveExercise(id: string): Promise<void> {
  const rec = exerciseRecord(id);
  await runWrite(['exercises'], async () => {
    await db.exercises.put(rec);
    await enqueue('exercises', id, 'upsert', rec);
  });
}

beforeEach(async () => {
  await wipeLocalData();
  server = new FakeServer();
  online = true;
  await setOwner('u1', 'a@example.com');
});

describe('sync engine', () => {
  it('pushes then pulls, marks the initial pull done and reports synced', async () => {
    await saveExercise('mine');
    server.seed('exercises', [exerciseRow('theirs', '2026-01-01T00:00:00.000001+00:00')]);
    const engine = makeEngine();
    await engine.syncNow('start');
    const status = engine.getStatus();
    expect(status.state).toBe('synced');
    expect(status.lastSyncedAt).toBeTypeOf('number');
    expect(server.tables.exercises.map((r) => r.id).sort()).toEqual(['mine', 'theirs']);
    expect(await db.exercises.get('theirs')).toBeDefined();
    expect(await db.syncQueue.count()).toBe(0);
    expect(await isInitialPullDone()).toBe(true);
  });

  it('reports offline without touching the server when the browser is offline', async () => {
    online = false;
    await saveExercise('a');
    const engine = makeEngine();
    await engine.syncNow('start');
    expect(engine.getStatus().state).toBe('offline');
    expect(server.upsertCalls).toHaveLength(0);
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('reports offline when push hits a network failure and keeps the queue', async () => {
    await saveExercise('a');
    server.networkDown = true;
    const engine = makeEngine();
    await engine.syncNow('start');
    expect(engine.getStatus().state).toBe('offline');
    expect(server.selectCalls).toHaveLength(0);
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('errors when there is no session or no local owner', async () => {
    server.session = null;
    const engine = makeEngine();
    await engine.syncNow('start');
    expect(engine.getStatus().state).toBe('error');

    server.session = { user: { id: 'u1' } };
    await wipeLocalData();
    await engine.syncNow('start');
    expect(engine.getStatus().state).toBe('error');
    expect(server.selectCalls).toHaveLength(0);
  });

  it('is single-flight and runs exactly one follow-up pass for requests made mid-run', async () => {
    await saveExercise('a');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.onUpsert = () => {
      server.onUpsert = undefined;
      return gate;
    };
    const engine = makeEngine();
    const first = engine.syncNow('start');
    await new Promise((r) => setTimeout(r, 20));
    const second = engine.syncNow('write');
    const third = engine.syncNow('visible');
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(server.selectCalls).toHaveLength(0);
    release();
    await first;
    expect(server.upsertCalls).toHaveLength(1);
    expect(server.selectCalls).toHaveLength(10);
    expect(engine.getStatus().state).toBe('synced');
  });

  it('manual sync forces entries that are in backoff', async () => {
    await saveExercise('a');
    server.failWhen = () => 'boom';
    const engine = makeEngine();
    await engine.syncNow('start');
    expect(engine.getStatus().state).toBe('error');
    server.failWhen = undefined;
    server.upsertCalls.length = 0;

    await engine.syncNow('write');
    expect(server.upsertCalls).toHaveLength(0);

    await engine.syncNow('manual');
    expect(server.upsertCalls).toHaveLength(1);
    expect(engine.getStatus().state).toBe('synced');
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('notifies subscribers and mirrors outbox counts', async () => {
    const engine = makeEngine();
    const seen: SyncStatus[] = [];
    const unsub = engine.subscribe((s) => seen.push(s));
    await new Promise((r) => setTimeout(r, 50));
    await saveExercise('a');
    await new Promise((r) => setTimeout(r, 50));
    await engine.syncNow('start');
    await new Promise((r) => setTimeout(r, 50));
    unsub();
    expect(seen.some((s) => s.state === 'syncing')).toBe(true);
    expect(seen.some((s) => s.pendingCount === 1)).toBe(true);
    expect(engine.getStatus()).toMatchObject({ state: 'synced', pendingCount: 0 });
  });

  it('treats a hanging getSession as offline and releases the sync lock', async () => {
    let held = false;
    let wasHeld = false;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (_name: string, fn: () => Promise<void>) => {
          held = true;
          wasHeld = true;
          try {
            return await fn();
          } finally {
            held = false;
          }
        },
      },
    });
    const client = createFakeClient(server);
    const hung = { ...client, auth: { getSession: () => new Promise<never>(() => undefined) } };
    const engine = createSyncEngine({
      client: hung as unknown as typeof client,
      now: () => Date.now(),
      isOnline: () => online,
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const run = engine.syncNow('start');
      await vi.advanceTimersByTimeAsync(2500);
      await run;
    } finally {
      vi.useRealTimers();
    }
    expect(engine.getStatus().state).toBe('offline');
    expect(wasHeld).toBe(true);
    expect(held).toBe(false);
    Reflect.deleteProperty(navigator, 'locks');
  });

  it('restores the previous state when the owner changes mid-run', async () => {
    online = false;
    const engine = makeEngine();
    await engine.syncNow('start');
    expect(engine.getStatus().state).toBe('offline');
    online = true;
    await saveExercise('a');
    server.onUpsert = async () => {
      server.onUpsert = undefined;
      await setOwner('u2', 'b@example.com');
    };
    await engine.syncNow('manual');
    expect((await getOwner())?.userId).toBe('u2');
    expect(engine.getStatus().state).toBe('offline');
  });
});
