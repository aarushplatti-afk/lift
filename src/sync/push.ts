import { listDue, recordFailure, removeEntries } from '../db/repos/outbox';
import type { LiftClient } from '../lib/supabase';
import { batchRuns, coalesce, type PushOp } from './coalesce';
import { toRow } from './mappers';

interface WriteResult {
  error: { message: string } | null;
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
    throw new Error(result.error.message);
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown sync error';
}

export async function pushOutbox(
  client: LiftClient,
  opts: { now: number; force: boolean },
): Promise<{ pushed: number; failed: number; offline: boolean }> {
  const entries = await listDue(opts.now, opts.force);
  const runs = batchRuns(coalesce(entries));
  let pushed = 0;
  let failed = 0;
  try {
    for (const run of runs) {
      try {
        await sendRun(client, run, opts.now);
        await removeEntries(run.flatMap((o) => o.entryIds));
        pushed += run.length;
        continue;
      } catch (err) {
        if (err instanceof OfflineError) throw err;
        if (run.length === 1) {
          await recordFailure(
            run.flatMap((o) => o.entryIds),
            describe(err),
            opts.now,
          );
          failed += 1;
          continue;
        }
      }
      for (const op of run) {
        try {
          await sendRun(client, [op], opts.now);
          await removeEntries(op.entryIds);
          pushed += 1;
        } catch (err) {
          if (err instanceof OfflineError) throw err;
          await recordFailure(op.entryIds, describe(err), opts.now);
          failed += 1;
        }
      }
    }
  } catch (err) {
    if (err instanceof OfflineError) return { pushed, failed, offline: true };
    throw err;
  }
  return { pushed, failed, offline: false };
}
