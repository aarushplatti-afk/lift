import { db, LOCAL_TABLE } from '../schema';
import type { SyncRecordMap, SyncTable } from '../../types/sync';

export async function applyServerRecords<T extends SyncTable>(
  table: T,
  items: { record: SyncRecordMap[T]; deleted: boolean }[],
): Promise<{ applied: number; skipped: number }> {
  const localName = LOCAL_TABLE[table];
  return db.transaction('rw', [localName, 'syncQueue'], async () => {
    const local = db.table<SyncRecordMap[T], string>(localName);
    let applied = 0;
    let skipped = 0;
    for (const { record, deleted } of items) {
      const pending = await db.syncQueue
        .where('[table+recordId]')
        .equals([table, record.id])
        .count();
      if (pending > 0) {
        skipped += 1;
        continue;
      }
      if (deleted) {
        await local.delete(record.id);
      } else {
        if (table === 'bodyweight_entries') {
          const date = (record as SyncRecordMap['bodyweight_entries']).date;
          const clashes = await db.bodyweight.where('date').equals(date).primaryKeys();
          await db.bodyweight.bulkDelete(clashes.filter((id) => id !== record.id));
        }
        await local.put(record);
      }
      applied += 1;
    }
    return { applied, skipped };
  });
}

export async function getCursor(
  table: SyncTable,
): Promise<{ at: string | null; key: string | null }> {
  const row = await db.syncState.get(table);
  return { at: row?.lastPulledAt ?? null, key: row?.lastPulledKey ?? null };
}

export async function setCursor(table: SyncTable, at: string, key: string): Promise<void> {
  await db.syncState.put({ table, lastPulledAt: at, lastPulledKey: key });
}
