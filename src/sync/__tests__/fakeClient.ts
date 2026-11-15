import type { LiftClient } from '../../lib/supabase';
import type { Exercise } from '../../types/domain';
import type { SyncTable } from '../../types/sync';

export type Row = Record<string, unknown> & { updated_at: string; user_id: string };

interface Result {
  data: Row[] | null;
  error: { message: string; code?: string } | null;
  status?: number;
}

export interface FailSpec {
  message: string;
  code?: string;
  status?: number;
}

const KEYSET = /^updated_at\.gt\."([^"]*)",and\(updated_at\.eq\."([^"]*)",(\w+)\.gt\."([^"]*)"\)$/;

export class FakeServer {
  tables: Record<SyncTable, Row[]> = {
    exercises: [],
    workouts: [],
    templates: [],
    bodyweight_entries: [],
    user_settings: [],
  };
  clock = '2026-01-01T00:00:00.000000+00:00';
  networkDown = false;
  failWhen: ((table: SyncTable, rows: Row[]) => string | FailSpec | null) | undefined;
  failUpdate: FailSpec | undefined;
  upsertCalls: { table: SyncTable; rows: Row[]; onConflict: string }[] = [];
  updateCalls: { table: SyncTable; values: Record<string, unknown>; ids: string[] }[] = [];
  bulkCalls: { table: SyncTable; userId: string }[] = [];
  failBulkWhen: ((table: SyncTable) => boolean) | undefined;
  selectCalls: { table: SyncTable; filter: string | undefined }[] = [];
  session: { user: { id: string } } | null = { user: { id: 'u1' } };
  onUpsert: (() => Promise<void>) | undefined;
  enforceExerciseNameUnique = false;
  tokenValid = true;
  refreshMode: 'ok' | 'rejected' | 'network' = 'ok';
  refreshCalls = 0;

  keyOf(table: SyncTable): 'id' | 'user_id' {
    return table === 'user_settings' ? 'user_id' : 'id';
  }

  seed(table: SyncTable, rows: Row[]): void {
    this.tables[table].push(...rows);
  }

  private fail(): Result | undefined {
    if (this.networkDown) {
      return { data: null, error: { message: 'TypeError: Failed to fetch' } };
    }
    if (!this.tokenValid) {
      return { data: null, error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 };
    }
    return undefined;
  }

  refresh(): {
    data: { session: object | null };
    error: { message: string; status?: number } | null;
  } {
    this.refreshCalls += 1;
    if (this.refreshMode === 'network') throw new TypeError('Failed to fetch');
    if (this.refreshMode === 'rejected') {
      return {
        data: { session: null },
        error: { message: 'Invalid Refresh Token: Already Used', status: 400 },
      };
    }
    this.tokenValid = true;
    return { data: { session: { user: { id: 'u1' } } }, error: null };
  }

  private nameConflicts(row: Row): boolean {
    const live = (r: Row): boolean => !r.archived && (r.deleted_at ?? null) === null;
    if (!live(row)) return false;
    const key = String(row.name).toLowerCase();
    return this.tables.exercises.some(
      (r) =>
        r.id !== row.id &&
        r.user_id === row.user_id &&
        live(r) &&
        String(r.name).toLowerCase() === key,
    );
  }

