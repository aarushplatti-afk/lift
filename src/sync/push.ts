import { listDue, recordFailure, removeEntries } from '../db/repos/outbox';
import type { LiftClient } from '../lib/supabase';
import { AuthExpiredError } from './authRetry';
import { batchRuns, coalesce, type PushOp } from './coalesce';
import { toRow } from './mappers';
import { classifyError, describeSyncError, nextDelay, SyncRequestError } from './retry';

interface WriteResult {
  error: { message: string; code?: string } | null;
  status?: number;
}

interface LooseTable {
  upsert(rows: unknown[], opts: { onConflict: string }): PromiseLike<WriteResult>;
  update(values: { deleted_at: string }): {
    in(col: string, ids: string[]): PromiseLike<WriteResult>;
  };
}

const NETWORK_PATTERN = /failed to fetch|networkerror|load failed|network request failed/i;

export class OfflineError extends Error {}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return NETWORK_PATTERN.test(message);
}

async function sendRun(client: LiftClient, run: PushOp[], now: number): Promise<void> {
  const head = run[0];
  if (!head) return;
  const table = client.from(head.table) as unknown as LooseTable;
  let result: WriteResult;
  try {
    if (head.op === 'upsert') {
      const rows = run.map((o) => toRow(o.table, o.payload as never));
      const onConflict = head.table === 'user_settings' ? 'user_id' : 'id';
      result = await table.upsert(rows, { onConflict });
    } else {
      result = await table.update({ deleted_at: new Date(now).toISOString() }).in(
        'id',
        run.map((o) => o.recordId),
      );
    }
  } catch (err) {
    if (isNetworkError(err)) throw new OfflineError('offline');
    throw err;
  }
  if (result.error) {
    if (isNetworkError(result.error.message)) throw new OfflineError('offline');
    throw new SyncRequestError(result.error.message, result.status, result.error.code);
  }
}

function entryIdsOf(run: PushOp[]): number[] {
  return run.flatMap((o) => o.entryIds);
}

function maxAttempts(run: PushOp[]): number {
  return Math.max(0, ...run.map((o) => o.attempts));
}

export async function pushOutbox(
  client: LiftClient,
  opts: {
    now: number;
    force: boolean;
    authRetry: <T>(fn: () => Promise<T>) => Promise<T>;
  },
): Promise<{ pushed: number; failed: number; offline: boolean; authExpired: boolean }> {
  const entries = await listDue(opts.now, opts.force);
  const runs = batchRuns(coalesce(entries));
  let pushed = 0;
  let failed = 0;

  const send = (run: PushOp[]): Promise<void> =>
    opts.authRetry(() => sendRun(client, run, opts.now));

  async function fail(run: PushOp[], err: unknown): Promise<'retryable' | 'permanent'> {
    const kind = classifyError(err, maxAttempts(run));
    const code = err instanceof SyncRequestError ? err.code : undefined;
    await recordFailure(
      entryIdsOf(run),
      describeSyncError(err),
      code,
      kind === 'retryable'
        ? { kind, nextAttemptAt: (attempts) => opts.now + nextDelay(attempts) }
        : { kind },
    );
    failed += run.length;
    return kind;
  }

  try {
    runLoop: for (const run of runs) {
      try {
        await send(run);
        await removeEntries(entryIdsOf(run));
        pushed += run.length;
        continue;
      } catch (err) {
        if (isStop(err)) throw err;
        if (run.length === 1) {
          if ((await fail(run, err)) === 'retryable') break runLoop;
          continue;
        }
        const duplicate = err instanceof SyncRequestError && err.code === '23505';
        if (!duplicate && classifyError(err, maxAttempts(run)) === 'retryable') {
          await fail(run, err);
          break runLoop;
        }
      }
      for (const op of run) {
        try {
          await send([op]);
          await removeEntries(op.entryIds);
          pushed += 1;
        } catch (err) {
          if (isStop(err)) throw err;
          if ((await fail([op], err)) === 'retryable') break runLoop;
        }
      }
    }
  } catch (err) {
    if (err instanceof OfflineError) return { pushed, failed, offline: true, authExpired: false };
    if (err instanceof AuthExpiredError) {
      return { pushed, failed, offline: false, authExpired: true };
    }
    throw err;
  }
  return { pushed, failed, offline: false, authExpired: false };
}

function isStop(err: unknown): boolean {
  return err instanceof OfflineError || err instanceof AuthExpiredError;
}
