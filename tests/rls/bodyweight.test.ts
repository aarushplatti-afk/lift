import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/types/database';

type Client = ReturnType<typeof createClient<Database>>;

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_TEST_URL / SUPABASE_TEST_KEY missing. Run via `npm run test:rls`.');
}
const host = new URL(url).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error(`Refusing to run RLS tests against non-local host: ${host}`);
}

interface Row {
  id: string;
  entry_date: string;
  weight_kg: number;
  note: string | null;
  created_at: string;
  deleted_at: string | null;
}

function row(id: string, date: string, weightKg: number): Row {
  return {
    id,
    entry_date: date,
    weight_kg: Math.round(weightKg * 1000) / 1000,
    note: null,
    created_at: new Date().toISOString(),
    deleted_at: null,
  };
}

let client: Client;

beforeAll(async () => {
  client = createClient<Database>(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signUp({
    email: `rls-bw-${randomUUID()}@example.test`,
    password: `pw-${randomUUID()}`,
  });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.session) throw new Error('signUp returned no session; disable email confirmations.');
});

function insert(r: Row) {
  return client.from('bodyweight_entries').insert(r);
}

async function liveRows(date: string) {
  const { data, error } = await client
    .from('bodyweight_entries')
    .select('id')
    .eq('entry_date', date)
    .is('deleted_at', null);
  expect(error).toBeNull();
  return data ?? [];
}

function softDelete(id: string) {
  return client
    .from('bodyweight_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
}

describe('bodyweight_entries constraints', () => {
  it('upsert after soft-delete revives the same id as exactly one live row', async () => {
    const id = randomUUID();
    const date = '2030-01-01';
    expect((await insert(row(id, date, 80))).error).toBeNull();
    expect((await softDelete(id)).error).toBeNull();
    expect(await liveRows(date)).toHaveLength(0);

    const { error } = await client
      .from('bodyweight_entries')
      .upsert([row(id, date, 81)], { onConflict: 'id' });
    expect(error).toBeNull();
    const live = await liveRows(date);
    expect(live).toHaveLength(1);
    expect(live[0]?.id).toBe(id);
  });

  it('rejects a second live entry for the same date with 23505', async () => {
    const date = '2030-01-02';
    expect((await insert(row(randomUUID(), date, 80))).error).toBeNull();
    const { error } = await insert(row(randomUUID(), date, 81));
    expect(error?.code).toBe('23505');
  });

  it('allows a new id for a date once the earlier entry is soft-deleted', async () => {
    const date = '2030-01-03';
    const x = randomUUID();
    expect((await insert(row(x, date, 80))).error).toBeNull();
    expect((await softDelete(x)).error).toBeNull();
    const y = randomUUID();
    expect((await insert(row(y, date, 82))).error).toBeNull();
    const live = await liveRows(date);
    expect(live.map((r) => r.id)).toEqual([y]);
  });

  it('rejects weight_kg 700 with 23514', async () => {
    const { error } = await insert(row(randomUUID(), '2030-01-04', 700));
    expect(error?.code).toBe('23514');
  });

  it('accepts weight_kg 699.999', async () => {
    const { error } = await insert(row(randomUUID(), '2030-01-05', 699.999));
    expect(error).toBeNull();
  });
});
