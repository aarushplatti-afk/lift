import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { enqueue, runWrite } from '../../db/repos/outbox';
import { wipeLocalData } from '../../db/repos/meta';
import { getCursor } from '../../db/repos/syncApply';
import { buildKeysetFilter, pullAll, pullTable } from '../pull';
import { createFakeClient, exerciseRecord, exerciseRow, FakeServer } from './fakeClient';

let server: FakeServer;

beforeEach(async () => {
  await wipeLocalData();
  server = new FakeServer();
});

const TS = '2026-05-05T10:00:00.123456+00:00';

describe('buildKeysetFilter', () => {
  it('double-quotes every value', () => {
    expect(buildKeysetFilter('id', TS, 'k1')).toBe(
      `updated_at.gt."${TS}",and(updated_at.eq."${TS}",id.gt."k1")`,
    );
  });
});

describe('pullTable', () => {
  it('pages by keyset over rows sharing one updated_at without skipping any', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) =>
      exerciseRow(`e${String(i).padStart(5, '0')}`, TS),
    );
    server.seed('exercises', rows);
    const n = await pullTable(createFakeClient(server), 'exercises', 'u1');
    expect(n).toBe(1200);
    expect(await db.exercises.count()).toBe(1200);
    expect(server.selectCalls).toHaveLength(3);
    expect(server.selectCalls[0]?.filter).toBeUndefined();
    expect(server.selectCalls[1]?.filter).toBe(buildKeysetFilter('id', TS, 'e00499'));
    expect(server.selectCalls[2]?.filter).toBe(buildKeysetFilter('id', TS, 'e00999'));
    expect(await getCursor('exercises')).toEqual({ at: TS, key: 'e01199' });
  });

  it('persists the cursor with microseconds intact and only fetches newer rows next time', async () => {
    server.seed('exercises', [exerciseRow('a', TS)]);
    const client = createFakeClient(server);
    await pullTable(client, 'exercises', 'u1');
    expect(await getCursor('exercises')).toEqual({ at: TS, key: 'a' });

    const later = '2026-05-05T10:00:01.000001+00:00';
    server.seed('exercises', [exerciseRow('b', later, { name: 'new' })]);
    expect(await pullTable(client, 'exercises', 'u1')).toBe(1);
    expect(await getCursor('exercises')).toEqual({ at: later, key: 'b' });
    expect(await db.exercises.count()).toBe(2);
  });

  it('only returns the signed-in user rows', async () => {
    server.seed('exercises', [exerciseRow('a', TS), exerciseRow('x', TS, { user_id: 'other' })]);
    await pullTable(createFakeClient(server), 'exercises', 'u1');
    expect((await db.exercises.toArray()).map((e) => e.id)).toEqual(['a']);
  });

  it('removes locally cached rows when the server row is a tombstone', async () => {
    await db.exercises.put(exerciseRecord('a'));
    server.seed('exercises', [exerciseRow('a', TS, { deleted_at: TS })]);
    await pullTable(createFakeClient(server), 'exercises', 'u1');
    expect(await db.exercises.get('a')).toBeUndefined();
    expect((await getCursor('exercises')).key).toBe('a');
  });

  it('lets a pending local edit win but still advances the cursor', async () => {
    const local = exerciseRecord('a', { name: 'local edit' });
    await runWrite(['exercises'], async () => {
      await db.exercises.put(local);
      await enqueue('exercises', 'a', 'upsert', local);
    });
    server.seed('exercises', [exerciseRow('a', TS, { name: 'server value' })]);
    await pullTable(createFakeClient(server), 'exercises', 'u1');
    expect((await db.exercises.get('a'))?.name).toBe('local edit');
    expect((await getCursor('exercises')).at).toBe(TS);
  });

  it('keys user_settings on user_id', async () => {
    server.seed('user_settings', [{ user_id: 'u1', data: { unit: 'kg' }, updated_at: TS }]);
    const client = createFakeClient(server);
    await pullTable(client, 'user_settings', 'u1');
    expect((await db.settings.get('singleton'))?.unit).toBe('kg');
    expect(await getCursor('user_settings')).toEqual({ at: TS, key: 'u1' });
    server.seed('user_settings', []);
    await pullTable(client, 'user_settings', 'u1');
    expect(server.selectCalls[1]?.filter).toBe(buildKeysetFilter('user_id', TS, 'u1'));
  });

  it('a second device converges on the first device writes', async () => {
    server.seed('exercises', [exerciseRow('a', TS), exerciseRow('b', TS)]);
    const reported: string[] = [];
    const total = await pullAll(createFakeClient(server), 'u1', (t) => reported.push(t));
    expect(total).toBe(2);
    expect(reported).toEqual([
      'exercises',
      'templates',
      'workouts',
      'bodyweight_entries',
      'user_settings',
    ]);
    expect(await db.exercises.count()).toBe(2);
  });
});
