import Dexie, { liveQuery, type Observable } from 'dexie';
import { db, LOCAL_TABLE } from '../schema';
import type { DeletableTable, OutboxEntry, SyncRecordMap, SyncTable } from '../../types/sync';

const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 300000;

export function runWrite<T>(tables: readonly SyncTable[], fn: () => Promise<T>): Promise<T> {
  const names = new Set<string>(tables.map((t) => LOCAL_TABLE[t]));
  names.add('syncQueue');
  return db.transaction('rw', [...names], fn);
}

export function enqueue<T extends SyncTable>(
  table: T,
  recordId: string,
  op: 'upsert',
  payload: SyncRecordMap[T],
): Promise<void>;
export function enqueue(table: DeletableTable, recordId: string, op: 'delete'): Promise<void>;
export async function enqueue(
  table: SyncTable,
  recordId: string,
  op: 'upsert' | 'delete',
  payload?: SyncRecordMap[SyncTable],
): Promise<void> {
  const tx = Dexie.currentTransaction;
  if (!tx || !tx.storeNames.includes('syncQueue')) {
    throw new Error('enqueue must run inside a transaction that includes syncQueue');
  }
  const createdAt = Date.now();
  const base = {
    table,
    recordId,
    createdAt,
    attempts: 0,
    state: 'pending' as const,
    nextAttemptAt: createdAt,
  };
  if (op === 'upsert') {
    if (payload === undefined) throw new Error('upsert requires a payload');
    await db.syncQueue.add({ ...base, op: 'upsert', payload });
  } else {
    await db.syncQueue.add({ ...base, op: 'delete', payload: null });
  }
}

export async function listDue(now: number, force: boolean): Promise<OutboxEntry[]> {
  const pending = await db.syncQueue.where('state').equals('pending').sortBy('id');
  return force ? pending : pending.filter((e) => e.nextAttemptAt <= now);
}

export async function removeEntries(ids: number[]): Promise<void> {
  await db.syncQueue.bulkDelete(ids);
}

export async function recordFailure(ids: number[], error: string, now: number): Promise<void> {
  await db.transaction('rw', db.syncQueue, async () => {
    for (const id of ids) {
      const entry = await db.syncQueue.get(id);
      if (!entry) continue;
      const attempts = entry.attempts + 1;
      const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
      await db.syncQueue.update(id, {
        attempts,
        lastError: error,
        nextAttemptAt: now + delay,
      });
    }
  });
}

export async function hasPending(table: SyncTable, recordId: string): Promise<boolean> {
  const count = await db.syncQueue.where('[table+recordId]').equals([table, recordId]).count();
  return count > 0;
}

export function observeOutboxCounts(): Observable<{ pending: number; failed: number }> {
  return liveQuery(async () => ({
    pending: await db.syncQueue.where('state').equals('pending').count(),
    failed: await db.syncQueue.where('state').equals('failed').count(),
  }));
}
