import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../db/repos/settings';
import type { Tables } from '../../types/database';
import type { BodyweightEntry, Settings, Template, Workout } from '../../types/domain';
import { fromRow, toRow } from '../mappers';
import { exerciseRecord } from './fakeClient';

const SERVER_TS = '2026-02-03T04:05:06.123456+00:00';
const SERVER_MS = Date.parse(SERVER_TS);

describe('mappers', () => {
  it('exercises round trip', () => {
    const rec = exerciseRecord('e1', { notes: 'cue', updatedAt: SERVER_MS });
    const row = toRow('exercises', rec);
    expect(row).toMatchObject({
      user_id: 'u1',
      muscle_group: 'chest',
      notes: 'cue',
      deleted_at: null,
    });
    expect(row).not.toHaveProperty('updated_at');
    const back = fromRow('exercises', { ...row, updated_at: SERVER_TS } as Tables<'exercises'>);
    expect(back).toEqual({ record: rec, deleted: false });
  });

  it('workouts round trip and keep jsonb timestamps as epoch ms', () => {
    const rec: Workout = {
      id: 'w1',
      userId: 'u1',
      name: 'Push',
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_900_000,
      status: 'completed',
      templateId: 't1',
      notes: 'good',
      exercises: [
        {
          id: 'we1',
          exerciseId: 'e1',
          order: 0,
          sets: [
            {
              id: 's1',
              order: 0,
              type: 'normal',
              weightKg: 100,
              reps: 5,
              completed: true,
              completedAt: 1_700_000_100_000,
            },
          ],
        },
      ],
      createdAt: 1_700_000_000_000,
      updatedAt: SERVER_MS,
    };
    const row = toRow('workouts', rec);
    expect(row.started_at).toBe(new Date(rec.startedAt).toISOString());
    expect(row.exercises).toEqual(rec.exercises);
    const back = fromRow('workouts', { ...row, updated_at: SERVER_TS } as Tables<'workouts'>);
    expect(back.record).toEqual(rec);
  });

  it('workouts with null optionals omit them', () => {
    const rec: Workout = {
      id: 'w2',
      userId: 'u1',
      name: 'x',
      startedAt: 1,
      status: 'in_progress',
      exercises: [],
      createdAt: 1,
      updatedAt: SERVER_MS,
    };
    const row = toRow('workouts', rec);
    expect(row.ended_at).toBeNull();
    const back = fromRow('workouts', { ...row, updated_at: SERVER_TS } as Tables<'workouts'>);
    expect(back.record).toEqual(rec);
    expect(back.record).not.toHaveProperty('endedAt');
  });

  it('templates round trip', () => {
    const rec: Template = {
      id: 't1',
      userId: 'u1',
      name: 'A',
      exercises: [{ exerciseId: 'e1', order: 0, sets: [{ type: 'normal', targetReps: 5 }] }],
      createdAt: 5,
      lastUsedAt: 9,
      updatedAt: SERVER_MS,
    };
    const row = toRow('templates', rec);
    const back = fromRow('templates', { ...row, updated_at: SERVER_TS } as Tables<'templates'>);
    expect(back.record).toEqual(rec);
  });

  it('bodyweight round trip rounds to 3 dp', () => {
    const rec: BodyweightEntry = {
      id: 'b1',
      userId: 'u1',
      date: '2026-01-02',
      weightKg: 80.123456,
      note: 'am',
      createdAt: 5,
      updatedAt: SERVER_MS,
    };
    const row = toRow('bodyweight_entries', rec);
    expect(row.weight_kg).toBe(80.123);
    expect(row.entry_date).toBe('2026-01-02');
    const back = fromRow('bodyweight_entries', {
      ...row,
      updated_at: SERVER_TS,
    } as Tables<'bodyweight_entries'>);
    expect(back.record).toEqual({ ...rec, weightKg: 80.123 });
  });

  it('bodyweight toRow always sends deleted_at null so a re-log revives a tombstone', () => {
    const row = toRow('bodyweight_entries', {
      id: 'b1',
      userId: 'u1',
      date: '2026-01-02',
      weightKg: 80.9206,
      createdAt: 5,
      updatedAt: 6,
    });
    expect(row.deleted_at).toBeNull();
    expect(row.weight_kg).toBe(80.921);
    expect(row.note).toBeNull();
  });

  it('user_settings maps to { user_id, data } and merges defaults on read', () => {
    const rec: Settings = {
      ...DEFAULT_SETTINGS,
      unit: 'kg',
      bodyweightGoalKg: 75,
      id: 'singleton',
      userId: 'u1',
      updatedAt: SERVER_MS,
    };
    const row = toRow('user_settings', rec);
    expect(Object.keys(row).sort()).toEqual(['data', 'user_id']);
    expect(row.data).not.toHaveProperty('id');
    expect(row.data).not.toHaveProperty('userId');
    const back = fromRow('user_settings', {
      ...row,
      updated_at: SERVER_TS,
    } as Tables<'user_settings'>);
    expect(back.record).toEqual(rec);

    const sparse = fromRow('user_settings', {
      user_id: 'u1',
      data: { unit: 'kg' },
      updated_at: SERVER_TS,
    });
    expect(sparse.record).toEqual({
      ...DEFAULT_SETTINGS,
      unit: 'kg',
      id: 'singleton',
      userId: 'u1',
      updatedAt: SERVER_MS,
    });
  });

  it('flags tombstones', () => {
    const row = {
      ...toRow('exercises', exerciseRecord('e1')),
      updated_at: SERVER_TS,
      deleted_at: SERVER_TS,
    } as Tables<'exercises'>;
    expect(fromRow('exercises', row).deleted).toBe(true);
  });
});
