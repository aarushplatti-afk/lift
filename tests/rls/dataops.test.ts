import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/types/database';

type Client = ReturnType<typeof createClient<Database>>;
type TableName = 'exercises' | 'workouts' | 'templates' | 'bodyweight_entries';
type Row = Record<string, unknown>;

interface Failure {
  code?: string;
  message: string;
}
interface Result {
  data: Row[] | null;
  error: Failure | null;
}
interface LooseTable {
  insert(row: Row): { select(): PromiseLike<Result> };
  select(): { eq(column: string, value: string): PromiseLike<Result> };
  update(patch: Row): {
    eq(
      column: string,
      value: string,
    ): {
      is(column: string, value: null): { select(): PromiseLike<Result> };
    };
  };
  delete(): { eq(column: string, value: string): { select(): PromiseLike<Result> } };
}

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_TEST_URL / SUPABASE_TEST_KEY missing. Run via `npm run test:rls`.');
}
const host = new URL(url).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error(`Refusing to run RLS tests against non-local host: ${host}`);
}

interface TestUser {
  client: Client;
  userId: string;
}

async function signUp(label: string): Promise<TestUser> {
  const client = createClient<Database>(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signUp({
    email: `rls-dataops-${label}-${randomUUID()}@example.test`,
    password: `pw-${randomUUID()}`,
  });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.user || !data.session) {
    throw new Error('signUp returned no session; email confirmations must be disabled locally.');
  }
  return { client, userId: data.user.id };
}

function table(client: Client, name: TableName): LooseTable {
  return client.from(name) as unknown as LooseTable;
}

const builders: Record<TableName, (userId: string) => Row> = {
  exercises: (userId) => ({
    id: randomUUID(),
    user_id: userId,
    name: `Ex ${randomUUID()}`,
    muscle_group: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
  }),
  workouts: (userId) => ({
    id: randomUUID(),
    user_id: userId,
    name: 'Push',
    started_at: '2026-01-01T10:00:00Z',
    status: 'completed',
    exercises: [],
  }),
  templates: (userId) => ({ id: randomUUID(), user_id: userId, name: 'T', exercises: [] }),
  bodyweight_entries: (userId) => ({
    id: randomUUID(),
    user_id: userId,
    entry_date: '2026-01-01',
    weight_kg: 80,
  }),
};

const names = Object.keys(builders) as TableName[];

let a: TestUser;
let b: TestUser;

async function seed(user: TestUser): Promise<void> {
  for (const name of names) {
    const res = await table(user.client, name).insert(builders[name](user.userId)).select();
    expect(res.error).toBeNull();
  }
}

function bulkTombstone(user: TestUser, name: TableName, target: string) {
  return table(user.client, name)
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', target)
    .is('deleted_at', null)
    .select();
}

beforeAll(async () => {
  a = await signUp('a');
  b = await signUp('b');
  await seed(a);
  await seed(b);
});

afterAll(async () => {
  for (const user of [a, b]) {
    if (!user) continue;
    for (const name of names) {
      await table(user.client, name).delete().eq('user_id', user.userId).select();
    }
  }
});

describe.each(names)('bulk tombstone on %s', (name) => {
  it('affects 0 rows when B targets A user_id', async () => {
    const res = await bulkTombstone(b, name, a.userId);
    expect(res.error).toBeNull();
    expect(res.data ?? []).toHaveLength(0);
    const reread = await table(a.client, name).select().eq('user_id', a.userId);
    expect(reread.data?.every((r) => r.deleted_at === null)).toBe(true);
    expect(reread.data?.length).toBeGreaterThan(0);
  });

  it('tombstones only the rows of A when A runs it, leaving B intact', async () => {
    const res = await bulkTombstone(a, name, a.userId);
    expect(res.error).toBeNull();
    expect(res.data?.length).toBeGreaterThan(0);
    expect(res.data?.every((r) => r.user_id === a.userId && r.deleted_at !== null)).toBe(true);

    const bRows = await table(b.client, name).select().eq('user_id', b.userId);
    expect(bRows.data?.length).toBeGreaterThan(0);
    expect(bRows.data?.every((r) => r.deleted_at === null)).toBe(true);
  });

  it('is idempotent: a second run touches no rows', async () => {
    const res = await bulkTombstone(a, name, a.userId);
    expect(res.error).toBeNull();
    expect(res.data ?? []).toHaveLength(0);
  });
});
