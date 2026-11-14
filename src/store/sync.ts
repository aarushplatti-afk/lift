import { create } from 'zustand';
import { getSyncEngine, type SyncEngine } from '../sync/engine';
import type { SyncStatus } from '../types/sync';

interface SyncState {
  status: SyncStatus;
  syncNow: () => Promise<void>;
}

export const useSyncStore = create<SyncState>(() => ({
  status: { state: 'synced', pendingCount: 0, failedCount: 0 },
  syncNow: () => getSyncEngine().syncNow('manual'),
}));

export function initSyncStore(engine: SyncEngine = getSyncEngine()): () => void {
  useSyncStore.setState({ status: engine.getStatus() });
  return engine.subscribe((status) => useSyncStore.setState({ status }));
}

export function useSyncStatus(): SyncStatus {
  return useSyncStore((s) => s.status);
}
