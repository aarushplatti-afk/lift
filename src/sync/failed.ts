import { discardAndApply } from '../db/repos/syncApply';
import { getOwner } from '../db/repos/meta';
import type { LiftClient } from '../lib/supabase';
import type { Tables } from '../types/database';
import type { SyncTable } from '../types/sync';
import { createAuthRetry } from './authRetry';
import { fromRow } from './mappers';
import { isNetworkError, OfflineError } from './push';
import { SyncRequestError } from './retry';
import { TIMED_OUT, withTimeout } from './timeout';

const DISCARD_FETCH_TIMEOUT_MS = 15_000;

interface FetchResult {
  data: object | null;
  error: { message: string; code?: string } | null;
  status?: number;
}

interface LooseFetch {
  select(cols: string): {
    eq(col: string, value: string): { maybeSingle(): PromiseLike<FetchResult> };
  };
}

export async function discardFailedChange(
  client: LiftClient,
  table: SyncTable,
  recordId: string,
): Promise<{ ok: boolean }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false };
  const owner = await getOwner();
  if (!owner) return { ok: false };
  const keyCol = table === 'user_settings' ? 'user_id' : 'id';
  const key = table === 'user_settings' ? owner.userId : recordId;
  const authRetry = createAuthRetry(client);
  try {
    const result = await authRetry(async () => {
      const res = await withTimeout(
        Promise.resolve(
          (client.from(table) as unknown as LooseFetch).select('*').eq(keyCol, key).maybeSingle(),
        ),
        DISCARD_FETCH_TIMEOUT_MS,
      );
      if (res === TIMED_OUT) throw new OfflineError('timeout');
      if (res.error) {
        if (isNetworkError(res.error.message)) throw new OfflineError('offline');
        throw new SyncRequestError(res.error.message, res.status, res.error.code);
      }
      return res;
    });
    const item = result.data ? fromRow(table, result.data as Tables<typeof table>) : null;
    await discardAndApply(table, recordId, item as never, owner.userId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
