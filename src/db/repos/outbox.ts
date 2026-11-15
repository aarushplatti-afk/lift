import Dexie, { liveQuery, type Observable } from 'dexie';
import { db, LOCAL_TABLE } from '../schema';
import { reportStorageError } from '../../lib/storageEvents';
import type { DeletableTable, OutboxEntry, SyncRecordMap, SyncTable } from '../../types/sync';

export function runWrite<T>(tables: readonly SyncTable[], fn: () => Promise<T>): Promise<T> {
  const names = new Set<string>(tables.map((t) => LOCAL_TABLE[t]));
  names.add('syncQueue');
  return db.transaction('rw', [...names], fn).catch((err: unknown) => {
    reportStorageError(err);
    throw err;
  });
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
  const keyOf = (e: OutboxEntry): string => `${e.table}:${e.recordId}`;
  const dueKeys = new Set(
    (force ? pending : pending.filter((e) => e.nextAttemptAt <= now)).map(keyOf),
  );
  if (dueKeys.size === 0) return [];
  const failed = await db.syncQueue.where('state').equals('failed').toArray();
  return [...pending, ...failed.filter((e) => dueKeys.has(keyOf(e)))]
    .filter((e) => dueKeys.has(keyOf(e)))
    .sort((x, y) => (x.id ?? 0) - (y.id ?? 0));
}

export async function removeEntries(ids: number[]): Promise<void> {
  await db.syncQueue.bulkDelete(ids);
}

export type FailureOutcome =
  { kind: 'retryable'; nextAttemptAt: (attempts: number) => number } | { kind: 'permanent' };

export async function recordFailure(
  ids: number[],
  error: string,
  code: string | undefined,
  outcome: FailureOutcome,
): Promise<void> {
  await db.transaction('rw', db.syncQueue, async () => {
    for (const id of ids) {
      const entry = await db.syncQueue.get(id);
      if (!entry) continue;
      const attempts = entry.attempts + 1;
      const patch: Partial<OutboxEntry> = { attempts, lastError: error, lastErrorCode: code };
      if (outcome.kind === 'permanent') {
        patch.state = 'failed';
      } else if (entry.state === 'pending') {
        patch.nextAttemptAt = outcome.nextAttemptAt(attempts);
      }
      await db.syncQueue.update(id, patch);
    }
  });
}

export async function hasPending(table: SyncTable, recordId: string): Promise<boolean> {
  const count = await db.syncQueue.where('[table+recordId]').equals([table, recordId]).count();
  return count > 0;
}

export function observeOutboxCounts(): Observable<{
  pending: number;
  failed: number;
  oldestCreatedAt?: number;
}> {
  return liveQuery(async () => {
    const oldest = await db.syncQueue.orderBy('id').first();
    return {
      pending: await db.syncQueue.where('state').equals('pending').count(),
      failed: await db.syncQueue.where('state').equals('failed').count(),
      ...(oldest ? { oldestCreatedAt: oldest.createdAt } : {}),
    };
  });
}

export async function nextDueAt(): Promise<number | undefined> {
  const first = await db.syncQueue.where('state').equals('pending').sortBy('nextAttemptAt');
  return first[0]?.nextAttemptAt;
}

export interface FailedChange {
  table: SyncTable;
  recordId: string;
  op: 'upsert' | 'delete';
  entryIds: number[];
  attempts: number;
  lastError: string;
  firstCreatedAt: number;
  recordName?: string;
  recordDate?: number | string;
}

interface Label {
  recordName?: string;
  recordDate?: number | string;
}

function labelOf(table: SyncTable, rec: SyncRecordMap[SyncTable] | undefined): Label {
  if (!rec) return {};
  switch (table) {
    case 'workouts': {
      const w = rec as SyncRecordMap['workouts'];
      return { recordName: w.name, recordDate: w.startedAt };
    }
    case 'bodyweight_entries':
      return { recordDate: (rec as SyncRecordMap['bodyweight_entries']).date };
    case 'exercises':
    case 'templates':
      return { recordName: (rec as SyncRecordMap['exercises' | 'templates']).name };
    case 'user_settings':
      return {};
  }
}

async function localRecord(
  table: SyncTable,
  recordId: string,
): Promise<SyncRecordMap[SyncTable] | undefined> {
  switch (table) {
    case 'workouts':
      return db.workouts.get(recordId);
    case 'exercises':
      return db.exercises.get(recordId);
    case 'templates':
      return db.templates.get(recordId);
    case 'bodyweight_entries':
      return db.bodyweight.get(recordId);
    case 'user_settings':
      return undefined;
  }
}

export async function listFailedChanges(): Promise<FailedChange[]> {
  const failed = (await db.syncQueue.where('state').equals('failed').sortBy('id')).filter(
    (e): e is OutboxEntry & { id: number } => e.id !== undefined,
  );
  const groups = new Map<string, (OutboxEntry & { id: number })[]>();
  for (const entry of failed) {
    const key = `${entry.table}:${entry.recordId}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const out: FailedChange[] = [];
  for (const list of groups.values()) {
    const last = list[list.length - 1];
    const first = list[0];
    if (!last || !first) continue;
    const local = await localRecord(last.table, last.recordId);
    const label = labelOf(last.table, local ?? (last.op === 'upsert' ? last.payload : undefined));
    out.push({
      table: last.table,
      recordId: last.recordId,
      op: last.op,
      entryIds: list.map((e) => e.id),
      attempts: Math.max(...list.map((e) => e.attempts)),
      lastError: last.lastError ?? 'Unknown sync error',
      firstCreatedAt: first.createdAt,
      ...label,
    });
  }
  return out;
}

export async function retryFailed(table?: SyncTable, recordId?: string): Promise<number> {
  const now = Date.now();
  return db.transaction('rw', db.syncQueue, async () => {
    const failed = await db.syncQueue.where('state').equals('failed').toArray();
    const ids = failed
      .filter(
        (e) =>
          (table === undefined || e.table === table) &&
          (recordId === undefined || e.recordId === recordId),
      )
      .flatMap((e) => (e.id === undefined ? [] : [e.id]));
    await db.syncQueue.bulkUpdate(
      ids.map((key) => ({ key, changes: { state: 'pending' as const, nextAttemptAt: now } })),
    );
    return ids.length;
  });
}

export async function countOutbox(): Promise<number> {
  return db.syncQueue.count();
}