  upsert(table: SyncTable, rows: Row[], onConflict: string): Result {
    this.upsertCalls.push({ table, rows, onConflict });
    const down = this.fail();
    if (down) return down;
    const spec = this.failWhen?.(table, rows);
    if (spec) {
      const { message, code, status } = typeof spec === 'string' ? { message: spec } : spec;
      return {
        data: null,
        error: code ? { message, code } : { message },
        ...(status === undefined ? {} : { status }),
      };
    }
    if (
      table === 'exercises' &&
      this.enforceExerciseNameUnique &&
      rows.some((row) => this.nameConflicts(row))
    ) {
      return {
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "exercises_user_name_uniq"',
        },
      };
    }
    for (const row of rows) {
      const stored: Row = { ...row, updated_at: this.clock };
      const idx = this.tables[table].findIndex((r) => r[onConflict] === row[onConflict]);
      if (idx >= 0) this.tables[table][idx] = { ...this.tables[table][idx], ...stored };
      else this.tables[table].push(stored);
    }
    return { data: null, error: null };
  }

  update(table: SyncTable, values: Record<string, unknown>, ids: string[]): Result {
    this.updateCalls.push({ table, values, ids });
    const down = this.fail();
    if (down) return down;
    if (this.failUpdate) {
      const { message, code, status } = this.failUpdate;
      return {
        data: null,
        error: code ? { message, code } : { message },
        ...(status === undefined ? {} : { status }),
      };
    }
    for (const row of this.tables[table]) {
      if (ids.includes(String(row.id))) Object.assign(row, values, { updated_at: this.clock });
    }
    return { data: null, error: null };
  }

  bulkTombstone(table: SyncTable, userId: string, values: Record<string, unknown>): Result {
    this.bulkCalls.push({ table, userId });
    const down = this.fail();
    if (down) return down;
    if (this.failBulkWhen?.(table)) {
      return { data: null, error: { message: 'boom', code: 'XX000' }, status: 500 };
    }
    for (const row of this.tables[table]) {
      if (row.user_id === userId && (row.deleted_at ?? null) === null) {
        Object.assign(row, values, { updated_at: this.clock });
      }
    }
    return { data: null, error: null };
  }

  select(table: SyncTable, userId: string, filter: string | undefined, limit: number): Result {
    this.selectCalls.push({ table, filter });
    const down = this.fail();
    if (down) return down;
    const keyCol = this.keyOf(table);
    let rows = this.tables[table].filter((r) => r.user_id === userId);
    if (filter) {
      const m = KEYSET.exec(filter);
      if (!m) return { data: null, error: { message: `unparseable filter ${filter}` } };
      const [, gt, eq, col, key] = m;
      if (col !== keyCol) return { data: null, error: { message: 'wrong key column' } };
      rows = rows.filter(
        (r) =>
          r.updated_at > String(gt) || (r.updated_at === eq && String(r[keyCol]) > String(key)),
      );
    }
    rows = [...rows].sort((a, b) =>
      a.updated_at === b.updated_at
        ? String(a[keyCol]).localeCompare(String(b[keyCol]))
        : a.updated_at.localeCompare(b.updated_at),
    );
    return { data: rows.slice(0, limit), error: null };
  }
}

class Query implements PromiseLike<Result> {
  private userId = '';
  private filter: string | undefined;
  private max = Infinity;

  constructor(
    private server: FakeServer,
    private table: SyncTable,
  ) {}

  eq(_col: string, value: string): this {
    this.userId = value;
    return this;
  }

  or(filter: string): this {
    this.filter = filter;
    return this;
  }

  order(): this {
    return this;
  }

  limit(n: number): this {
    this.max = n;
    return this;
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.server.select(this.table, this.userId, this.filter, this.max)).then(
      onfulfilled,
      onrejected,
    );
  }
}

export function createFakeClient(server: FakeServer): LiftClient {
  const client = {
    from(table: SyncTable) {
      return {
        async upsert(input: Row | Row[], opts: { onConflict: string }) {
          if (server.onUpsert) await server.onUpsert();
          return server.upsert(table, Array.isArray(input) ? input : [input], opts.onConflict);
        },
        update(values: Record<string, unknown>) {
          return {
            in: (_col: string, ids: string[]) => Promise.resolve(server.update(table, values, ids)),
            eq: (_col: string, userId: string) => ({
              is: () => Promise.resolve(server.bulkTombstone(table, userId, values)),
            }),
          };
        },
        select: () => new Query(server, table),
      };
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: server.session }, error: null }),
      refreshSession: async () => server.refresh(),
    },
  };
  return client as unknown as LiftClient;
}

export function exerciseRecord(id: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id,
    userId: 'u1',
    name: `Ex ${id}`,
    muscleGroup: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
    isCustom: true,
    archived: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  };
}

export function exerciseRow(id: string, updatedAt: string, over: Partial<Row> = {}): Row {
  return {
    id,
    user_id: 'u1',
    name: `Ex ${id}`,
    muscle_group: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
    is_custom: true,
    archived: false,
    notes: null,
    created_at: '2026-01-01T00:00:00.000000+00:00',
    updated_at: updatedAt,
    deleted_at: null,
    ...over,
  };
}
