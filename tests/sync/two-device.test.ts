/**
 * Two-device simulation against the local Supabase stack (M9 requirement 12).
 *
 * One real user (anon signUp). Each "device" is an independent module graph:
 * `vi.resetModules()` plus `vi.doMock` of src/db/schema replaces the singleton `db`
 * with a Dexie instance bound to a per-device fake-indexeddb database name, and the
 * graph is then imported dynamically. Repos, seed, sync engine and data ops therefore
 * bind to that device's database. Each device also has its own supabase-js client
 * (own session). Devices only talk through the server.
 */
import { randomUUID } from 'node:crypto';
import 'fake-indexeddb/auto';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { LiftBackup } from '../../src/lib/backup';
import type { Database } from '../../src/types/database';
import type { Workout } from '../../src/types/domain';

type Client = ReturnType<typeof createClient<Database>>;

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_TEST_URL / SUPABASE_TEST_KEY missing. Run via `npm run test:rls`.');
}
const host = new URL(url).hostname;
if (host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error(`Refusing to run sync tests against non-local host: ${host}`);
}

const BUILT_INS = 98;
const DAY = '2026-01-05';

function newClient(): Client {
  return createClient<Database>(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function loadGraph(dbName: string) {
  vi.resetModules();
  vi.doMock('../../src/db/schema', async () => {
    const actual =
      await vi.importActual<typeof import('../../src/db/schema')>('../../src/db/schema');
    return { ...actual, db: actual.createDb(dbName) };
  });
  const [
    schema,
    meta,
    exercises,
    bodyweight,
    settings,
    dataOpsRepo,
    seed,
    engine,
    ops,
    pull,
    auth,
  ] = await Promise.all([
    import('../../src/db/schema'),
    import('../../src/db/repos/meta'),
    import('../../src/db/repos/exercises'),
    import('../../src/db/repos/bodyweight'),
    import('../../src/db/repos/settings'),
    import('../../src/db/repos/dataOps'),
    import('../../src/db/seed'),
    import('../../src/sync/engine'),
    import('../../src/sync/dataOps'),
    import('../../src/sync/pull'),
    import('../../src/sync/authRetry'),
  ]);
  return {
    schema,
    meta,
    exercises,
    bodyweight,
    settings,
    dataOpsRepo,
    seed,
    engine,
    ops,
    pull,
    auth,
  };
}

type Graph = Awaited<ReturnType<typeof loadGraph>>;
type DataOpsApi = ReturnType<Graph['ops']['createDataOps']>;

interface Device {
  userId: string;
  g: Graph;
  sync(): Promise<void>;
  pullOnly(): Promise<number>;
  deleteAll: () => ReturnType<DataOpsApi['deleteAllData']>;
  importReplace: (b: LiftBackup) => ReturnType<DataOpsApi['importReplace']>;
  exportBackup(): Promise<LiftBackup>;
}

async function makeDevice(
  label: string,
  client: Client,
  userId: string,
  email: string,
): Promise<Device> {
  const g = await loadGraph(`lift-${label}-${randomUUID()}`);
  await g.meta.setOwner(userId, email);
  const engine = g.engine.createSyncEngine({
    client,
    now: () => Date.now(),
    isOnline: () => true,
    seed: g.seed.ensureSeeded,
  });
  const dataOps = g.ops.createDataOps({
    client,
    engine,
    isOnline: () => true,
    now: () => Date.now(),
  });
  return {
    userId,
    g,
    sync: () => engine.syncNow('manual'),
    pullOnly: () => g.pull.pullAll(client, userId, undefined, g.auth.createAuthRetry(client)),
    deleteAll: () => dataOps.deleteAllData('DELETE'),
    importReplace: (b) => dataOps.importReplace(b),
    exportBackup: async () => (await dataOps.exportBackup()).backup,
  };
}

interface Pair {
  a: Device;
  b: Device;
  verifier: Client;
}

async function makePair(): Promise<Pair> {
  const email = `sync-two-device-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const clientA = newClient();
  const { data, error } = await clientA.auth.signUp({ email, password });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.user || !data.session) {
    throw new Error('signUp returned no session; email confirmations must be disabled locally.');
  }
  const clientB = newClient();
  const signIn = await clientB.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn failed: ${signIn.error.message}`);
  const verifier = newClient();
  const v = await verifier.auth.signInWithPassword({ email, password });
  if (v.error) throw new Error(`signIn failed: ${v.error.message}`);
  const a = await makeDevice('a', clientA, data.user.id, email);
  const b = await makeDevice('b', clientB, data.user.id, email);
  return { a, b, verifier };
}

async function liveExercises(c: Client) {
  const { data, error } = await c
    .from('exercises')
    .select('id,name,notes,is_custom')
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return data;
}

async function liveBodyweight(c: Client) {
  const { data, error } = await c
    .from('bodyweight_entries')
    .select('id,entry_date,weight_kg')
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return data;
}

async function liveWorkouts(c: Client) {
  const { data, error } = await c.from('workouts').select('id').is('deleted_at', null);
  if (error) throw new Error(error.message);
  return data;
}

async function syncBoth(p: Pair): Promise<void> {
  await p.a.sync();
  await p.b.sync();
  await p.a.sync();
}

function pending(d: Device): Promise<number> {
  return d.g.schema.db.syncQueue.count();
}

beforeAll(() => {
  vi.stubGlobal('navigator', { onLine: true });
});

describe('two-device sync (one user, two Dexie databases)', () => {
  it('concurrent seeding converges with no duplicate exercises', async () => {
    const p = await makePair();
    await Promise.all([p.a.sync(), p.b.sync()]);
    await syncBoth(p);

    const server = await liveExercises(p.verifier);
    expect(server).toHaveLength(BUILT_INS);
    expect(new Set(server.map((e) => e.name.toLowerCase())).size).toBe(BUILT_INS);
    for (const d of [p.a, p.b]) {
      expect(await d.g.schema.db.exercises.count()).toBe(BUILT_INS);
      expect(await pending(d)).toBe(0);
    }
  });

  it('edits converge in both directions, including settings', async () => {
    const p = await makePair();
    await syncBoth(p);

    const created = await p.a.g.exercises.createExercise({
      name: 'Converge Curl',
      muscleGroup: 'biceps',
      equipment: 'dumbbell',
      type: 'weight_reps',
    });
    if (!created.ok) throw new Error('create failed');
    const id = created.exercise.id;
    await p.a.g.settings.updateSettings({ unit: 'kg' });
    await syncBoth(p);
    expect((await p.b.g.schema.db.exercises.get(id))?.name).toBe('Converge Curl');
    expect((await p.b.g.settings.getSettings()).unit).toBe('kg');

    const edited = await p.b.g.exercises.updateExercise(id, { notes: 'edited on B' });
    expect(edited.ok).toBe(true);
    await p.b.sync();
    await p.a.sync();
    expect((await p.a.g.schema.db.exercises.get(id))?.notes).toBe('edited on B');
    const row = (await liveExercises(p.verifier)).find((e) => e.id === id);
    expect(row?.notes).toBe('edited on B');
  });

  it('local pending edit wins through a pull, then converges after push', async () => {
    const p = await makePair();
    await syncBoth(p);
    const created = await p.a.g.exercises.createExercise({
      name: 'Pending Press',
      muscleGroup: 'chest',
      equipment: 'barbell',
      type: 'weight_reps',
    });
    if (!created.ok) throw new Error('create failed');
    const id = created.exercise.id;
    await syncBoth(p);

    await p.b.g.exercises.updateExercise(id, { notes: 'from B' });
    await p.a.g.exercises.updateExercise(id, { notes: 'from A' });
    await p.a.sync();

    await p.b.pullOnly();
    expect((await p.b.g.schema.db.exercises.get(id))?.notes).toBe('from B');
    expect(
      await p.b.g.schema.db.syncQueue.where('[table+recordId]').equals(['exercises', id]).count(),
    ).toBe(1);

    await p.b.sync();
    await p.a.sync();
    expect((await liveExercises(p.verifier)).find((e) => e.id === id)?.notes).toBe('from B');
    expect((await p.a.g.schema.db.exercises.get(id))?.notes).toBe('from B');
    expect(await pending(p.b)).toBe(0);
  });

  it('same-date bodyweight entry on both devices gives one server row', async () => {
    const p = await makePair();
    await syncBoth(p);
    await p.a.g.bodyweight.upsertForDate(DAY, 80);
    await p.b.g.bodyweight.upsertForDate(DAY, 81.5);
    await Promise.all([p.a.sync(), p.b.sync()]);
    await syncBoth(p);

    const server = await liveBodyweight(p.verifier);
    expect(server).toHaveLength(1);
    const weight = server[0]?.weight_kg;
    for (const d of [p.a, p.b]) {
      const local = await d.g.bodyweight.listEntries();
      expect(local).toHaveLength(1);
      expect(local[0]?.weightKg).toBe(weight);
    }
  });

  it('replaying the same upsert twice (lost ack) yields one row', async () => {
    const p = await makePair();
    await p.a.sync();
    await p.a.g.bodyweight.upsertForDate(DAY, 79);
    const entries = await p.a.g.schema.db.syncQueue.toArray();
    expect(entries).toHaveLength(1);
    await p.a.sync();
    await p.a.g.schema.db.syncQueue.bulkAdd(entries.map((entry) => ({ ...entry, id: undefined })));
    expect(await pending(p.a)).toBe(1);
    await p.a.sync();

    expect(await liveBodyweight(p.verifier)).toHaveLength(1);
    expect(await liveExercises(p.verifier)).toHaveLength(BUILT_INS);
    expect(await pending(p.a)).toBe(0);
  });

  it('importReplace on A converges on B', async () => {
    const p = await makePair();
    await syncBoth(p);
    const base = await p.a.exportBackup();
    const bench = base.exercises.find((e) => e.name === 'Bench Press') ?? base.exercises[0];
    if (!bench) throw new Error('no exercises');
    const now = Date.now();
    const workout: Workout = {
      id: randomUUID(),
      userId: p.a.userId,
      name: 'Imported Push',
      startedAt: now - 3_600_000,
      endedAt: now - 1_800_000,
      status: 'completed',
      createdAt: now - 3_600_000,
      updatedAt: now - 1_800_000,
      exercises: [
        {
          id: randomUUID(),
          exerciseId: bench.id,
          order: 0,
          sets: [
            {
              id: randomUUID(),
              order: 0,
              type: 'normal',
              weightKg: 60,
              reps: 8,
              completed: true,
              completedAt: now - 2_000_000,
            },
          ],
        },
      ],
    };
    const backup: LiftBackup = {
      ...base,
      workouts: [workout],
      bodyweight: [
        {
          id: randomUUID(),
          userId: p.a.userId,
          date: '2026-01-03',
          weightKg: 82,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: randomUUID(),
          userId: p.a.userId,
          date: '2026-01-04',
          weightKg: 81.5,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const result = await p.a.importReplace(backup);
    expect(result.ok).toBe(true);
    await p.b.sync();

    expect(await liveWorkouts(p.verifier)).toHaveLength(1);
    expect(await liveBodyweight(p.verifier)).toHaveLength(2);
    expect(await liveExercises(p.verifier)).toHaveLength(BUILT_INS);
    const bSnap = await p.b.g.dataOpsRepo.readSnapshot();
    expect(bSnap.workouts.map((w) => w.name)).toEqual(['Imported Push']);
    expect(bSnap.bodyweight.map((e) => e.date).sort()).toEqual(['2026-01-03', '2026-01-04']);
    expect(bSnap.exercises).toHaveLength(BUILT_INS);
    expect(await pending(p.b)).toBe(0);
  });

  it('deleteAllData on A, then sync on B: only built-ins remain and the unsynced B entry reappears', async () => {
    const p = await makePair();
    await syncBoth(p);
    await p.a.g.bodyweight.upsertForDate('2026-01-02', 78);
    await p.a.sync();
    await p.b.sync();
    expect(await p.b.g.bodyweight.listEntries()).toHaveLength(1);

    await p.b.g.bodyweight.upsertForDate(DAY, 90);
    expect(await pending(p.b)).toBe(1);

    const result = await p.a.deleteAll();
    expect(result.ok).toBe(true);
    expect(await p.a.g.bodyweight.listEntries()).toHaveLength(0);

    await p.b.sync();
    await p.a.sync();
    await p.b.sync();

    const exercises = await liveExercises(p.verifier);
    expect(exercises).toHaveLength(BUILT_INS);
    expect(exercises.every((e) => !e.is_custom)).toBe(true);
    expect(await liveWorkouts(p.verifier)).toHaveLength(0);

    const server = await liveBodyweight(p.verifier);
    expect(server.map((e) => e.entry_date)).toEqual([DAY]);

    const bLocal = await p.b.g.schema.db.exercises.toArray();
    expect(bLocal).toHaveLength(BUILT_INS);
    expect(bLocal.every((e) => !e.isCustom)).toBe(true);
    expect((await p.b.g.bodyweight.listEntries()).map((e) => e.date)).toEqual([DAY]);
    expect((await p.a.g.bodyweight.listEntries()).map((e) => e.date)).toEqual([DAY]);
    expect(await pending(p.b)).toBe(0);
    expect(await pending(p.a)).toBe(0);
  });
});
