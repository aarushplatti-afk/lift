import { observeOutboxCounts } from '../db/repos/outbox';
import {
  getOwner,
  isInitialPullDone,
  OwnerChangedError,
  setInitialPullDone,
} from '../db/repos/meta';
import { getSupabase, type LiftClient } from '../lib/supabase';
import type { SyncStatus } from '../types/sync';
import { pullAll } from './pull';
import { isNetworkError, OfflineError, pushOutbox } from './push';

export type SyncReason = 'start' | 'visible' | 'online' | 'offline' | 'write' | 'signin' | 'manual';

export interface SyncEngine {
  syncNow(reason: SyncReason): Promise<void>;
  subscribe(cb: (s: SyncStatus) => void): () => void;
  getStatus(): SyncStatus;
}

interface EngineDeps {
  client: LiftClient;
  now: () => number;
  isOnline: () => boolean;
}

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  const { client, now, isOnline } = deps;
  let status: SyncStatus = { state: 'synced', pendingCount: 0, failedCount: 0 };
  const listeners = new Set<(s: SyncStatus) => void>();
  let countsSub: { unsubscribe(): void } | undefined;
  let running: Promise<void> | null = null;
  let rerun = false;
  let rerunForce = false;

  function setStatus(patch: Partial<SyncStatus>): void {
    status = { ...status, ...patch };
    for (const cb of listeners) cb(status);
  }

  function startCounts(): void {
    countsSub = observeOutboxCounts().subscribe({
      next: ({ pending, failed }) => setStatus({ pendingCount: pending, failedCount: failed }),
      error: () => undefined,
    });
  }

  async function runOnce(force: boolean): Promise<void> {
    if (!isOnline()) {
      setStatus({ state: 'offline' });
      return;
    }
    setStatus({ state: 'syncing', lastError: undefined });
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) {
        setStatus({ state: 'error', lastError: 'Not signed in' });
        return;
      }
      const owner = await getOwner();
      if (!owner || owner.userId !== data.session.user.id) {
        setStatus({ state: 'error', lastError: 'No local account for this session' });
        return;
      }
      const pushed = await pushOutbox(client, { now: now(), force });
      if (pushed.offline) {
        setStatus({ state: 'offline' });
        return;
      }
      await pullAll(client, owner.userId);
      if (!(await isInitialPullDone())) await setInitialPullDone(true);
      if (pushed.failed > 0) {
        setStatus({
          state: 'error',
          lastError: 'Some changes could not be synced and will be retried',
          lastSyncedAt: now(),
        });
      } else {
        setStatus({ state: 'synced', lastSyncedAt: now() });
      }
    } catch (err) {
      if (err instanceof OwnerChangedError) {
        setStatus({ state: 'synced' });
        return;
      }
      if (isNetworkError(err) || err instanceof OfflineError) {
        setStatus({ state: 'offline' });
        return;
      }
      setStatus({
        state: 'error',
        lastError: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  }

  function locked(fn: () => Promise<void>): Promise<void> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    return locks ? locks.request('lift-sync', fn) : fn();
  }

  async function loop(first: SyncReason): Promise<void> {
    let force = first === 'manual';
    do {
      rerun = false;
      await locked(() => runOnce(force));
      force = rerunForce;
      rerunForce = false;
    } while (rerun);
  }

  return {
    syncNow(reason) {
      if (running) {
        rerun = true;
        if (reason === 'manual') rerunForce = true;
        return running;
      }
      running = loop(reason).finally(() => {
        running = null;
      });
      return running;
    },
    subscribe(cb) {
      listeners.add(cb);
      if (!countsSub) startCounts();
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0) {
          countsSub?.unsubscribe();
          countsSub = undefined;
        }
      };
    },
    getStatus: () => status,
  };
}

let singleton: SyncEngine | undefined;

export function getSyncEngine(): SyncEngine {
  singleton ??= createSyncEngine({
    client: getSupabase(),
    now: () => Date.now(),
    isOnline: () => navigator.onLine,
  });
  return singleton;
}
