import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, db, LOCAL_TABLE } from '../schema';
import type { BodyweightEntry, Exercise, Settings, Template, Workout } from '../../types/domain';

const meta = { userId: 'u1', updatedAt: 1 };

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('schema', () => {
  it('opens with all tables', async () => {
    const fresh = createDb('schema-open');
    await fresh.open();
    expect(fresh.tables.map((t) => t.name).sort()).toEqual([
      'bodyweight',
      'exercises',
      'meta',
      'settings',
      'syncQueue',
      'syncState',
      'templates',
      'workouts',
    ]);
    fresh.close();
    await fresh.delete();
  });

  it('maps every sync table to a local table', () => {
    expect(LOCAL_TABLE.bodyweight_entries).toBe('bodyweight');
    expect(LOCAL_TABLE.user_settings).toBe('settings');
  });

  it('round-trips fixtures', async () => {
    const exercise: Exercise = {
      ...meta,
      id: 'e1',
      name: 'Bench Press',
      muscleGroup: 'chest',
      equipment: 'barbell',
      type: 'weight_reps',
      isCustom: false,
      archived: false,
      createdAt: 1,
    };
    const workout: Workout = {
      ...meta,
      id: 'w1',
      name: 'Push',
      startedAt: 5,
      status: 'in_progress',
      createdAt: 5,
      exercises: [
        {
          id: 'we1',
          exerciseId: 'e1',
          order: 0,
          sets: [{ id: 's1', order: 0, type: 'normal', weightKg: 60, reps: 5, completed: true }],
        },
      ],
    };
    const template: Template = {
      ...meta,
      id: 't1',
      name: 'T',
      createdAt: 1,
      exercises: [{ exerciseId: 'e1', order: 0, sets: [{ type: 'normal', targetReps: 5 }] }],
    };
    const bw: BodyweightEntry = {
      ...meta,
      id: 'b1',
      date: '2026-01-01',
      weightKg: 80,
      createdAt: 1,
    };
    const settings: Settings = {
      ...meta,
      id: 'singleton',
      unit: 'lb',
      theme: 'dark',
      defaultRestSeconds: 90,
      restTimerAutoStart: true,
      keepScreenAwakeDuringWorkout: true,
      hapticsEnabled: true,
      soundEnabled: false,
      weightIncrementLb: 5,
      weightIncrementKg: 2.5,
      schemaVersion: 1,
    };
    await db.exercises.put(exercise);
    await db.workouts.put(workout);
    await db.templates.put(template);
    await db.bodyweight.put(bw);
    await db.settings.put(settings);
    expect(await db.exercises.get('e1')).toEqual(exercise);
    expect(await db.workouts.get('w1')).toEqual(workout);
    expect(await db.templates.get('t1')).toEqual(template);
    expect(await db.bodyweight.get('b1')).toEqual(bw);
    expect(await db.settings.get('singleton')).toEqual(settings);
  });

  it('enforces unique bodyweight date', async () => {
    await db.bodyweight.put({ ...meta, id: 'a', date: '2026-01-01', weightKg: 80, createdAt: 1 });
    await expect(
      db.bodyweight.put({ ...meta, id: 'b', date: '2026-01-01', weightKg: 81, createdAt: 1 }),
    ).rejects.toThrow();
  });
});
