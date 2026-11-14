import { db } from '../schema';

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

export async function setInitialPullDone(v: boolean): Promise<void> {
  await db.meta.put({ key: 'initialPullDone', value: v });
}

export async function wipeLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
