import { liveQuery, type Observable } from 'dexie';
import { db } from '../schema';

export interface RestTimerSnapshot {
  workoutId: string;
  endsAt: number;
  durationSec: number;
}

export async function getOwner(): Promise<{ userId: string; email: string } | undefined> {
  const [id, email] = await Promise.all([db.meta.get('ownerUserId'), db.meta.get('ownerEmail')]);
  if (id?.key !== 'ownerUserId' || email?.key !== 'ownerEmail') return undefined;
  return { userId: id.value, email: email.value };
}

export async function setOwner(userId: string, email: string): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    await db.meta.put({ key: 'ownerUserId', value: userId });
    await db.meta.put({ key: 'ownerEmail', value: email });
  });
}

export async function requireUserId(): Promise<string> {
  const owner = await getOwner();
  if (!owner) throw new Error('No local owner; sign in first');
  return owner.userId;
}

export async function isInitialPullDone(): Promise<boolean> {
  const row = await db.meta.get('initialPullDone');
  return row?.key === 'initialPullDone' && row.value;
}

export async function getSeedVersion(): Promise<number> {
  const row = await db.meta.get('seedVersion');
  return row?.key === 'seedVersion' ? row.value : 0;
}

export async function setSeedVersion(v: number): Promise<void> {
  await db.meta.put({ key: 'seedVersion', value: v });
}

export function observeInitialPullDone(): Observable<boolean> {
  return liveQuery(isInitialPullDone);
}

export async function setInitialPullDone(v: boolean): Promise<void> {
  await db.meta.put({ key: 'initialPullDone', value: v });
}

export async function getRestTimer(): Promise<RestTimerSnapshot | undefined> {
  const row = await db.meta.get('restTimer');
  return row?.key === 'restTimer' ? row.value : undefined;
}

export async function setRestTimer(s: RestTimerSnapshot | null): Promise<void> {
  if (s === null) await db.meta.delete('restTimer');
  else await db.meta.put({ key: 'restTimer', value: s });
}

export async function wipeLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

export class OwnerChangedError extends Error {
  constructor() {
    super('Local owner changed during sync');
    this.name = 'OwnerChangedError';
  }
}

export async function assertOwner(userId: string): Promise<void> {
  const row = await db.meta.get('ownerUserId');
  if (row?.key !== 'ownerUserId' || row.value !== userId) throw new OwnerChangedError();
}
