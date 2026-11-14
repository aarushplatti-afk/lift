import Dexie, { type Table } from 'dexie';
import type { BodyweightEntry, Exercise, Settings, Template, Workout } from '../types/domain';
import type { OutboxEntry, SyncState, SyncTable } from '../types/sync';

export type MetaRow =
  | { key: 'ownerUserId'; value: string }
  | { key: 'ownerEmail'; value: string }
  | { key: 'initialPullDone'; value: boolean }
  | { key: 'seedVersion'; value: number };
export type MetaKey = MetaRow['key'];

export class LiftDB extends Dexie {
  exercises!: Table<Exercise, string>;
  workouts!: Table<Workout, string>;
  templates!: Table<Template, string>;
  bodyweight!: Table<BodyweightEntry, string>;
  settings!: Table<Settings, 'singleton'>;
  syncQueue!: Table<OutboxEntry, number>;
  syncState!: Table<SyncState, SyncTable>;
  meta!: Table<MetaRow, MetaKey>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, muscleGroup',
      workouts: 'id, startedAt, status',
      templates: 'id, name, lastUsedAt',
      bodyweight: 'id, &date',
      settings: 'id',
      syncQueue: '++id, [table+recordId], state, nextAttemptAt',
      syncState: 'table',
      meta: 'key',
    });
  }
}

export const LOCAL_TABLE: Record<
  SyncTable,
  'exercises' | 'workouts' | 'templates' | 'bodyweight' | 'settings'
> = {
  exercises: 'exercises',
  workouts: 'workouts',
  templates: 'templates',
  bodyweight_entries: 'bodyweight',
  user_settings: 'settings',
};

export function createDb(name = 'lift'): LiftDB {
  return new LiftDB(name);
}

export const db: LiftDB = createDb();
