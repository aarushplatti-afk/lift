import type { BodyweightEntry, Exercise, Settings, Template, Workout } from './domain';

export type SyncTable =
  'exercises' | 'workouts' | 'templates' | 'bodyweight_entries' | 'user_settings';

export interface SyncRecordMap {
  exercises: Exercise;
  workouts: Workout;
  templates: Template;
  bodyweight_entries: BodyweightEntry;
  user_settings: Settings;
}

export type DeletableTable = Exclude<SyncTable, 'user_settings'>;

export type OutboxEntry = {
  id?: number;
  table: SyncTable;
  recordId: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  lastErrorCode?: string;
  state: 'pending' | 'failed';
  nextAttemptAt: number;
} & ({ op: 'upsert'; payload: SyncRecordMap[SyncTable] } | { op: 'delete'; payload: null });

/** Keyset cursor (updated_at, id or user_id), kept as the server ISO string. */
export interface SyncState {
  table: SyncTable;
  lastPulledAt: string | null;
  lastPulledKey: string | null;
}

export interface SyncStatus {
  state: 'synced' | 'syncing' | 'offline' | 'error';
  pendingCount: number;
  failedCount: number;
  lastSyncedAt?: number;
  lastError?: string;
  oldestPendingAt?: number;
}
