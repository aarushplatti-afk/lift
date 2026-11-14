import { db } from './schema';
import { assertOwner, getSeedVersion, setSeedVersion } from './repos/meta';
import { enqueue } from './repos/outbox';
import { SEED_EXERCISES, SEED_VERSION, type SeedExercise } from './seedData';
import { nameKey } from '../lib/exercises';
import { seededExerciseId } from '../lib/ids';
import type { Exercise } from '../types/domain';

export interface SeedSource {
  version: number;
  exercises: readonly SeedExercise[];
}

const DEFAULT_SOURCE: SeedSource = { version: SEED_VERSION, exercises: SEED_EXERCISES };

export function ensureSeeded(userId: string, source: SeedSource = DEFAULT_SOURCE): Promise<number> {
  return db.transaction('rw', [db.exercises, db.syncQueue, db.meta], async () => {
    await assertOwner(userId);
    const version = await getSeedVersion();
    const all = await db.exercises.toArray();
    if (version >= source.version && all.some((e) => !e.isCustom)) return 0;

    const ids = new Set(all.map((e) => e.id));
    const keys = new Set(all.map((e) => nameKey(e.name)));
    const now = Date.now();
    let inserted = 0;
    for (const s of source.exercises) {
      const id = seededExerciseId(userId, s.name);
      const key = nameKey(s.name);
      if (ids.has(id) || keys.has(key)) continue;
      const exercise: Exercise = {
        id,
        userId,
        name: s.name,
        muscleGroup: s.muscleGroup,
        equipment: s.equipment,
        type: s.type,
        isCustom: false,
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.exercises.put(exercise);
      await enqueue('exercises', id, 'upsert', exercise);
      ids.add(id);
      keys.add(key);
      inserted += 1;
    }
    await setSeedVersion(source.version);
    return inserted;
  });
}
