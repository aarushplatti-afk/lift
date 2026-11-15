import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import { enqueue, recordFailure, runWrite } from '../../db/repos/outbox';
import { setOwner, wipeLocalData } from '../../db/repos/meta';
import { discardFailedChange } from '../failed';
import type { LiftClient } from '../../lib/supabase';
import type { SyncTable } from '../../types/sync';
import { createFakeClient, exerciseRecord, exerciseRow, FakeServer } from './fakeClient';

let server: FakeServer;

function clientWithFetchById(): LiftClient {
  const base = createFakeClient(server) as unknown as {
    from: (t: SyncTable) => object;
    auth: object;
  };
  return {
    auth: base.auth,
    from: (table: SyncTable) => ({
      select: () => ({
        eq: (col: string, value: string) => ({
          maybeSingle: () => {
            const res = server.select(table, 'u1', undefined, Infinity);
            const row = res.data?.find((r) => r[col] === value) ?? null;
            return Promise.resolve({ data: row, error: res.error, status: res.status });
          },
        }),
      }),
    }),
  } as unknown as LiftClient;
}

async function saveFailed(id: string, name: string): Promise<void> {
  const rec = exerciseRecord(id, { name });
  await runWrite(['exercises'], async () => {
    await db.exercises.put(rec);
    await enqueue('exercises', id, 'upsert', rec);
  });
  const ids = (await db.syncQueue.toArray()).flatMap((e) => (e.id === undefined ? [] : [e.id]));
  await recordFailure(ids, 'denied', '42501', { kind: 'permanent' });
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@example.com');
  server = new FakeServer();
});

describe('discardFailedChange', () => {
  it('applies the server row and removes the entries', async () => {
    await saveFailed('a', 'Local name');
    server.seed('exercises', [
      exerciseRow('a', '2026-01-01T00:00:00.000001+00:00', { name: 'Server name' }),
    ]);
    const result = await discardFailedChange(clientWithFetchById(), 'exercises', 'a');
    expect(result).toEqual({ ok: true });
    expect((await db.exercises.get('a'))?.name).toBe('Server name');
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('deletes the local row when the server has no live row', async () => {
    await saveFailed('a', 'Local name');
    const result = await discardFailedChange(clientWithFetchById(), 'exercises', 'a');
    expect(result).toEqual({ ok: true });
    expect(await db.exercises.get('a')).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('deletes the local row when the server row is a tombstone', async () => {
    await saveFailed('a', 'Local name');
    server.seed('exercises', [
      exerciseRow('a', '2026-01-01T00:00:00.000001+00:00', {
        deleted_at: '2026-01-02T00:00:00+00:00',
      }),
    ]);
    await discardFailedChange(clientWithFetchById(), 'exercises', 'a');
    expect(await db.exercises.get('a')).toBeUndefined();
  });

  it('changes nothing when the fetch fails offline', async () => {
    await saveFailed('a', 'Local name');
    server.networkDown = true;
    const result = await discardFailedChange(clientWithFetchById(), 'exercises', 'a');
    expect(result).toEqual({ ok: false });
    expect((await db.exercises.get('a'))?.name).toBe('Local name');
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('times out a hung fetch, returns ok false and keeps local state', async () => {
    await saveFailed('a', 'Local name');
    const base = clientWithFetchById() as unknown as { auth: object };
    const hung = {
      auth: base.auth,
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => new Promise<never>(() => undefined) }) }),
      }),
    } as unknown as LiftClient;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = discardFailedChange(hung, 'exercises', 'a');
      await vi.advanceTimersByTimeAsync(16_000);
      expect(await pending).toEqual({ ok: false });
    } finally {
      vi.useRealTimers();
    }
    expect((await db.exercises.get('a'))?.name).toBe('Local name');
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('refreshes once on a 401 and then discards', async () => {
    await saveFailed('a', 'Local name');
    server.seed('exercises', [
      exerciseRow('a', '2026-01-01T00:00:00.000001+00:00', { name: 'Server name' }),
    ]);
    server.tokenValid = false;
    const result = await discardFailedChange(clientWithFetchById(), 'exercises', 'a');
    expect(result).toEqual({ ok: true });
    expect(server.refreshCalls).toBe(1);
  });
});
