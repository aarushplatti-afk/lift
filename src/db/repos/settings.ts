import { liveQuery, type Observable } from 'dexie';
import { db } from '../schema';
import { enqueue, runWrite } from './outbox';
import { requireUserId } from './meta';
import { clampRestSeconds } from '../../lib/calc/rest';
import type { Settings, SettingsData } from '../../types/domain';

export const DEFAULT_SETTINGS: SettingsData = {
  unit: 'lb',
  theme: 'dark',
  defaultRestSeconds: 90,
  restTimerAutoStart: true,
  keepScreenAwakeDuringWorkout: true,
  hapticsEnabled: true,
  soundEnabled: true,
  weightIncrementLb: 5,
  weightIncrementKg: 2.5,
  schemaVersion: 1,
};

export type SettingsPatch = Partial<Omit<SettingsData, 'schemaVersion'>>;

const GOAL_MAX_KG = 700;

function toData(row: Settings): SettingsData {
  const data: SettingsData & Partial<Settings> = { ...row };
  delete data.id;
  delete data.userId;
  delete data.updatedAt;
  return data;
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be greater than 0`);
  }
}

function sanitize(data: SettingsData): SettingsData {
  requirePositive('weightIncrementLb', data.weightIncrementLb);
  requirePositive('weightIncrementKg', data.weightIncrementKg);
  requirePositive('defaultRestSeconds', data.defaultRestSeconds);
  if (
    data.bodyweightGoalKg !== undefined &&
    !(data.bodyweightGoalKg > 0 && data.bodyweightGoalKg < GOAL_MAX_KG)
  ) {
    throw new RangeError(`bodyweightGoalKg must be between 0 and ${GOAL_MAX_KG} kg`);
  }
  return { ...data, defaultRestSeconds: clampRestSeconds(data.defaultRestSeconds) };
}

export async function getSettings(): Promise<SettingsData> {
  const row = await db.settings.get('singleton');
  return row ? toData(row) : { ...DEFAULT_SETTINGS };
}

export function observeSettings(): Observable<SettingsData> {
  return liveQuery(getSettings);
}

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  const userId = await requireUserId();
  await runWrite(['user_settings'], async () => {
    const current = await getSettings();
    const merged: SettingsData = { ...current, ...patch };
    if (merged.bodyweightGoalKg === undefined) delete merged.bodyweightGoalKg;
    const record: Settings = {
      ...sanitize(merged),
      id: 'singleton',
      userId,
      updatedAt: Date.now(),
    };
    await db.settings.put(record);
    await enqueue('user_settings', 'singleton', 'upsert', record);
  });
}
