import { db } from '../schema';
import { assertOwner, getOwner } from './meta';
import { enqueue } from './outbox';
import { DEFAULT_SETTINGS, getSettings, sanitizeSettings } from './settings';
import type { BackupCounts, BackupData, LiftBackup } from '../../lib/backup';
import type { Settings } from '../../types/domain';

export class DataOpBlockedError extends Error {
  constructor(readonly reason: 'active_workout' | 'unsynced_changes') {
    super(
      reason === 'active_workout'
        ? 'Finish or discard your current workout first.'
        : 'Sync or discard pending changes in Account & Sync, then try again.',
    );
    this.name = 'DataOpBlockedError';
  }
}

async function hasActiveWorkout(): Promise<boolean> {
  const row = await db.meta.get('activeWorkoutId');
  return row?.key === 'activeWorkoutId';
}

export async function assertNoActiveWorkout(): Promise<void> {
  if (await hasActiveWorkout()) throw new DataOpBlockedError('active_workout');
}

export function readSnapshot(): Promise<BackupData & { userId: string }> {
  return db.transaction(
    'r',
    [db.exercises, db.workouts, db.templates, db.bodyweight, db.settings, db.meta],
    async () => {
      const owner = await getOwner();
      if (!owner) throw new Error('No local owner; sign in first');
      const [exercises, workouts, templates, bodyweight, settings] = await Promise.all([
        db.exercises.toArray(),
        db.workouts.where('status').equals('completed').toArray(),
        db.templates.toArray(),
        db.bodyweight.toArray(),
        getSettings(),
      ]);
      return { userId: owner.userId, exercises, workouts, templates, bodyweight, settings };
    },
  );
}

export async function replaceAllLocal(
  b: LiftBackup,
  userId: string,
  now: number,
): Promise<BackupCounts & { deleted: number }> {
  const settingsData = sanitizeSettings({ ...DEFAULT_SETTINGS, ...b.settings });

  return db.transaction(
    'rw',
    [db.exercises, db.workouts, db.templates, db.bodyweight, db.settings, db.syncQueue, db.meta],
    async () => {
      await assertOwner(userId);
      if (await hasActiveWorkout()) throw new DataOpBlockedError('active_workout');
      if ((await db.syncQueue.count()) > 0) throw new DataOpBlockedError('unsynced_changes');

      let deleted = 0;

      const keepWorkouts = new Set(b.workouts.map((r) => r.id));
      for (const id of await db.workouts.toCollection().primaryKeys()) {
        if (keepWorkouts.has(id)) continue;
        await db.workouts.delete(id);
        await enqueue('workouts', id, 'delete');
        deleted += 1;
      }

      const keepTemplates = new Set(b.templates.map((r) => r.id));
      for (const id of await db.templates.toCollection().primaryKeys()) {
        if (keepTemplates.has(id)) continue;
        await db.templates.delete(id);
        await enqueue('templates', id, 'delete');
        deleted += 1;
      }

      const keepBodyweight = new Set(b.bodyweight.map((r) => r.id));
      for (const id of await db.bodyweight.toCollection().primaryKeys()) {
        await db.bodyweight.delete(id);
        // Kept rows are re-put below; clearing them first avoids unique-date clashes on swaps.
        if (keepBodyweight.has(id)) continue;
        await enqueue('bodyweight_entries', id, 'delete');
        deleted += 1;
      }

      const keepExercises = new Set(b.exercises.map((r) => r.id));
      for (const id of await db.exercises.toCollection().primaryKeys()) {
        if (keepExercises.has(id)) continue;
        await db.exercises.delete(id);
        await enqueue('exercises', id, 'delete');
        deleted += 1;
      }

      for (const r of b.exercises) {
        const rec = { ...r, userId, updatedAt: now };
        await db.exercises.put(rec);
        await enqueue('exercises', rec.id, 'upsert', rec);
      }
      for (const r of b.templates) {
        const rec = { ...r, userId, updatedAt: now };
        await db.templates.put(rec);
        await enqueue('templates', rec.id, 'upsert', rec);
      }
      for (const r of b.workouts) {
        const rec = { ...r, userId, updatedAt: now };
        await db.workouts.put(rec);
        await enqueue('workouts', rec.id, 'upsert', rec);
      }
      for (const r of b.bodyweight) {
        const rec = { ...r, userId, updatedAt: now };
        await db.bodyweight.put(rec);
        await enqueue('bodyweight_entries', rec.id, 'upsert', rec);
      }

      const current = await getSettings();
      const onboardedAt = current.onboardedAt ?? b.settings.onboardedAt ?? now;
      const settingsRecord: Settings = {
        ...settingsData,
        onboardedAt,
        id: 'singleton',
        userId,
        updatedAt: now,
      };
      await db.settings.put(settingsRecord);
      await enqueue('user_settings', 'singleton', 'upsert', settingsRecord);

      return {
        exercises: b.exercises.length,
        customExercises: b.exercises.filter((e) => e.isCustom).length,
        workouts: b.workouts.length,
        templates: b.templates.length,
        bodyweight: b.bodyweight.length,
        deleted,
      };
    },
  );
}

export function clearUserDataLocal(
  userId: string,
  now: number,
  onboardedAtFallback?: number,
): Promise<void> {
  return db.transaction(
    'rw',
    [
      db.exercises,
      db.workouts,
      db.templates,
      db.bodyweight,
      db.settings,
      db.syncQueue,
      db.syncState,
      db.meta,
    ],
    async () => {
      await assertOwner(userId);
      if (await hasActiveWorkout()) throw new DataOpBlockedError('active_workout');
      const current = await getSettings();
      const onboardedAt = current.onboardedAt ?? onboardedAtFallback ?? now;
      await Promise.all([
        db.exercises.clear(),
        db.workouts.clear(),
        db.templates.clear(),
        db.bodyweight.clear(),
        db.settings.clear(),
        db.syncQueue.clear(),
        db.syncState.clear(),
      ]);
      await db.settings.put({
        ...DEFAULT_SETTINGS,
        onboardedAt,
        id: 'singleton',
        userId,
        updatedAt: now,
      });
      await db.meta.bulkDelete(['seedVersion', 'activeWorkoutId', 'restTimer']);
    },
  );
}
