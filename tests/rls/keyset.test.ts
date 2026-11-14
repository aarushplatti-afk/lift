import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildKeysetFilter } from '../../src/sync/pull';
import type { Database } from '../../src/types/database';

interface Row {
  id: string;
  updated_at: string;
}
interface Result {
  data: Row[] | null;
  error: { message: string } | null;
}
interface Query extends PromiseLike<Result> {
  or(filter: string): Query;
  order(col: string, opts: { ascending: boolean }): Query;
  limit(n: number): Query;
}
interface LooseExercises {
  insert(rows: Record<string, unknown>[]): PromiseLike<{ error: { message: string } | null }>;
  select(cols: string): Query;
}

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_TEST_URL / SUPABASE_TEST_KEY missing. Run via `npm run test:rls`.');
}
const host = new URL(url).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error(`Refusing to run keyset tests against non-local host: ${host}`);
}

const client = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const exercises = client.from('exercises') as unknown as LooseExercises;

function exerciseRow(id: string, userId: string): Record<string, unknown> {
  return {
    id,
    user_id: userId,
    name: `Keyset ${id}`,
    muscle_group: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
  };
}

function ordered(query: Query, pageSize: number): Query {
  return query
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(pageSize);
}

describe('keyset pull filter through PostgREST or()', () => {
  let rows: Row[] = [];

  beforeAll(async () => {
    const signUp = await client.auth.signUp({
      email: `keyset-${randomUUID()}@example.test`,
      password: `pw-${randomUUID()}`,
    });
    if (signUp.error || !signUp.data.user) throw new Error('signUp failed');
    const userId = signUp.data.user.id;
    const batch = Array.from({ length: 4 }, () => exerciseRow(randomUUID(), userId));
    const inserted = await exercises.insert(batch);
    if (inserted.error) throw new Error(inserted.error.message);
    for (let i = 0; i < 2; i += 1) {
      const more = await exercises.insert([exerciseRow(randomUUID(), userId)]);
      if (more.error) throw new Error(more.error.message);
    }
    const all = await ordered(exercises.select('id, updated_at'), 100);
    if (all.error) throw new Error(all.error.message);
    rows = all.data ?? [];
  });

  it('returns exactly the rows after each cursor, without error', async () => {
    expect(rows.length).toBe(6);
    expect(rows[0]?.updated_at).toMatch(/\+00:00$/);
    for (let i = 0; i < rows.length; i += 1) {
      const cursor = rows[i];
      if (!cursor) continue;
      const res = await ordered(
        exercises
          .select('id, updated_at')
          .or(buildKeysetFilter('id', cursor.updated_at, cursor.id)),
        100,
      );
      expect(res.error).toBeNull();
      expect((res.data ?? []).map((r) => r.id)).toEqual(rows.slice(i + 1).map((r) => r.id));
    }
  });

  it('resolves a tie on updated_at by id', async () => {
    const tieAt = rows[0]?.updated_at;
    const tied = rows.filter((r) => r.updated_at === tieAt);
    expect(tied.length).toBeGreaterThan(1);
    const first = tied[0];
    if (!first) throw new Error('no tied rows');
    const res = await ordered(
      exercises.select('id, updated_at').or(buildKeysetFilter('id', first.updated_at, first.id)),
      1,
    );
    expect(res.error).toBeNull();
    expect(res.data?.[0]?.id).toBe(rows[1]?.id);
  });

  it('paginates with limit without skipping or repeating rows', async () => {
    const seen: string[] = [];
    let cursor: Row | undefined;
    for (let page = 0; page < 10; page += 1) {
      let query = exercises.select('id, updated_at');
      if (cursor) query = query.or(buildKeysetFilter('id', cursor.updated_at, cursor.id));
      const res = await ordered(query, 2);
      expect(res.error).toBeNull();
      const data = res.data ?? [];
      if (data.length === 0) break;
      seen.push(...data.map((r) => r.id));
      cursor = data[data.length - 1];
    }
    expect(seen).toEqual(rows.map((r) => r.id));
  });
});
