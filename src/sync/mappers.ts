import { DEFAULT_SETTINGS } from '../db/repos/settings';
import type { Json, Tables, TablesInsert } from '../types/database';
import type {
  BodyweightEntry,
  Exercise,
  Settings,
  SettingsData,
  Template,
  Workout,
} from '../types/domain';
import type { SyncRecordMap, SyncTable } from '../types/sync';

export interface MappedRecord<T> {
  record: T;
  deleted: boolean;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const ms = (s: string): number => Date.parse(s);
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

type ToRowMap = { [K in SyncTable]: (rec: SyncRecordMap[K]) => TablesInsert<K> };
type FromRowMap = { [K in SyncTable]: (row: Tables<K>) => MappedRecord<SyncRecordMap[K]> };

function optional<K extends string, V>(key: K, value: V | null): { [P in K]?: V } {
  return value === null ? {} : ({ [key]: value } as { [P in K]?: V });
}

const TO_ROW: ToRowMap = {
  exercises: (r) => ({
    id: r.id,
    user_id: r.userId,
    name: r.name,
    muscle_group: r.muscleGroup,
    equipment: r.equipment,
    type: r.type,
    is_custom: r.isCustom,
    archived: r.archived,
    notes: r.notes ?? null,
    created_at: iso(r.createdAt),
    deleted_at: null,
  }),
  workouts: (r) => ({
    id: r.id,
    user_id: r.userId,
    name: r.name,
    started_at: iso(r.startedAt),
    ended_at: r.endedAt === undefined ? null : iso(r.endedAt),
    status: r.status,
    template_id: r.templateId ?? null,
    notes: r.notes ?? null,
    exercises: r.exercises as unknown as Json,
    created_at: iso(r.createdAt),
    deleted_at: null,
  }),
  templates: (r) => ({
    id: r.id,
    user_id: r.userId,
    name: r.name,
    exercises: r.exercises as unknown as Json,
    created_at: iso(r.createdAt),
    last_used_at: r.lastUsedAt === undefined ? null : iso(r.lastUsedAt),
    deleted_at: null,
  }),
  bodyweight_entries: (r) => ({
    id: r.id,
    user_id: r.userId,
    entry_date: r.date,
    weight_kg: round3(r.weightKg),
    note: r.note ?? null,
    created_at: iso(r.createdAt),
    deleted_at: null,
  }),
  user_settings: (r) => {
    const data: Record<string, unknown> = { ...r };
    delete data.id;
    delete data.userId;
    delete data.updatedAt;
    return { user_id: r.userId, data: data as unknown as Json };
  },
};

const FROM_ROW: FromRowMap = {
  exercises: (row): MappedRecord<Exercise> => ({
    record: {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      muscleGroup: row.muscle_group as Exercise['muscleGroup'],
      equipment: row.equipment as Exercise['equipment'],
      type: row.type as Exercise['type'],
      isCustom: row.is_custom,
      archived: row.archived,
      ...optional('notes', row.notes),
      createdAt: ms(row.created_at),
      updatedAt: ms(row.updated_at),
    },
    deleted: row.deleted_at !== null,
  }),
  workouts: (row): MappedRecord<Workout> => ({
    record: {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      startedAt: ms(row.started_at),
      ...optional('endedAt', row.ended_at === null ? null : ms(row.ended_at)),
      status: row.status as Workout['status'],
      ...optional('templateId', row.template_id),
      ...optional('notes', row.notes),
      exercises: row.exercises as unknown as Workout['exercises'],
      createdAt: ms(row.created_at),
      updatedAt: ms(row.updated_at),
    },
    deleted: row.deleted_at !== null,
  }),
  templates: (row): MappedRecord<Template> => ({
    record: {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      exercises: row.exercises as unknown as Template['exercises'],
      createdAt: ms(row.created_at),
      ...optional('lastUsedAt', row.last_used_at === null ? null : ms(row.last_used_at)),
      updatedAt: ms(row.updated_at),
    },
    deleted: row.deleted_at !== null,
  }),
  bodyweight_entries: (row): MappedRecord<BodyweightEntry> => ({
    record: {
      id: row.id,
      userId: row.user_id,
      date: row.entry_date,
      weightKg: Number(row.weight_kg),
      ...optional('note', row.note),
      createdAt: ms(row.created_at),
      updatedAt: ms(row.updated_at),
    },
    deleted: row.deleted_at !== null,
  }),
  user_settings: (row): MappedRecord<Settings> => {
    const { onboardedAt, ...data } = row.data as Partial<SettingsData>;
    const record: Settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      id: 'singleton',
      userId: row.user_id,
      updatedAt: ms(row.updated_at),
    };
    if (Number.isInteger(onboardedAt) && onboardedAt !== undefined && onboardedAt > 0) {
      record.onboardedAt = onboardedAt;
    }
    return { record, deleted: false };
  },
};

export function toRow<T extends SyncTable>(table: T, rec: SyncRecordMap[T]): TablesInsert<T> {
  return TO_ROW[table](rec);
}

export function fromRow<T extends SyncTable>(
  table: T,
  row: Tables<T>,
): MappedRecord<SyncRecordMap[T]> {
  return FROM_ROW[table](row);
}
