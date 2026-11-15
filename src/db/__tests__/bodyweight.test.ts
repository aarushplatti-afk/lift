import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { listDue } from '../repos/outbox';
import { setOwner } from '../repos/meta';
import { deleteEntry, listEntries, restoreEntry, upsertForDate } from '../repos/bodyweight';
import { applyServerRecords } from '../repos/syncApply';
import { coalesce } from '../../sync/coalesce';
import { bodyweightId } from '../../lib/ids';
import { todayLocal } from '../../lib/dates';
import type { BodyweightEntry } from '../../types/domain';

const DAY = 24 * 60 * 60 * 1000;
const D1 = '2026-01-10';
const D2 = '2026-01-11';

const legacy = (id: string, date: string): BodyweightEntry => ({
  id,
  userId: 'u1',
  date,
  weightKg: 70,
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
});

describe('upsertForDate', () => {
  it('creates an entry with the deterministic id, 3 dp, and one upsert op', async () => {
    const res = await upsertForDate(D1, 80.12345);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entry.id).toBe(bodyweightId('u1', D1));
    expect(res.entry).toMatchObject({ userId: 'u1', date: D1, weightKg: 80.123 });
    expect(res.entry.createdAt).toBe(res.entry.updatedAt);
    expect(res.entry).not.toHaveProperty('note');
    expect(await db.bodyweight.get(res.entry.id)).toEqual(res.entry);
    const ops = await db.syncQueue.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      table: 'bodyweight_entries',
      recordId: res.entry.id,
      op: 'upsert',
      payload: res.entry,
    });
  });

  it('same date replaces in place, keeps createdAt, bumps updatedAt', async () => {
    await db.bodyweight.put({ ...legacy(bodyweightId('u1', D1), D1), note: 'old', createdAt: 5 });
    const res = await upsertForDate(D1, 81);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entry.createdAt).toBe(5);
    expect(res.entry.updatedAt).toBeGreaterThan(5);
    expect(res.entry.weightKg).toBe(81);
    expect(res.entry).not.toHaveProperty('note');
    expect(await db.bodyweight.count()).toBe(1);
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('trims the note and treats empty as undefined', async () => {
    const a = await upsertForDate(D1, 80, '  morning  ');
    expect(a.ok && a.entry.note).toBe('morning');
    const b = await upsertForDate(D1, 80, '   ');
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.entry).not.toHaveProperty('note');
    expect((await db.bodyweight.get(bodyweightId('u1', D1)))?.note).toBeUndefined();
  });

  it('accepts a 200 char note and rejects 201 without writing', async () => {
    expect((await upsertForDate(D1, 80, 'x'.repeat(200))).ok).toBe(true);
    await Promise.all(db.tables.filter((t) => t.name !== 'meta').map((t) => t.clear()));
    const res = await upsertForDate(D2, 80, 'x'.repeat(201));
    expect(res).toEqual({ ok: false, error: 'note_too_long' });
    expect(await db.bodyweight.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('measures the note limit after trimming', async () => {
    const res = await upsertForDate(D1, 80, ` ${'x'.repeat(200)} `);
    expect(res.ok).toBe(true);
  });

  it.each([
    [0, 'too_low'],
    [-5, 'too_low'],
    [0.0004, 'too_low'],
    [700, 'too_high'],
    [699.9996, 'too_high'],
    [Number.NaN, 'missing'],
  ] as const)('rejects weight %s as %s with no write', async (kg, error) => {
    expect(await upsertForDate(D1, kg)).toEqual({ ok: false, error });
    expect(await db.bodyweight.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('accepts the weight boundaries 0.001 and 699.999', async () => {
    expect((await upsertForDate(D1, 0.001)).ok).toBe(true);
    expect((await upsertForDate(D2, 699.999)).ok).toBe(true);
  });

  it.each(['2026-02-30', '2026-2-3', '', 'nope', '1899-12-31'])(
    'rejects invalid date %j with no write',
    async (date) => {
      expect(await upsertForDate(date, 80)).toEqual({ ok: false, error: 'invalid_date' });
      expect(await db.bodyweight.count()).toBe(0);
      expect(await db.syncQueue.count()).toBe(0);
    },
  );

  it('rejects future dates but accepts today', async () => {
    const tomorrow = todayLocal(Date.now() + 2 * DAY);
    expect(await upsertForDate(tomorrow, 80)).toEqual({ ok: false, error: 'future_date' });
    expect(await db.bodyweight.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
    expect((await upsertForDate(todayLocal(Date.now()), 80)).ok).toBe(true);
  });

  it('deletes a legacy different-id same-date row and enqueues its delete before the upsert', async () => {
    await db.bodyweight.put(legacy('legacy-id', D1));
    const res = await upsertForDate(D1, 82);
    expect(res.ok).toBe(true);
    const rows = await db.bodyweight.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(bodyweightId('u1', D1));
    const ops = (await db.syncQueue.orderBy('id').toArray()).map((o) => [o.op, o.recordId]);
    expect(ops).toEqual([
      ['delete', 'legacy-id'],
      ['upsert', bodyweightId('u1', D1)],
    ]);
  });

  it('rejects when there is no local owner', async () => {
    await db.meta.clear();
    await expect(upsertForDate(D1, 80)).rejects.toThrow(/owner/i);
    expect(await db.bodyweight.count()).toBe(0);
  });
});

describe('listEntries', () => {
  it('returns entries date descending and empty when none', async () => {
    expect(await listEntries()).toEqual([]);
    await upsertForDate('2026-01-05', 80);
    await upsertForDate('2026-01-20', 81);
    await upsertForDate('2026-01-12', 82);
    expect((await listEntries()).map((e) => e.date)).toEqual([
      '2026-01-20',
      '2026-01-12',
      '2026-01-05',
    ]);
  });
});

describe('deleteEntry', () => {
  it('removes the row, returns the snapshot, and enqueues a delete op', async () => {
    const res = await upsertForDate(D1, 80, 'n');
    if (!res.ok) throw new Error('setup');
    const snap = await deleteEntry(res.entry.id);
    expect(snap).toEqual(res.entry);
    expect(await db.bodyweight.count()).toBe(0);
    const ops = await db.syncQueue.orderBy('id').toArray();
    expect(ops.map((o) => o.op)).toEqual(['upsert', 'delete']);
    expect(ops[1]).toMatchObject({ recordId: res.entry.id, payload: null });
  });

  it('returns undefined and enqueues nothing for a missing id', async () => {
    expect(await deleteEntry('ghost')).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('delete then re-log keeps the same id and coalesces to one upsert', async () => {
    const first = await upsertForDate(D1, 80);
    if (!first.ok) throw new Error('setup');
    await deleteEntry(first.entry.id);
    const again = await upsertForDate(D1, 79);
    expect(again.ok && again.entry.id).toBe(first.entry.id);
    expect(await db.bodyweight.count()).toBe(1);
    const ops = coalesce(await listDue(Date.now() + 1000, false));
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'upsert', recordId: first.entry.id });
    expect(ops[0]?.payload).toMatchObject({ weightKg: 79 });
  });

  it('a pulled tombstone does not remove a pending local re-log', async () => {
    const first = await upsertForDate(D1, 80);
    if (!first.ok) throw new Error('setup');
    await deleteEntry(first.entry.id);
    await db.syncQueue.clear();
    const again = await upsertForDate(D1, 79);
    if (!again.ok) throw new Error('setup');
    const r = await applyServerRecords(
      'bodyweight_entries',
      [{ record: first.entry, deleted: true }],
      'u1',
    );
    expect(r).toEqual({ applied: 0, skipped: 1 });
    expect((await db.bodyweight.get(first.entry.id))?.weightKg).toBe(79);
  });
});

describe('restoreEntry', () => {
  it('restores into a free date and enqueues an upsert', async () => {
    const res = await upsertForDate(D1, 80, 'n');
    if (!res.ok) throw new Error('setup');
    const snap = await deleteEntry(res.entry.id);
    if (!snap) throw new Error('setup');
    expect(await restoreEntry(snap)).toBe(true);
    expect(await db.bodyweight.get(snap.id)).toEqual(snap);
    const ops = await db.syncQueue.orderBy('id').toArray();
    expect(ops.map((o) => o.op)).toEqual(['upsert', 'delete', 'upsert']);
    expect(ops[2]).toMatchObject({ recordId: snap.id, payload: snap });
  });

  it('returns false and writes nothing when the date is occupied', async () => {
    const res = await upsertForDate(D1, 80);
    if (!res.ok) throw new Error('setup');
    const snap = await deleteEntry(res.entry.id);
    if (!snap) throw new Error('setup');
    await upsertForDate(D1, 75);
    const before = await db.syncQueue.count();
    expect(await restoreEntry(snap)).toBe(false);
    expect((await db.bodyweight.get(snap.id))?.weightKg).toBe(75);
    expect(await db.syncQueue.count()).toBe(before);
  });

  it('returns false and writes nothing when the owner changed', async () => {
    const res = await upsertForDate(D1, 80);
    if (!res.ok) throw new Error('setup');
    const snap = await deleteEntry(res.entry.id);
    if (!snap) throw new Error('setup');
    await setOwner('u2', 'x@y.z');
    const before = await db.syncQueue.count();
    expect(await restoreEntry(snap)).toBe(false);
    expect(await db.bodyweight.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(before);
  });
});

describe('deleteEntry owner check', () => {
  it('does not delete or enqueue a row owned by another user', async () => {
    await db.bodyweight.put(legacy('other', D1));
    await setOwner('u2', 'x@y.z');
    expect(await deleteEntry('other')).toBeUndefined();
    expect(await db.bodyweight.count()).toBe(1);
    expect(await db.syncQueue.count()).toBe(0);
  });
});

describe('sync paths for bodyweight', () => {
  it('tombstone with nothing pending deletes the local row', async () => {
    const id = bodyweightId('u1', D1);
    await db.bodyweight.put(legacy(id, D1));
    const r = await applyServerRecords(
      'bodyweight_entries',
      [{ record: legacy(id, D1), deleted: true }],
      'u1',
    );
    expect(r.applied).toBe(1);
    expect(await db.bodyweight.count()).toBe(0);
  });

  it('a live server row replaces a local different-id row for the same date', async () => {
    await db.bodyweight.put(legacy('legacy-id', D1));
    const serverId = bodyweightId('u1', D1);
    await applyServerRecords(
      'bodyweight_entries',
      [{ record: { ...legacy(serverId, D1), weightKg: 71 }, deleted: false }],
      'u1',
    );
    const rows = await db.bodyweight.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: serverId, weightKg: 71 });
  });
});
