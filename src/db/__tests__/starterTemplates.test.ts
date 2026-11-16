import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { ensureSeeded } from '../seed';
import { setOwner } from '../repos/meta';
import { addStarterTemplates } from '../repos/templates';
import { nameKey } from '../../lib/exercises';
import { starterTemplateId } from '../../lib/ids';
import { STARTER_TEMPLATES } from '../../lib/starterTemplates';

const U = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner(U, 'a@b.c');
  await ensureSeeded(U);
  await db.syncQueue.clear();
});

describe('addStarterTemplates', () => {
  it('adds three templates with deterministic ids and exact contents', async () => {
    expect(await addStarterTemplates(1234)).toBe(3);
    const rows = await db.templates.toArray();
    expect(rows).toHaveLength(3);
    expect(rows.map((t) => t.id).sort()).toEqual(
      STARTER_TEMPLATES.map((t) => starterTemplateId(U, t.key)).sort(),
    );
    const leg = rows.find((t) => t.id === starterTemplateId(U, 'legs'));
    expect(leg).toMatchObject({ userId: U, name: 'Leg Day', createdAt: 1234, updatedAt: 1234 });
    expect(leg?.exercises).toHaveLength(5);
    const squat = await db.exercises.get(leg?.exercises[0]?.exerciseId ?? '');
    expect(squat?.name).toBe('Back Squat');
    expect(leg?.exercises[0]?.sets).toEqual([
      { type: 'normal', targetReps: 8 },
      { type: 'normal', targetReps: 8 },
      { type: 'normal', targetReps: 8 },
    ]);
    expect(leg?.exercises[0]?.restSeconds).toBeUndefined();
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(3);
    expect(q.every((e) => e.table === 'templates' && e.op === 'upsert')).toBe(true);
  });

  it('is idempotent', async () => {
    await addStarterTemplates(1);
    await db.syncQueue.clear();
    expect(await addStarterTemplates(2)).toBe(0);
    expect(await db.templates.count()).toBe(3);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('skips archived exercises but keeps the rest', async () => {
    const bench = (await db.exercises.toArray()).find(
      (e) => nameKey(e.name) === 'barbell bench press',
    );
    await db.exercises.update(bench?.id ?? '', { archived: true });
    await addStarterTemplates(1);
    const push = await db.templates.get(starterTemplateId(U, 'push'));
    expect(push?.exercises).toHaveLength(4);
    expect(push?.exercises.map((e) => e.order)).toEqual([0, 1, 2, 3]);
  });

  it('skips a template when no exercise resolves', async () => {
    const names = new Set(STARTER_TEMPLATES[2]?.exercises.map((e) => nameKey(e.name)));
    for (const e of await db.exercises.toArray()) {
      if (names.has(nameKey(e.name))) await db.exercises.update(e.id, { archived: true });
    }
    expect(await addStarterTemplates(1)).toBe(2);
    expect(await db.templates.get(starterTemplateId(U, 'legs'))).toBeUndefined();
  });

  it('derives the same ids after a full local wipe for the same user', async () => {
    await addStarterTemplates(1);
    const first = (await db.templates.toArray()).map((t) => t.id).sort();
    await Promise.all(db.tables.map((t) => t.clear()));
    await setOwner(U, 'a@b.c');
    await ensureSeeded(U);
    await addStarterTemplates(2);
    expect((await db.templates.toArray()).map((t) => t.id).sort()).toEqual(first);
  });
});
