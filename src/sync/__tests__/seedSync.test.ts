import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeClient, FakeServer } from './fakeClient';

type Engine = import('../engine').SyncEngine;

interface Device {
  engine: Engine;
  seed: (userId: string) => Promise<number>;
  outboxCount: () => Promise<number>;
  exerciseCount: () => Promise<number>;
  setOnline: (v: boolean) => void;
  seedCalls: () => number;
}

let server: FakeServer;

async function freshIndexedDb(): Promise<void> {
  vi.resetModules();
  const factory = new IDBFactory();
  globalThis.indexedDB = factory;
  const { default: Dexie } = await import('dexie');
  Dexie.dependencies.indexedDB = factory;
}

async function makeDevice(): Promise<Device> {
  await freshIndexedDb();
  const [{ db }, meta, seedMod, engineMod] = await Promise.all([
    import('../../db/schema'),
    import('../../db/repos/meta'),
    import('../../db/seed'),
    import('../engine'),
  ]);
  await meta.setOwner('u1', 'a@example.com');
  let online = true;
  let calls = 0;
  const seed = (userId: string): Promise<number> => {
    calls += 1;
    return seedMod.ensureSeeded(userId);
  };
  const engine = engineMod.createSyncEngine({
    client: createFakeClient(server),
    now: () => Date.now(),
    isOnline: () => online,
    seed,
  });
  return {
    engine,
    seed: seedMod.ensureSeeded,
    outboxCount: () => db.syncQueue.count(),
    exerciseCount: () => db.exercises.count(),
    setOnline: (v) => {
      online = v;
    },
    seedCalls: () => calls,
  };
}

async function seedTotal(): Promise<number> {
  const { SEED_EXERCISES } = await import('../../db/seedData');
  return SEED_EXERCISES.length;
}

beforeEach(() => {
  server = new FakeServer();
});

describe('engine seeding', () => {
  it('seeds an empty server in one run and makes no new upserts on the next', async () => {
    const device = await makeDevice();
    const total = await seedTotal();
    await device.engine.syncNow('start');
    expect(device.engine.getStatus().state).toBe('synced');
    expect(server.tables.exercises).toHaveLength(total);
    expect(await device.exerciseCount()).toBe(total);
    expect(await device.outboxCount()).toBe(0);

    const calls = server.upsertCalls.length;
    await device.engine.syncNow('manual');
    expect(server.upsertCalls).toHaveLength(calls);
    expect(server.tables.exercises).toHaveLength(total);
  });

  it('never seeds while offline or when the pull fails', async () => {
    const device = await makeDevice();
    device.setOnline(false);
    await device.engine.syncNow('start');
    expect(device.engine.getStatus().state).toBe('offline');
    expect(device.seedCalls()).toBe(0);

    device.setOnline(true);
    server.networkDown = true;
    await device.engine.syncNow('start');
    expect(device.seedCalls()).toBe(0);
    expect(await device.exerciseCount()).toBe(0);
  });

  it('converges two devices that both seeded an empty server', async () => {
    const a = await makeDevice();
    const b = await makeDevice();
    const total = await seedTotal();
    expect(await b.seed('u1')).toBe(total);
    await a.engine.syncNow('start');
    await b.engine.syncNow('start');

    const ids = server.tables.exercises.map((r) => r.id);
    const names = server.tables.exercises.map((r) => String(r.name).toLowerCase());
    expect(new Set(ids).size).toBe(total);
    expect(ids).toHaveLength(total);
    expect(new Set(names).size).toBe(total);
    expect(await b.outboxCount()).toBe(0);
    expect(await b.exerciseCount()).toBe(total);
  });

  it('leaves the outbox empty on a device that syncs after another has pushed', async () => {
    const a = await makeDevice();
    const b = await makeDevice();
    const total = await seedTotal();
    await a.engine.syncNow('start');
    const calls = server.upsertCalls.length;
    await b.engine.syncNow('start');
    expect(server.upsertCalls).toHaveLength(calls);
    expect(await b.outboxCount()).toBe(0);
    expect(await b.exerciseCount()).toBe(total);
    expect(b.engine.getStatus().state).toBe('synced');
  });

  it('pushes archive-then-recreate of the same name in FIFO order without a 23505', async () => {
    server.enforceExerciseNameUnique = true;
    const noSeed = async (): Promise<number> => 0;
    await freshIndexedDb();
    const [{ db }, meta, outbox, repo, engineMod] = await Promise.all([
      import('../../db/schema'),
      import('../../db/repos/meta'),
      import('../../db/repos/outbox'),
      import('../../db/repos/exercises'),
      import('../engine'),
    ]);
    await meta.setOwner('u1', 'a@example.com');
    const engine = engineMod.createSyncEngine({
      client: createFakeClient(server),
      now: () => Date.now(),
      isOnline: () => true,
      seed: noSeed,
    });
    const first = await repo.createExercise({
      name: 'Sled Push',
      muscleGroup: 'quads',
      equipment: 'other',
      type: 'weight_reps',
    });
    if (!first.ok) throw new Error('create failed');
    await engine.syncNow('start');
    expect(server.tables.exercises).toHaveLength(1);

    const archived = { ...first.exercise, archived: true, updatedAt: Date.now() };
    await outbox.runWrite(['exercises'], async () => {
      await db.exercises.put(archived);
      await outbox.enqueue('exercises', archived.id, 'upsert', archived);
    });
    const second = await repo.createExercise({
      name: 'Sled Push',
      muscleGroup: 'quads',
      equipment: 'other',
      type: 'weight_reps',
    });
    expect(second.ok).toBe(true);
    await engine.syncNow('start');

    expect(engine.getStatus().state).toBe('synced');
    expect(server.tables.exercises).toHaveLength(2);
    expect(await db.syncQueue.count()).toBe(0);
  });
});
