import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { getSeedVersion, setOwner, wipeLocalData } from '../repos/meta';
import { ensureSeeded, type SeedSource } from '../seed';
import { SEED_EXERCISES, SEED_VERSION } from '../seedData';
import { seededExerciseId } from '../../lib/ids';
import type { Exercise } from '../../types/domain';

const USER = 'user-1';
const N = SEED_EXERCISES.length;

function custom(name: string, archived: boolean): Exercise {
  return {
    id: `custom-${name}-${String(archived)}`,
    userId: USER,
    name,
    muscleGroup: 'back',
    equipment: 'barbell',
    type: 'weight_reps',
    isCustom: true,
    archived,
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner(USER, 'a@b.c');
});

describe('ensureSeeded', () => {
  it('inserts N rows and N outbox entries on first run, 0 on second', async () => {
    expect(await ensureSeeded(USER)).toBe(N);
    expect(await db.exercises.count()).toBe(N);
    expect(await db.syncQueue.count()).toBe(N);
    expect(await getSeedVersion()).toBe(SEED_VERSION);
    const queued = await db.syncQueue.toArray();
    expect(queued.every((q) => q.table === 'exercises' && q.op === 'upsert')).toBe(true);

    expect(await ensureSeeded(USER)).toBe(0);
    expect(await db.exercises.count()).toBe(N);
    expect(await db.syncQueue.count()).toBe(N);
  });

  it('inserts non-custom, unarchived rows with deterministic ids', async () => {
    await ensureSeeded(USER);
    const bench = await db.exercises.get(seededExerciseId(USER, 'Barbell Bench Press'));
    expect(bench).toMatchObject({ isCustom: false, archived: false, userId: USER });
  });

  it.each([false, true])(
    'a custom Deadlift (archived=%s) blocks only that entry',
    async (archived) => {
      await db.exercises.put(custom('deadlift', archived));
      expect(await ensureSeeded(USER)).toBe(N - 1);
      expect(await db.exercises.count()).toBe(N);
      expect(await db.exercises.get(seededExerciseId(USER, 'Deadlift'))).toBeUndefined();
      expect(await db.syncQueue.count()).toBe(N - 1);
    },
  );

  it('a version bump that adds one entry inserts exactly 1', async () => {
    await ensureSeeded(USER);
    const bumped: SeedSource = {
      version: SEED_VERSION + 1,
      exercises: [
        ...SEED_EXERCISES,
        { name: 'Zercher Squat', muscleGroup: 'quads', equipment: 'barbell', type: 'weight_reps' },
      ],
    };
    expect(await ensureSeeded(USER, bumped)).toBe(1);
    expect(await db.exercises.count()).toBe(N + 1);
    expect(await getSeedVersion()).toBe(SEED_VERSION + 1);
  });

  it('does not modify existing rows on a version bump', async () => {
    await ensureSeeded(USER);
    const id = seededExerciseId(USER, 'Barbell Bench Press');
    await db.exercises.update(id, { notes: 'mine', updatedAt: 99 });
    expect(await ensureSeeded(USER, { version: SEED_VERSION + 1, exercises: SEED_EXERCISES })).toBe(
      0,
    );
    expect(await db.exercises.get(id)).toMatchObject({ notes: 'mine', updatedAt: 99 });
  });

  it('reseeds wiped seeded rows with the same ids', async () => {
    await ensureSeeded(USER);
    const before = (await db.exercises.toArray()).map((e) => e.id).sort();
    await db.exercises.clear();
    await db.syncQueue.clear();
    expect(await ensureSeeded(USER)).toBe(N);
    const after = (await db.exercises.toArray()).map((e) => e.id).sort();
    expect(after).toEqual(before);
  });

  it('writes nothing on owner mismatch', async () => {
    await expect(ensureSeeded('someone-else')).rejects.toMatchObject({
      name: 'OwnerChangedError',
    });
    expect(await db.exercises.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
    expect(await getSeedVersion()).toBe(0);
  });
});
