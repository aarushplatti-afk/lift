import { db } from '../schema';
import { enqueue, runWrite } from './outbox';
import { requireUserId } from './meta';
import { bodyweightId } from '../../lib/ids';
import { isLocalDateString, todayLocal } from '../../lib/dates';
import {
  BW_NOTE_MAX,
  roundBodyweightKg,
  validateBodyweightKg,
  type BodyweightWeightError,
} from '../../lib/calc/bodyweight';
import type { BodyweightEntry } from '../../types/domain';

export type BodyweightWriteError =
  BodyweightWeightError | 'invalid_date' | 'future_date' | 'note_too_long';

export type BodyweightWriteResult =
  { ok: true; entry: BodyweightEntry } | { ok: false; error: BodyweightWriteError };

export async function listEntries(): Promise<BodyweightEntry[]> {
  return db.bodyweight.orderBy('date').reverse().toArray();
}

export async function upsertForDate(
  date: string,
  weightKg: number,
  note?: string,
): Promise<BodyweightWriteResult> {
  const userId = await requireUserId();
  if (!isLocalDateString(date)) return { ok: false, error: 'invalid_date' };
  if (date > todayLocal(Date.now())) return { ok: false, error: 'future_date' };
  const rounded = roundBodyweightKg(weightKg);
  const weightError = validateBodyweightKg(rounded);
  if (weightError) return { ok: false, error: weightError };
  const trimmed = note?.trim();
  const cleanNote = trimmed === undefined || trimmed === '' ? undefined : trimmed;
  if (cleanNote !== undefined && cleanNote.length > BW_NOTE_MAX) {
    return { ok: false, error: 'note_too_long' };
  }
  const id = bodyweightId(userId, date);
  return runWrite(['bodyweight_entries'], async (): Promise<BodyweightWriteResult> => {
    const now = Date.now();
    const clashes = await db.bodyweight.where('date').equals(date).primaryKeys();
    for (const clashId of clashes) {
      if (clashId === id) continue;
      await db.bodyweight.delete(clashId);
      await enqueue('bodyweight_entries', clashId, 'delete');
    }
    const existing = await db.bodyweight.get(id);
    const entry: BodyweightEntry = {
      id,
      userId,
      date,
      weightKg: rounded,
      ...(cleanNote === undefined ? {} : { note: cleanNote }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.bodyweight.put(entry);
    await enqueue('bodyweight_entries', id, 'upsert', entry);
    return { ok: true, entry };
  });
}

export async function deleteEntry(id: string): Promise<BodyweightEntry | undefined> {
  return runWrite(['bodyweight_entries'], async () => {
    const existing = await db.bodyweight.get(id);
    if (!existing) return undefined;
    await db.bodyweight.delete(id);
    await enqueue('bodyweight_entries', id, 'delete');
    return existing;
  });
}

export async function restoreEntry(snapshot: BodyweightEntry): Promise<boolean> {
  return runWrite(['bodyweight_entries'], async () => {
    const occupied = await db.bodyweight.where('date').equals(snapshot.date).count();
    if (occupied > 0) return false;
    await db.bodyweight.put(snapshot);
    await enqueue('bodyweight_entries', snapshot.id, 'upsert', snapshot);
    return true;
  });
}
