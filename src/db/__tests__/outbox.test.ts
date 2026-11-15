import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import {
  enqueue,
  hasPending,
  listDue,
  observeOutboxCounts,
  listFailedChanges,
  nextDueAt,
  recordFailure,
  retryFailed,
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
    await recordFailure([first?.id ?? 0], 'x', undefined, {
      kind: 'retryable',
      nextAttemptAt: () => Date.now() + 100000,
    });
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
  it('retryable: bumps attempts, schedules via the callback, stays pending', async () => {
    await runWrite(['bodyweight_entries'], () => enqueue('bodyweight_entries', 'a', 'delete'));
    const id = (await db.syncQueue.toArray())[0]?.id ?? 0;
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      await recordFailure([id], 'err', 'X1', {
        kind: 'retryable',
        nextAttemptAt: (attempts) => {
          seen.push(attempts);
          return 10 * attempts;
        },
      });
    }
    expect(seen).toEqual([1, 2, 3]);
    const e = await db.syncQueue.get(id);
    expect(e).toMatchObject({
      attempts: 3,
      lastError: 'err',
      lastErrorCode: 'X1',
      state: 'pending',
      nextAttemptAt: 30,
    });
  });

  it('permanent: sets failed state, error and code', async () => {
    await runWrite(['bodyweight_entries'], () => enqueue('bodyweight_entries', 'a', 'delete'));
    const id = (await db.syncQueue.toArray())[0]?.id ?? 0;
    await recordFailure([id], 'nope', '42501', { kind: 'permanent' });
    expect(await db.syncQueue.get(id)).toMatchObject({
      attempts: 1,
      state: 'failed',
      lastError: 'nope',
      lastErrorCode: '42501',
    });
  });

  it('ignores unknown ids', async () => {
    await expect(
      recordFailure([999], 'x', undefined, { kind: 'permanent' }),
    ).resolves.toBeUndefined();
  });
});

describe('listDue with failed entries', () => {
  it('skips lone failed entries but includes them when the record has a due pending entry', async () => {
    await runWrite(['bodyweight_entries'], async () => {
      await enqueue('bodyweight_entries', 'a', 'upsert', bw('a'));
      await enqueue('bodyweight_entries', 'b', 'upsert', bw('b', '2026-01-02'));
    });
    const [first] = await db.syncQueue.toArray();
    await recordFailure([first?.id ?? 0], 'x', undefined, { kind: 'permanent' });
    expect((await listDue(Date.now(), false)).map((e) => e.recordId)).toEqual(['b']);
    expect((await listDue(Date.now(), true)).map((e) => e.recordId)).toEqual(['b']);
    await runWrite(['bodyweight_entries'], () =>
      enqueue('bodyweight_entries', 'a', 'upsert', bw('a')),
    );
    const due = await listDue(Date.now(), false);
    expect(due.map((e) => [e.recordId, e.state])).toEqual([
      ['a', 'failed'],
      ['b', 'pending'],
      ['a', 'pending'],
    ]);
  });
});

describe('nextDueAt', () => {
  it('returns the earliest pending nextAttemptAt, ignoring failed', async () => {
    expect(await nextDueAt()).toBeUndefined();
    const add = (recordId: string, nextAttemptAt: number, state: 'pending' | 'failed') =>
      db.syncQueue.add({
        table: 'exercises',
        recordId,
        createdAt: 1,
        attempts: 1,
        state,
        nextAttemptAt,
        op: 'delete',
        payload: null,
      });
    await add('a', 500, 'pending');
    await add('b', 200, 'pending');
    await add('c', 100, 'failed');
    expect(await nextDueAt()).toBe(200);
  });
});

describe('failed changes', () => {
  it('lists failed records with labels and retryFailed flips them to pending', async () => {
    await db.workouts.put({
      id: 'w1',
      userId: 'u1',
      name: 'Push Day',
      startedAt: 1_700_000_000_000,
      status: 'completed',
      exercises: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await runWrite(['workouts', 'bodyweight_entries'], async () => {
      await enqueue('workouts', 'w1', 'delete');
      await enqueue('bodyweight_entries', 'b1', 'upsert', bw('b1', '2026-02-02'));
    });
    const ids = (await db.syncQueue.toArray()).map((e) => e.id ?? 0);
    await recordFailure(ids, 'nope', '42501', { kind: 'permanent' });
    const list = await listFailedChanges();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      table: 'workouts',
      recordId: 'w1',
      op: 'delete',
      attempts: 1,
      lastError: 'nope',
      recordName: 'Push Day',
      recordDate: 1_700_000_000_000,
    });
    expect(list[1]).toMatchObject({ table: 'bodyweight_entries', recordDate: '2026-02-02' });

    expect(await retryFailed('workouts', 'w1')).toBe(1);
    expect(await db.syncQueue.where('state').equals('failed').count()).toBe(1);
    expect(await retryFailed()).toBe(1);
    expect(await db.syncQueue.where('state').equals('failed').count()).toBe(0);
    const pending = await db.syncQueue.toArray();
    expect(pending.every((e) => e.state === 'pending' && e.attempts === 1)).toBe(true);
  });
});

describe('observeOutboxCounts', () => {
  it('emits counts and the oldest entry createdAt in any state', async () => {
    await db.syncQueue.add({
      table: 'exercises',
      recordId: 'z',
      createdAt: 111,
      attempts: 5,
      state: 'failed',
      nextAttemptAt: 1,
      op: 'delete',
      payload: null,
    });
    await runWrite(['bodyweight_entries'], () => enqueue('bodyweight_entries', 'a', 'delete'));
    const value = await new Promise<{
      pending: number;
      failed: number;
      oldestCreatedAt?: number;
    }>((resolve, reject) => {
      const sub = observeOutboxCounts().subscribe({
        next: (v) => {
          resolve(v);
          setTimeout(() => sub.unsubscribe(), 0);
        },
        error: reject,
      });
    });
    expect(value).toEqual({ pending: 1, failed: 1, oldestCreatedAt: 111 });
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
