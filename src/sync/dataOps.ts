import {
  assertNoActiveWorkout,
  clearUserDataLocal,
  DataOpBlockedError,
  readSnapshot,
  replaceAllLocal,
} from '../db/repos/dataOps';
import { getOwner } from '../db/repos/meta';
import { countOutbox, countOutboxByState } from '../db/repos/outbox';
import { DEFAULT_SETTINGS } from '../db/repos/settings';
import { buildBackup, remapForUser, type BackupCounts, type LiftBackup } from '../lib/backup';
import { toCsv } from '../lib/csv';
import { isQuotaError } from '../lib/platform/storage';
import { getSupabase, type LiftClient } from '../lib/supabase';
import { APP_VERSION } from '../lib/version';
import { createAuthRetry } from './authRetry';
import { getSyncEngine, type SyncEngine } from './engine';
import { SyncRequestError } from './retry';
import { TIMED_OUT, withTimeout } from './timeout';

const EXPORT_SYNC_CAP_MS = 10_000;
const TOMBSTONE_TIMEOUT_MS = 15_000;
const DELETE_CONFIRM_TEXT = 'DELETE';
const TOMBSTONE_TABLES = ['workouts', 'templates', 'bodyweight_entries', 'exercises'] as const;

export type DataOpError =
  | 'offline'
  | 'active_workout'
  | 'unsynced_changes'
  | 'sync_failed'
  | 'not_signed_in'
  | 'storage_full'
  | 'server_error'
  | 'confirm_mismatch';

export type DataOpResult<T> =
  ({ ok: true } & T) | { ok: false; error: DataOpError; message: string };

export interface DataOps {
  exportBackup(): Promise<{ backup: LiftBackup; synced: boolean }>;
  exportCsv(): Promise<string>;
  importReplace(
    backup: LiftBackup,
  ): Promise<DataOpResult<{ counts: BackupCounts; failed: number; pending: number }>>;
  deleteAllData(confirmText: string): Promise<DataOpResult<{ failed: number }>>;
}

interface WriteResult {
  error: { message: string; code?: string } | null;
  status?: number;
}

interface LooseTable {
  update(values: { deleted_at: string }): {
    eq(col: string, value: string): { is(col: string, value: null): PromiseLike<WriteResult> };
  };
  upsert(row: unknown, opts: { onConflict: string }): PromiseLike<WriteResult>;
}

const MESSAGES: Record<DataOpError, string> = {
  offline: 'Connect to the internet to do this.',
  active_workout: 'Finish or discard your current workout first.',
  unsynced_changes: 'Sync or discard pending changes in Account & Sync, then try again.',
  sync_failed: "Couldn't complete the operation. Nothing was changed.",
  not_signed_in: 'Sign in first.',
  storage_full: 'Not enough storage on this device. Nothing was changed.',
  server_error: "Couldn't delete everything. Check your connection and try again.",
  confirm_mismatch: 'Type DELETE to confirm.',
};

function failure(error: DataOpError): { ok: false; error: DataOpError; message: string } {
  return { ok: false, error, message: MESSAGES[error] };
}

async function assertWrite(result: PromiseLike<WriteResult>): Promise<void> {
  const settled = await withTimeout(Promise.resolve(result), TOMBSTONE_TIMEOUT_MS);
  if (settled === TIMED_OUT) throw new SyncRequestError('Request timed out');
  const { error, status } = settled;
  if (error) throw new SyncRequestError(error.message, status, error.code);
}

export function createDataOps(deps: {
  client: LiftClient;
  engine: SyncEngine;
  isOnline: () => boolean;
  now: () => number;
}): DataOps {
  const { client, engine, isOnline, now } = deps;

  async function blockedBy(): Promise<DataOpError | undefined> {
    if (!isOnline()) return 'offline';
    try {
      await assertNoActiveWorkout();
    } catch (err) {
      if (err instanceof DataOpBlockedError) return err.reason;
      throw err;
    }
    return undefined;
  }

  async function tombstoneServer(userId: string): Promise<void> {
    const authRetry = createAuthRetry(client);
    const stamp = new Date(now()).toISOString();
    for (const name of TOMBSTONE_TABLES) {
      const table = client.from(name) as unknown as LooseTable;
      await authRetry(() =>
        assertWrite(
          table.update({ deleted_at: stamp }).eq('user_id', userId).is('deleted_at', null),
        ),
      );
    }
    const settings = client.from('user_settings') as unknown as LooseTable;
    await authRetry(() =>
      assertWrite(
        settings.upsert({ user_id: userId, data: DEFAULT_SETTINGS }, { onConflict: 'user_id' }),
      ),
    );
  }

  return {
    async exportBackup() {
      let synced = false;
      if (isOnline()) {
        try {
          const outcome = await withTimeout(engine.syncNow('manual'), EXPORT_SYNC_CAP_MS);
          synced = outcome !== TIMED_OUT && (await countOutbox()) === 0;
        } catch {
          synced = false;
        }
      }
      const { userId, ...data } = await readSnapshot();
      const backup = buildBackup(data, { userId, exportedAt: now(), appVersion: APP_VERSION });
      return { backup, synced };
    },

    async exportCsv() {
      const snapshot = await readSnapshot();
      const byId = new Map(snapshot.exercises.map((e) => [e.id, e]));
      return toCsv(snapshot.workouts, byId, snapshot.settings.unit);
    },

    async importReplace(backup) {
      const owner = await getOwner();
      if (!owner) return failure('not_signed_in');
      const remapped = remapForUser(backup, owner.userId);
      const blocked = await blockedBy();
      if (blocked) return failure(blocked);
      try {
        await engine.syncNow('manual');
        if ((await countOutbox()) > 0) return failure('unsynced_changes');
        const counts = await engine.runExclusive(() =>
          replaceAllLocal(remapped, owner.userId, now()),
        );
        await engine.syncNow('manual');
        const left = await countOutboxByState();
        return {
          ok: true,
          counts: {
            exercises: counts.exercises,
            customExercises: counts.customExercises,
            workouts: counts.workouts,
            templates: counts.templates,
            bodyweight: counts.bodyweight,
          },
          failed: left.failed,
          pending: left.pending,
        };
      } catch (err) {
        if (err instanceof DataOpBlockedError) return failure(err.reason);
        if (isQuotaError(err)) return failure('storage_full');
        return failure('sync_failed');
      }
    },

    async deleteAllData(confirmText) {
      if (confirmText !== DELETE_CONFIRM_TEXT) return failure('confirm_mismatch');
      const owner = await getOwner();
      if (!owner) return failure('not_signed_in');
      const blocked = await blockedBy();
      if (blocked) return failure(blocked);
      try {
        await engine.runExclusive(async () => {
          await assertNoActiveWorkout();
          try {
            await tombstoneServer(owner.userId);
          } catch {
            throw new ServerDeleteError();
          }
          await clearUserDataLocal(owner.userId);
        });
      } catch (err) {
        if (err instanceof ServerDeleteError) return failure('server_error');
        if (err instanceof DataOpBlockedError) return failure(err.reason);
        return failure('sync_failed');
      }
      await engine.syncNow('manual');
      const left = await countOutboxByState();
      return { ok: true, failed: left.failed };
    },
  };
}

class ServerDeleteError extends Error {}

let singleton: DataOps | undefined;

export function getDataOps(): DataOps {
  singleton ??= createDataOps({
    client: getSupabase(),
    engine: getSyncEngine(),
    isOnline: () => navigator.onLine,
    now: () => Date.now(),
  });
  return singleton;
}
