import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import {
  enqueue,
  hasPending,
  listDue,
  observeOutboxCounts,
  recordFailure,
  removeEntries,
  runWrite,
} from '../repos/outbox';
import {
  getOwner,
  isInitialPullDone,
  requireUserId,
  setInitialPullDone,
  setOwner,
  wipeLocalData,
} from '../repos/meta';
import type { BodyweightEntry } from '../../types/domain';

const bw = (id: string, date = '2026-01-01'): BodyweightEntry => ({
  userId: 'u1',
  updatedAt: 1,
  id,
  date,
  weightKg: 80,
  createdAt: 1,
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('enqueue', () => {
  it('throws outside a transaction', async () => {
    await expect(enqueue('bodyweight_entries', 'a', 'upsert', bw('a'))).rejects.toThrow(
      /transaction/,
    );
  });

  it('throws inside a transaction without syncQueue', async () => {
    await expect(
      db.transaction('rw', db.bodyweight, () => enqueue('bodyweight_entries', 'a', 'delete')),
    ).rejects.toThrow(/syncQueue/);
  });

  it('writes both rows in runWrite with defaults', async () => {
    await runWrite(['bodyweight_entries'], async () => {
      await db.bodyweight.put(bw('a'));
      await enqueue('bodyweight_entries', 'a', 'upsert', bw('a'));
    });
    const [entry] = await db.syncQueue.toArray();
    expect(entry).toMatchObject({
      table: 'bodyweight_entries',
      recordId: 'a',
      op: 'upsert',
      attempts: 0,
      state: 'pending',
    });
    expect(entry?.nextAttemptAt).toBe(entry?.createdAt);
    expect(await db.bodyweight.count()).toBe(1);
  });

  it('rolls back both writes when the transaction fails', async () => {
    await expect(
      runWrite(['bodyweight_entries'], async () => {
        await db.bodyweight.put(bw('a'));
        await enqueue('bodyweight_entries', 'a', 'upsert', bw('a'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.bodyweight.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('is append-only and enqueues deletes with null payload', async () => {
    await runWrite(['bodyweight_entries'], async () => {
      await enqueue('bodyweight_entries', 'a', 'upsert', bw('a'));
      await enqueue('bodyweight_entries', 'a', 'upsert', bw('a'));
      await enqueue('bodyweight_entries', 'a', 'delete');
    });
    const all = await db.syncQueue.toArray();
    expect(all).toHaveLength(3);
    expect(all[2]).toMatchObject({ op: 'delete', payload: null });
  });
});

describe('listDue / removeEntries / hasPending', () => {
  it('returns empty for empty queue', async () => {
    expect(await listDue(Date.now(), false)).toEqual([]);
    expect(await hasPending('bodyweight_entries', 'a')).toBe(false);
  });

  it('orders by id and respects nextAttemptAt unless forced', async () => {
    await runWrite(['bodyweight_entries'], async () => {
      await enqueue('bodyweight_entries', 'a', 'upsert', bw('a'));
      await enqueue('bodyweight_entries', 'b', 'upsert', bw('b', '2026-01-02'));
    });
    const [first, second] = await db.syncQueue.toArray();
    await recordFailure([first?.id ?? 0], 'x', Date.now() + 100000);
    const due = await listDue(Date.now(), false);
    expect(due.map((e) => e.recordId)).toEqual(['b']);
    const forced = await listDue(Date.now(), true);
    expect(forced.map((e) => e.recordId)).toEqual(['a', 'b']);
    await removeEntries([second?.id ?? 0]);
    expect(await hasPending('bodyweight_entries', 'b')).toBe(false);
    expect(await hasPending('bodyweight_entries', 'a')).toBe(true);
  });
});

describe('recordFailure', () => {
  it('uses the new attempts value for backoff and caps at 5 minutes', async () => {
    await runWrite(['bodyweight_entries'], () => enqueue('bodyweight_entries', 'a', 'delete'));
    const id = (await db.syncQueue.toArray())[0]?.id ?? 0;
    const expected = [2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 300000, 300000];
    for (const delay of expected) {
      await recordFailure([id], 'err', 10);
      expect((await db.syncQueue.get(id))?.nextAttemptAt).toBe(10 + delay);
    }
    const e = await db.syncQueue.get(id);
    expect(e?.attempts).toBe(10);
    expect(e?.lastError).toBe('err');
    expect(e?.state).toBe('pending');
  });

  it('ignores unknown ids', async () => {
    await expect(recordFailure([999], 'x', 0)).resolves.toBeUndefined();
  });
});

describe('observeOutboxCounts', () => {
  it('emits counts', async () => {
    await runWrite(['bodyweight_entries'], () => enqueue('bodyweight_entries', 'a', 'delete'));
    await db.syncQueue.add({
      table: 'exercises',
      recordId: 'z',
      createdAt: 1,
      attempts: 5,
      state: 'failed',
      nextAttemptAt: 1,
      op: 'delete',
      payload: null,
    });
    const value = await new Promise<{ pending: number; failed: number }>((resolve, reject) => {
      const sub = observeOutboxCounts().subscribe({
        next: (v) => {
          resolve(v);
          setTimeout(() => sub.unsubscribe(), 0);
        },
        error: reject,
      });
    });
    expect(value).toEqual({ pending: 1, failed: 1 });
  });
});

describe('meta', () => {
  it('has no owner initially and requireUserId throws', async () => {
    expect(await getOwner()).toBeUndefined();
    await expect(requireUserId()).rejects.toThrow();
    expect(await isInitialPullDone()).toBe(false);
  });

  it('stores owner and flags', async () => {
    await setOwner('u1', 'a@b.c');
    await setInitialPullDone(true);
    expect(await getOwner()).toEqual({ userId: 'u1', email: 'a@b.c' });
    expect(await requireUserId()).toBe('u1');
    expect(await isInitialPullDone()).toBe(true);
  });

  it('wipeLocalData clears every table', async () => {
    await setOwner('u1', 'a@b.c');
    await db.bodyweight.put(bw('a'));
    await db.syncState.put({ table: 'workouts', lastPulledAt: 'x', lastPulledKey: 'y' });
    await runWrite(['bodyweight_entries'], () => enqueue('bodyweight_entries', 'a', 'delete'));
    await wipeLocalData();
    for (const t of db.tables) expect(await t.count()).toBe(0);
  });
});
