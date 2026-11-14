import { applyServerRecords, getCursor, setCursor } from '../db/repos/syncApply';
import type { LiftClient } from '../lib/supabase';
import type { Tables } from '../types/database';
import type { SyncTable } from '../types/sync';
import { fromRow } from './mappers';
import { isNetworkError, OfflineError } from './push';

interface PullRow {
  updated_at: string;
  id?: string;
  user_id: string;
}

interface PullQuery extends PromiseLike<{
  data: PullRow[] | null;
  error: { message: string } | null;
}> {
  eq(col: string, value: string): PullQuery;
  or(filter: string): PullQuery;
  order(col: string, opts: { ascending: boolean }): PullQuery;
  limit(n: number): PullQuery;
}

interface LooseSelect {
  select(cols: string): PullQuery;
}

const PULL_ORDER: readonly SyncTable[] = [
  'exercises',
  'templates',
  'workouts',
  'bodyweight_entries',
  'user_settings',
];

export function buildKeysetFilter(keyCol: string, at: string, key: string): string {
  return `updated_at.gt."${at}",and(updated_at.eq."${at}",${keyCol}.gt."${key}")`;
}

export async function pullTable(
  client: LiftClient,
  table: SyncTable,
  userId: string,
  pageSize = 500,
): Promise<number> {
  const keyCol = table === 'user_settings' ? 'user_id' : 'id';
  let total = 0;
  for (;;) {
    const cursor = await getCursor(table);
    let query = (client.from(table) as unknown as LooseSelect).select('*').eq('user_id', userId);
    if (cursor.at !== null && cursor.key !== null) {
      query = query.or(buildKeysetFilter(keyCol, cursor.at, cursor.key));
    }
    query = query
      .order('updated_at', { ascending: true })
      .order(keyCol, { ascending: true })
      .limit(pageSize);
    let result: Awaited<typeof query>;
    try {
      result = await query;
    } catch (err) {
      if (isNetworkError(err)) throw new OfflineError('offline');
      throw err;
    }
    if (result.error) {
      if (isNetworkError(result.error.message)) throw new OfflineError('offline');
      throw new Error(result.error.message);
    }
    const rows = result.data ?? [];
    if (rows.length === 0) break;
    const items = rows.map((row) => fromRow(table, row as unknown as Tables<typeof table>));
    await applyServerRecords(table, items as never, userId);
    const last = rows[rows.length - 1];
    if (!last) break;
    await setCursor(table, last.updated_at, String(last[keyCol]), userId);
    total += rows.length;
    if (rows.length < pageSize) break;
  }
  return total;
}

export async function pullAll(
  client: LiftClient,
  userId: string,
  onProgress?: (t: SyncTable) => void,
): Promise<number> {
  let total = 0;
  for (const table of PULL_ORDER) {
    total += await pullTable(client, table, userId);
    onProgress?.(table);
  }
  return total;
}
