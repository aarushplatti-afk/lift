import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { enqueue, retryFailed, runWrite } from '../../db/repos/outbox';
import { getOwner, isInitialPullDone, setOwner, wipeLocalData } from '../../db/repos/meta';
import type { SyncStatus } from '../../types/sync';
import { onQuotaExceeded } from '../../lib/storageEvents';
import { createSyncEngine } from '../engine';
import { createFakeClient, exerciseRecord, exerciseRow, FakeServer } from './fakeClient';

let server: FakeServer;
let online = true;

function makeEngine(extra: Partial<Parameters<typeof createSyncEngine>[0]> = {}) {
  return createSyncEngine({
    client: createFakeClient(server),
    now: () => Date.now(),
    isOnline: () => online,
    seed: async () => 0,
    ...extra,
  });
}

function fakeTimers() {
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  return {
    timers,
    setTimer: (fn: () => void, ms: number) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (h: unknown) => {
      (h as { cleared: boolean }).cleared = true;
    },
  };
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

  it('still marks the initial pull done and reports an error when seeding throws', async () => {
    const seed = vi
      .fn<(userId: string) => Promise<number>>()
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(0);
    const engine = createSyncEngine({
      client: createFakeClient(server),
      now: () => Date.now(),
      isOnline: () => online,
      seed,
    });
    await engine.syncNow('start');
    expect(await isInitialPullDone()).toBe(true);
    expect(engine.getStatus().state).toBe('error');
    expect(engine.getStatus().lastError).toBe("Couldn't add built-in exercises: quota exceeded");
    await engine.syncNow('manual');
    expect(seed).toHaveBeenCalledTimes(2);
    expect(engine.getStatus().state).toBe('synced');
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
      seed: async () => 0,
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

  describe('retry timer', () => {
    it('schedules syncNow(retry) at the earliest nextAttemptAt and retries when it fires', async () => {
      await saveExercise('a');
      server.failWhen = () => ({ message: 'down', status: 503 });
      const t = fakeTimers();
      const engine = makeEngine(t);
      await engine.syncNow('start');
      const live = t.timers.filter((x) => !x.cleared);
      expect(live).toHaveLength(1);
      expect(live[0]?.ms).toBeGreaterThan(1500);
      expect(live[0]?.ms).toBeLessThanOrEqual(2000);
      server.failWhen = undefined;
      const entry = await db.syncQueue.toCollection().first();
      await db.syncQueue.update(entry?.id ?? 0, { nextAttemptAt: 0 });
      live[0]?.fn();
      await vi.waitFor(() => expect(server.upsertCalls.length).toBeGreaterThan(1));
      await vi.waitFor(() => expect(engine.getStatus().state).toBe('synced'));
    });

    it('clamps the delay to between 1 s and 300 s', async () => {
      await saveExercise('a');
      server.failWhen = () => ({ message: 'down', status: 503 });
      const t = fakeTimers();
      const engine = makeEngine(t);
      await engine.syncNow('start');
      const entry = await db.syncQueue.toCollection().first();
      await db.syncQueue.update(entry?.id ?? 0, { nextAttemptAt: Date.now() + 900_000 });
      await engine.syncNow('write');
      expect(t.timers[t.timers.length - 1]?.ms).toBe(300_000);
      await db.syncQueue.update(entry?.id ?? 0, { nextAttemptAt: Date.now() + 100 });
      await engine.syncNow('write');
      expect(t.timers[t.timers.length - 1]?.ms).toBe(1000);
    });

    it('cancels the timer when a new run starts and does not schedule while offline', async () => {
      await saveExercise('a');
      server.failWhen = () => ({ message: 'down', status: 503 });
      const t = fakeTimers();
      const engine = makeEngine(t);
      await engine.syncNow('start');
      const first = t.timers[0];
      expect(first?.cleared).toBe(false);
      await engine.syncNow('manual');
      expect(first?.cleared).toBe(true);

      online = false;
      const before = t.timers.length;
      await engine.syncNow('offline');
      expect(t.timers.length).toBe(before);
    });
  });

  describe('retry timer without a usable session', () => {
    async function armed() {
      await saveExercise('a');
      server.failWhen = () => ({ message: 'down', status: 503 });
      const t = fakeTimers();
      const engine = makeEngine(t);
      await engine.syncNow('start');
      expect(t.timers.filter((x) => !x.cleared)).toHaveLength(1);
      return { t, engine };
    }

    it('does not re-arm after the session goes missing', async () => {
      const { t, engine } = await armed();
      server.session = null;
      t.timers[0]?.fn();
      await vi.waitFor(() => expect(engine.getStatus().lastError).toBe('Not signed in'));
      await new Promise((r) => setTimeout(r, 20));
      expect(t.timers).toHaveLength(1);
    });

    it('does not re-arm when there is no local account for the session', async () => {
      const { t, engine } = await armed();
      await db.meta.clear();
      t.timers[0]?.fn();
      await vi.waitFor(() =>
        expect(engine.getStatus().lastError).toBe('No local account for this session'),
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(t.timers).toHaveLength(1);
    });

    it('does not re-arm after the session expired', async () => {
      const { t, engine } = await armed();
      server.failWhen = undefined;
      server.tokenValid = false;
      server.refreshMode = 'rejected';
      t.timers[0]?.fn();
      await vi.waitFor(() => expect(engine.getStatus().lastError).toMatch(/Session expired/));
      await new Promise((r) => setTimeout(r, 20));
      expect(t.timers).toHaveLength(1);
    });

    it('cancelRetry clears the armed timer', async () => {
      const { t, engine } = await armed();
      engine.cancelRetry();
      expect(t.timers[0]?.cleared).toBe(true);
    });
  });

  it('shows offline immediately even while a run is in progress', async () => {
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
    const run = engine.syncNow('start');
    await vi.waitFor(() => expect(engine.getStatus().state).toBe('syncing'));
    online = false;
    void engine.syncNow('offline');
    expect(engine.getStatus().state).toBe('offline');
    release();
    await run;
  });

  it('reports a quota error thrown during a run so the quota dialog can open', async () => {
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const client = createFakeClient(server);
    const failing = {
      ...client,
      auth: { getSession: () => Promise.reject(quota) },
    } as unknown as typeof client;
    const engine = makeEngine({ client: failing });
    const seen = vi.fn();
    const off = onQuotaExceeded(seen);
    await engine.syncNow('start');
    off();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(engine.getStatus().state).toBe('error');
  });

  it('marks a permanent rejection as failed, reports error and does not schedule a retry', async () => {
    await saveExercise('a');
    server.failWhen = () => ({ message: 'denied', code: '42501', status: 403 });
    const t = fakeTimers();
    const engine = makeEngine(t);
    engine.subscribe(() => undefined);
    await engine.syncNow('start');
    await vi.waitFor(() => expect(engine.getStatus().failedCount).toBe(1));
    expect(engine.getStatus().state).toBe('error');
    expect(t.timers).toHaveLength(0);
    server.failWhen = undefined;
    await engine.syncNow('manual');
    expect(engine.getStatus().state).toBe('error');
  });

  it('returns to synced once failed entries are retried and succeed', async () => {
    await saveExercise('a');
    server.failWhen = () => ({ message: 'denied', code: '42501', status: 403 });
    const engine = makeEngine();
    engine.subscribe(() => undefined);
    await engine.syncNow('start');
    server.failWhen = undefined;
    await retryFailed();
    await engine.syncNow('manual');
    expect(engine.getStatus().state).toBe('synced');
    await vi.waitFor(() => expect(engine.getStatus().failedCount).toBe(0));
  });

  it('refreshes once on a 401 during pull and continues', async () => {
    server.tokenValid = false;
    const engine = makeEngine();
    await engine.syncNow('start');
    expect(server.refreshCalls).toBe(1);
    expect(engine.getStatus().state).toBe('synced');
  });

  it('reports session expired when the pull 401 refresh is rejected', async () => {
    server.tokenValid = false;
    server.refreshMode = 'rejected';
    const engine = makeEngine();
    await engine.syncNow('start');
    expect(engine.getStatus()).toMatchObject({
      state: 'error',
      lastError: 'Session expired. Sign in again to sync.',
    });
    expect(server.refreshCalls).toBe(1);
  });

  describe('runExclusive', () => {
    it('waits for the running loop and defers syncNow calls made meanwhile to one rerun', async () => {
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
      const run = engine.syncNow('start');
      await new Promise((r) => setTimeout(r, 20));
      const order: string[] = [];
      const exclusive = engine.runExclusive(async () => {
        order.push('fn-start');
        await engine.syncNow('write');
        await engine.syncNow('visible');
        order.push('fn-end');
        return 42;
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(order).toEqual([]);
      release();
      await run;
      expect(await exclusive).toBe(42);
      expect(order).toEqual(['fn-start', 'fn-end']);
      const selectsAfterFn = server.selectCalls.length;
      await vi.waitFor(() => expect(server.selectCalls.length).toBe(selectsAfterFn + 5));
      await new Promise((r) => setTimeout(r, 50));
      expect(server.selectCalls.length).toBe(selectsAfterFn + 5);
    });

    it('serialises concurrent callers and releases after a throw', async () => {
      const engine = makeEngine();
      const order: string[] = [];
      const a = engine.runExclusive(async () => {
        order.push('a1');
        await new Promise((r) => setTimeout(r, 10));
        order.push('a2');
        throw new Error('boom');
      });
      const b = engine.runExclusive(async () => {
        order.push('b');
      });
      await expect(a).rejects.toThrow('boom');
      await b;
      expect(order).toEqual(['a1', 'a2', 'b']);
      await engine.syncNow('manual');
      expect(engine.getStatus().state).toBe('synced');
    });
  });
});
