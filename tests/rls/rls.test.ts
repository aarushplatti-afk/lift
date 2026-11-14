import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/types/database';

type Client = ReturnType<typeof createClient<Database>>;
type TableName = keyof Database['public']['Tables'];
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
  upsert(row: Row): { select(): PromiseLike<Result> };
  select(): { eq(column: string, value: string): PromiseLike<Result> };
  update(patch: Row): { eq(column: string, value: string): { select(): PromiseLike<Result> } };
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

function newClient(): Client {
  return createClient<Database>(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function table(client: Client, name: TableName): LooseTable {
  return client.from(name) as unknown as LooseTable;
}

interface TestUser {
  client: Client;
  userId: string;
}

async function signUp(label: string): Promise<TestUser> {
  const client = newClient();
  const { data, error } = await client.auth.signUp({
    email: `rls-${label}-${randomUUID()}@example.test`,
    password: `pw-${randomUUID()}`,
  });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.user || !data.session) {
    throw new Error('signUp returned no session; email confirmations must be disabled locally.');
  }
  return { client, userId: data.user.id };
}

interface TableSpec {
  name: TableName;
  keyColumn: 'id' | 'user_id';
  build(userId: string, id: string): Row;
  patch: Row;
  changedColumn: string;
}

const specs: TableSpec[] = [
  {
    name: 'exercises',
    keyColumn: 'id',
    build: (userId, id) => ({
      id,
      user_id: userId,
      name: `Ex ${id}`,
      muscle_group: 'chest',
      equipment: 'barbell',
      type: 'weight_reps',
    }),
    patch: { notes: 'hijacked' },
    changedColumn: 'notes',
  },
  {
    name: 'workouts',
    keyColumn: 'id',
    build: (userId, id) => ({
      id,
      user_id: userId,
      name: 'Push',
      started_at: '2026-01-01T10:00:00Z',
      status: 'in_progress',
      exercises: [],
    }),
    patch: { name: 'hijacked' },
    changedColumn: 'name',
  },
  {
    name: 'templates',
    keyColumn: 'id',
    build: (userId, id) => ({ id, user_id: userId, name: 'Template', exercises: [] }),
    patch: { name: 'hijacked' },
    changedColumn: 'name',
  },
  {
    name: 'bodyweight_entries',
    keyColumn: 'id',
    build: (userId, id) => ({
      id,
      user_id: userId,
      entry_date: '2026-01-01',
      weight_kg: 80,
    }),
    patch: { note: 'hijacked' },
    changedColumn: 'note',
  },
  {
    name: 'user_settings',
    keyColumn: 'user_id',
    build: (userId) => ({ user_id: userId, data: { unit: 'kg' } }),
    patch: { data: { unit: 'lb' } },
    changedColumn: 'data',
  },
];

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  a = await signUp('a');
  b = await signUp('b');
});

afterAll(async () => {
  for (const user of [a, b]) {
    if (!user) continue;
    for (const spec of specs) {
      await table(user.client, spec.name).delete().eq('user_id', user.userId).select();
    }
  }
});

describe.each(specs)('RLS on $name', (spec) => {
  const keyOf = (userId: string, id: string): string => (spec.keyColumn === 'id' ? id : userId);

  describe('owner access', () => {
    it('lets user A create, read, update and delete its own row', async () => {
      const id = randomUUID();
      const target = keyOf(a.userId, id);
      const t = table(a.client, spec.name);

      const created = await t.insert(spec.build(a.userId, id)).select();
      expect(created.error).toBeNull();
      expect(created.data).toHaveLength(1);

      const read = await t.select().eq(spec.keyColumn, target);
      expect(read.error).toBeNull();
      expect(read.data).toHaveLength(1);

      const updated = await t.update(spec.patch).eq(spec.keyColumn, target).select();
      expect(updated.error).toBeNull();
      expect(updated.data).toHaveLength(1);
      expect(updated.data?.[0]?.[spec.changedColumn]).toEqual(spec.patch[spec.changedColumn]);

      const deleted = await t.delete().eq(spec.keyColumn, target).select();
      expect(deleted.error).toBeNull();
      expect(deleted.data).toHaveLength(1);

      const after = await t.select().eq(spec.keyColumn, target);
      expect(after.data).toHaveLength(0);
    });
  });

  describe('cross-user isolation', () => {
    const id = randomUUID();
    let target: string;
    let original: Row;

    beforeAll(async () => {
      target = keyOf(a.userId, id);
      const created = await table(a.client, spec.name).insert(spec.build(a.userId, id)).select();
      expect(created.error).toBeNull();
      original = created.data?.[0] ?? {};
    });

    it('returns 0 rows when B selects A by key', async () => {
      const res = await table(b.client, spec.name).select().eq(spec.keyColumn, target);
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(0);
    });

    it('returns 0 rows when B selects by A user_id', async () => {
      const res = await table(b.client, spec.name).select().eq('user_id', a.userId);
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(0);
    });

    it('affects 0 rows when B updates A, and A sees the row unchanged', async () => {
      const res = await table(b.client, spec.name)
        .update(spec.patch)
        .eq(spec.keyColumn, target)
        .select();
      expect(res.data ?? []).toHaveLength(0);

      const reread = await table(a.client, spec.name).select().eq(spec.keyColumn, target);
      expect(reread.data).toHaveLength(1);
      expect(reread.data?.[0]).toEqual(original);
    });

    it('affects 0 rows when B deletes A, and A still has the row', async () => {
      const res = await table(b.client, spec.name).delete().eq(spec.keyColumn, target).select();
      expect(res.data ?? []).toHaveLength(0);

      const reread = await table(a.client, spec.name).select().eq(spec.keyColumn, target);
      expect(reread.data).toHaveLength(1);
    });

    it('rejects B inserting a row with user_id = A (42501)', async () => {
      const res = await table(b.client, spec.name)
        .insert(spec.build(a.userId, randomUUID()))
        .select();
      expect(res.error?.code).toBe('42501');
      expect(res.data ?? []).toHaveLength(0);
    });

    it.skipIf(spec.keyColumn === 'user_id')('rejects B upserting onto A row (42501)', async () => {
      const res = await table(b.client, spec.name)
        .upsert({ ...spec.build(b.userId, id), ...spec.patch })
        .select();
      expect(res.error?.code).toBe('42501');

      const reread = await table(a.client, spec.name).select().eq(spec.keyColumn, target);
      expect(reread.data?.[0]).toEqual(original);
    });

    it('rejects B upserting onto A row while claiming user_id = A (42501)', async () => {
      const res = await table(b.client, spec.name)
        .upsert({ ...spec.build(a.userId, id), ...spec.patch })
        .select();
      expect(res.error?.code).toBe('42501');

      const reread = await table(a.client, spec.name).select().eq(spec.keyColumn, target);
      expect(reread.data?.[0]).toEqual(original);
    });
  });

  describe('anonymous access', () => {
    it('cannot select', async () => {
      const anon = newClient();
      const res = await table(anon, spec.name).select().eq('user_id', a.userId);
      expect(res.error !== null || (res.data ?? []).length === 0).toBe(true);
    });

    it('cannot insert', async () => {
      const anon = newClient();
      const res = await table(anon, spec.name).insert(spec.build(a.userId, randomUUID())).select();
      expect(res.error).not.toBeNull();
      expect(res.data ?? []).toHaveLength(0);
    });
  });
});
