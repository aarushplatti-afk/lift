import { ensureSeeded } from '../db/seed';
import { listFailedChanges, nextDueAt, observeOutboxCounts } from '../db/repos/outbox';
import {
  getOwner,
  isInitialPullDone,
  OwnerChangedError,
  setInitialPullDone,
} from '../db/repos/meta';
import { getSupabase, type LiftClient } from '../lib/supabase';
import type { SyncStatus } from '../types/sync';
import { pullAll } from './pull';
import { AUTH_TIMEOUT_MS, TIMED_OUT, withTimeout } from './timeout';
import { AuthExpiredError, createAuthRetry } from './authRetry';
import { isNetworkError, OfflineError, pushOutbox } from './push';

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 300_000;
const SESSION_EXPIRED = 'Session expired. Sign in again to sync.';
const REJECTED_CHANGES = 'Some changes were rejected by the server. See Account & Sync.';

export type SyncReason =
  'start' | 'visible' | 'online' | 'offline' | 'write' | 'signin' | 'manual' | 'retry';

export interface SyncEngine {
  syncNow(reason: SyncReason): Promise<void>;
  subscribe(cb: (s: SyncStatus) => void): () => void;
  getStatus(): SyncStatus;
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
}

interface EngineDeps {
  client: LiftClient;
  now: () => number;
  isOnline: () => boolean;
  seed: (userId: string) => Promise<number>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  const { client, now, isOnline } = deps;
  let status: SyncStatus = { state: 'synced', pendingCount: 0, failedCount: 0 };
  const listeners = new Set<(s: SyncStatus) => void>();
  let countsSub: { unsubscribe(): void } | undefined;
  let running: Promise<void> | null = null;
  let rerun = false;
  let rerunForce = false;
  let retryTimer: unknown;
  let exclusiveCount = 0;
  let exclusiveTail: Promise<unknown> = Promise.resolve();
  let deferred = false;
  let deferredForce = false;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as number));

  function setStatus(patch: Partial<SyncStatus>): void {
    status = { ...status, ...patch };
    for (const cb of listeners) cb(status);
  }

  function startCounts(): void {
    countsSub = observeOutboxCounts().subscribe({
      next: ({ pending, failed, oldestCreatedAt }) => {
        const patch: Partial<SyncStatus> = {
          pendingCount: pending,
          failedCount: failed,
          oldestPendingAt: oldestCreatedAt,
        };
        if (failed > 0 && status.state === 'synced') {
          patch.state = 'error';
          patch.lastError = REJECTED_CHANGES;
        } else if (
          failed === 0 &&
          status.state === 'error' &&
          status.lastError === REJECTED_CHANGES
        ) {
          patch.state = 'synced';
          patch.lastError = undefined;
        }
        setStatus(patch);
      },
      error: () => undefined,
    });
  }

  async function runOnce(force: boolean): Promise<void> {
    if (!isOnline()) {
      setStatus({ state: 'offline' });
      return;
    }
    const previousState = status.state;
    setStatus({ state: 'syncing', lastError: undefined });
    try {
      const sessionResult = await withTimeout(client.auth.getSession(), AUTH_TIMEOUT_MS);
      if (sessionResult === TIMED_OUT) {
        setStatus({ state: 'offline' });
        return;
      }
      const { data, error } = sessionResult;
      if (error || !data.session) {
        setStatus({ state: 'error', lastError: 'Not signed in' });
        return;
      }
      const owner = await getOwner();
      if (!owner || owner.userId !== data.session.user.id) {
        setStatus({ state: 'error', lastError: 'No local account for this session' });
        return;
      }
      const authRetry = createAuthRetry(client);
      const sessionExpired = (): void => setStatus({ state: 'error', lastError: SESSION_EXPIRED });
      const pushed = await pushOutbox(client, { now: now(), force, authRetry });
      if (pushed.authExpired) {
        sessionExpired();
        return;
      }
      if (pushed.offline) {
        setStatus({ state: 'offline' });
        return;
      }
      await pullAll(client, owner.userId, undefined, authRetry);
      let seeded = 0;
      let seedError: string | undefined;
      try {
        seeded = await deps.seed(owner.userId);
      } catch (err) {
        if (err instanceof OwnerChangedError) throw err;
        seedError = `Couldn't add built-in exercises: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (!(await isInitialPullDone())) await setInitialPullDone(true);
      let failed = pushed.failed;
      if (seeded > 0) {
        const seedPush = await pushOutbox(client, { now: now(), force, authRetry });
        if (seedPush.authExpired) {
          sessionExpired();
          return;
        }
        if (seedPush.offline) {
          setStatus({ state: 'offline' });
          return;
        }
        failed += seedPush.failed;
      }
      if (seedError) {
        setStatus({ state: 'error', lastError: seedError, lastSyncedAt: now() });
      } else if ((await listFailedChanges()).length > 0) {
        setStatus({ state: 'error', lastError: REJECTED_CHANGES, lastSyncedAt: now() });
      } else if (failed > 0) {
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
        setStatus({ state: previousState });
        return;
      }
      if (err instanceof AuthExpiredError) {
        setStatus({ state: 'error', lastError: SESSION_EXPIRED });
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

  function locked<T>(fn: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    return locks ? (locks.request('lift-sync', fn) as Promise<T>) : fn();
  }

  function cancelRetry(): void {
    if (retryTimer === undefined) return;
    clearTimer(retryTimer);
    retryTimer = undefined;
  }

  async function scheduleRetry(): Promise<void> {
    if (!isOnline() || exclusiveCount > 0) return;
    if (status.state === 'offline' || status.lastError === SESSION_EXPIRED) return;
    const due = await nextDueAt();
    if (due === undefined || retryTimer !== undefined) return;
    const delay = Math.min(Math.max(due - now(), MIN_RETRY_MS), MAX_RETRY_MS);
    retryTimer = setTimer(() => {
      retryTimer = undefined;
      void engine.syncNow('retry');
    }, delay);
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

  function runDeferred(): void {
    if (exclusiveCount > 0 || !deferred) return;
    const force = deferredForce;
    deferred = false;
    deferredForce = false;
    void engine.syncNow(force ? 'manual' : 'write');
  }

  const engine: SyncEngine = {
    syncNow(reason) {
      if (exclusiveCount > 0) {
        deferred = true;
        if (reason === 'manual') deferredForce = true;
        return Promise.resolve();
      }
      if (running) {
        rerun = true;
        if (reason === 'manual') rerunForce = true;
        return running;
      }
      cancelRetry();
      const current: Promise<void> = loop(reason)
        .then(scheduleRetry)
        .finally(() => {
          if (running === current) running = null;
        });
      running = current;
      return current;
    },
    runExclusive<T>(fn: () => Promise<T>): Promise<T> {
      const previous = exclusiveTail;
      let release: () => void = () => undefined;
      exclusiveTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      exclusiveCount += 1;
      cancelRetry();
      return (async () => {
        try {
          await previous;
          while (running) await running;
          return await locked(fn);
        } finally {
          exclusiveCount -= 1;
          release();
          runDeferred();
        }
      })();
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
  return engine;
}

let singleton: SyncEngine | undefined;

export function getSyncEngine(): SyncEngine {
  singleton ??= createSyncEngine({
    client: getSupabase(),
    now: () => Date.now(),
    isOnline: () => navigator.onLine,
    seed: ensureSeeded,
  });
  return singleton;
}
