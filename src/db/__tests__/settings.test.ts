import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { setOwner } from '../repos/meta';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../repos/settings';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
});

describe('settings repo', () => {
  it('returns defaults and persists nothing when none are stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await db.settings.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('update writes the record and exactly one outbox entry', async () => {
    await updateSettings({ unit: 'kg' });
    const row = await db.settings.get('singleton');
    expect(row).toMatchObject({ id: 'singleton', userId: 'u1', unit: 'kg', theme: 'dark' });
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ table: 'user_settings', recordId: 'singleton', op: 'upsert' });
    expect(q[0]?.payload).toEqual(row);
  });

  it('merges onto stored settings across updates', async () => {
    await updateSettings({ unit: 'kg' });
    await updateSettings({ theme: 'light' });
    expect(await getSettings()).toMatchObject({ unit: 'kg', theme: 'light' });
    expect(await db.syncQueue.count()).toBe(2);
  });

  it('clamps rest seconds to 15..600 in steps of 15', async () => {
    await updateSettings({ defaultRestSeconds: 5 });
    expect((await getSettings()).defaultRestSeconds).toBe(15);
    await updateSettings({ defaultRestSeconds: 9999 });
    expect((await getSettings()).defaultRestSeconds).toBe(600);
    await updateSettings({ defaultRestSeconds: 100 });
    expect((await getSettings()).defaultRestSeconds).toBe(105);
  });

  it('rejects invalid increments and goals without writing', async () => {
    await expect(updateSettings({ weightIncrementKg: 0 })).rejects.toThrow(RangeError);
    await expect(updateSettings({ weightIncrementLb: -1 })).rejects.toThrow(RangeError);
    await expect(updateSettings({ bodyweightGoalKg: 700 })).rejects.toThrow(RangeError);
    await expect(updateSettings({ bodyweightGoalKg: 0 })).rejects.toThrow(RangeError);
    expect(await db.settings.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('undefined removes bodyweightGoalKg', async () => {
    await updateSettings({ bodyweightGoalKg: 75 });
    expect((await getSettings()).bodyweightGoalKg).toBe(75);
    await updateSettings({ bodyweightGoalKg: undefined });
    const row = await db.settings.get('singleton');
    expect(row).toBeDefined();
    expect('bodyweightGoalKg' in (row ?? {})).toBe(false);
  });

  it('throws when there is no local owner', async () => {
    await db.meta.clear();
    await expect(updateSettings({ unit: 'kg' })).rejects.toThrow();
  });
});
