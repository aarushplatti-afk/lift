import { create } from 'zustand';
import { retryFailed as retryFailedEntries, listFailedChanges } from '../db/repos/outbox';
import { getSyncEngine, type SyncEngine } from '../sync/engine';
import { discardFailedChange } from '../sync/failed';
import { getSupabase } from '../lib/supabase';
import type { SyncStatus, SyncTable } from '../types/sync';

interface SyncState {
  status: SyncStatus;
  syncNow: () => Promise<void>;
  retryFailed: (table?: SyncTable, recordId?: string) => Promise<void>;
  discardFailed: (table: SyncTable, recordId: string) => Promise<boolean>;
  discardAllFailed: () => Promise<boolean>;
}

export const useSyncStore = create<SyncState>(() => ({
  status: { state: 'synced', pendingCount: 0, failedCount: 0 },
  syncNow: () => getSyncEngine().syncNow('manual'),
  retryFailed: async (table, recordId) => {
    await retryFailedEntries(table, recordId);
    await getSyncEngine().syncNow('manual');
  },
  discardFailed: async (table, recordId) => {
    const result = await getSyncEngine().runExclusive(() =>
      discardFailedChange(getSupabase(), table, recordId),
    );
    return result.ok;
  },
  discardAllFailed: async () => {
    const failed = await listFailedChanges();
    const results = await getSyncEngine().runExclusive(async () => {
      const out: boolean[] = [];
      for (const change of failed) {
        out.push((await discardFailedChange(getSupabase(), change.table, change.recordId)).ok);
      }
      return out;
    });
    return results.every(Boolean);
  },
}));

export function initSyncStore(engine: SyncEngine = getSyncEngine()): () => void {
  useSyncStore.setState({ status: engine.getStatus() });
  return engine.subscribe((status) => useSyncStore.setState({ status }));
}

export function useSyncStatus(): SyncStatus {
  return useSyncStore((s) => s.status);
}
