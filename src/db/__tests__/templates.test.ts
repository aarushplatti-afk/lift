import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../schema';
import { setOwner } from '../repos/meta';
import {
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  markTemplateUsed,
  observeTemplates,
  saveTemplate,
} from '../repos/templates';
import { startWorkout } from '../repos/workouts';
import { pushOutbox } from '../../sync/push';
import { createFakeClient, FakeServer } from '../../sync/__tests__/fakeClient';
import type { TemplateExercise, Workout } from '../../types/domain';

const exs = (over: Partial<TemplateExercise> = {}): TemplateExercise[] => [
  {
    exerciseId: 'e1',
    order: 0,
    sets: [{ type: 'normal', targetWeightKg: 45.359237, targetReps: 5 }],
    ...over,
  },
];

const completedWorkout = (id: string): Workout => ({
  id,
  userId: 'u1',
  name: 'Done',
  startedAt: 1,
  endedAt: 2,
  status: 'completed',
  templateId: 't-del',
  exercises: [
    {
      id: 'we',
      exerciseId: 'e1',
      order: 0,
      sets: [{ id: 's', order: 0, type: 'normal', weightKg: 1, reps: 1, completed: true }],
    },
  ],
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
});

describe('saveTemplate', () => {
  it('creates a template and enqueues one upsert', async () => {
    const res = await saveTemplate({ name: '  Push   Day ', exercises: exs() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.template).toMatchObject({ userId: 'u1', name: 'Push Day' });
    expect(res.template.createdAt).toBe(res.template.updatedAt);
    expect(res.template.lastUsedAt).toBeUndefined();
    expect(await db.templates.get(res.template.id)).toEqual(res.template);
    const q = await db.syncQueue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ table: 'templates', recordId: res.template.id, op: 'upsert' });
  });

  it('normalizes exercises', async () => {
    const res = await saveTemplate({
      name: 'A',
      exercises: exs({ order: 9, restSeconds: 1000 }),
    });
    if (!res.ok) throw new Error('expected ok');
    expect(res.template.exercises[0]).toMatchObject({ order: 0, restSeconds: 600 });
  });

  it('updates an existing template, keeping createdAt and lastUsedAt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1000);
      const created = await saveTemplate({ name: 'A', exercises: exs() });
      if (!created.ok) throw new Error('expected ok');
      await markTemplateUsedInTx(created.template.id, 1500);
      vi.setSystemTime(2000);
      const res = await saveTemplate({ id: created.template.id, name: 'B', exercises: exs() });
      if (!res.ok) throw new Error('expected ok');
      expect(res.template).toMatchObject({
        id: created.template.id,
        name: 'B',
        createdAt: 1000,
        updatedAt: 2000,
        lastUsedAt: 1500,
      });
      expect(await db.syncQueue.count()).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a no-op update writes and enqueues nothing', async () => {
    const created = await saveTemplate({ name: 'A', exercises: exs() });
    if (!created.ok) throw new Error('expected ok');
    const before = await db.syncQueue.count();
    const again = await saveTemplate({
      id: created.template.id,
      name: ' A ',
      exercises: exs(),
    });
    expect(again).toEqual({ ok: true, template: created.template });
    expect(await db.syncQueue.count()).toBe(before);
  });

  it('returns validation errors without writing', async () => {
    expect(await saveTemplate({ name: ' ', exercises: exs() })).toEqual({
      ok: false,
      error: { field: 'name', code: 'required' },
    });
    expect(await saveTemplate({ name: 'x'.repeat(61), exercises: exs() })).toEqual({
      ok: false,
      error: { field: 'name', code: 'too_long' },
    });
    expect(await saveTemplate({ name: 'A', exercises: [] })).toEqual({
      ok: false,
      error: { field: 'exercises', code: 'required' },
    });
    expect(await db.templates.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('throws RangeError on a bad target and writes nothing', async () => {
    await expect(
      saveTemplate({
        name: 'A',
        exercises: exs({ sets: [{ type: 'normal', targetReps: 2.5 }] }),
      }),
    ).rejects.toThrow(RangeError);
    expect(await db.templates.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('re-creates a template under the same id when it was deleted elsewhere', async () => {
    const res = await saveTemplate({ id: 'gone-id', name: 'Back', exercises: exs() });
    if (!res.ok) throw new Error('expected ok');
    expect(res.template.id).toBe('gone-id');
    expect(await db.templates.get('gone-id')).toBeDefined();
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('requires a local owner', async () => {
    await db.meta.clear();
    await expect(saveTemplate({ name: 'A', exercises: exs() })).rejects.toThrow();
  });

  it('allows duplicate names', async () => {
    await saveTemplate({ name: 'A', exercises: exs() });
    await saveTemplate({ name: 'A', exercises: exs() });
    expect(await db.templates.count()).toBe(2);
  });
});

async function markTemplateUsedInTx(id: string, at: number): Promise<void> {
  await db.transaction('rw', [db.templates, db.syncQueue], () => markTemplateUsed(id, at));
}

describe('duplicateTemplate', () => {
  it('copies under a new id with an independent exercise list', async () => {
    const res = await saveTemplate({ name: 'Push', exercises: exs() });
    if (!res.ok) throw new Error('expected ok');
    await markTemplateUsedInTx(res.template.id, 5000);
    const copy = await duplicateTemplate(res.template.id);
    expect(copy.id).not.toBe(res.template.id);
    expect(copy.name).toBe('Copy of Push');
    expect(copy.lastUsedAt).toBeUndefined();
    expect(copy.createdAt).toBe(copy.updatedAt);
    expect(copy.exercises).toEqual(res.template.exercises);
    const stored = await db.templates.get(copy.id);
    expect(stored).toEqual(copy);
    copy.exercises[0]?.sets.push({ type: 'drop' });
    const original = await db.templates.get(res.template.id);
    expect(original?.exercises[0]?.sets).toHaveLength(1);
    const q = (await db.syncQueue.toArray()).filter((e) => e.recordId === copy.id);
    expect(q).toHaveLength(1);
  });

  it('throws for a missing template', async () => {
    await expect(duplicateTemplate('nope')).rejects.toThrow('Template not found');
    expect(await db.syncQueue.count()).toBe(0);
  });
});

describe('deleteTemplate', () => {
  it('deletes, enqueues a delete and leaves workouts untouched', async () => {
    const res = await saveTemplate({ id: 't-del', name: 'A', exercises: exs() });
    if (!res.ok) throw new Error('expected ok');
    await db.workouts.put(completedWorkout('w1'));
    const before = JSON.stringify(await db.workouts.toArray());
    await deleteTemplate('t-del');
    expect(await db.templates.get('t-del')).toBeUndefined();
    const q = await db.syncQueue.toArray();
    expect(q.at(-1)).toMatchObject({ table: 'templates', recordId: 't-del', op: 'delete' });
    expect(JSON.stringify(await db.workouts.toArray())).toBe(before);
  });

  it('is a no-op for a missing id', async () => {
    await deleteTemplate('nope');
    expect(await db.syncQueue.count()).toBe(0);
  });
});

describe('listTemplates and observeTemplates', () => {
  it('returns an empty list when nothing exists', async () => {
    expect(await listTemplates()).toEqual([]);
    expect(await getTemplate('x')).toBeUndefined();
  });

  it('sorts by lastUsedAt ?? createdAt desc, then name, then id', async () => {
    const base = { userId: 'u1', exercises: [], updatedAt: 1 };
    await db.templates.bulkPut([
      { ...base, id: 'c', name: 'b', createdAt: 10 },
      { ...base, id: 'b', name: 'a', createdAt: 10 },
      { ...base, id: 'a', name: 'a', createdAt: 10 },
      { ...base, id: 'd', name: 'z', createdAt: 1, lastUsedAt: 50 },
    ]);
    expect((await listTemplates()).map((t) => t.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('observes changes', async () => {
    const first = await new Promise<number>((resolve) => {
      const sub = observeTemplates().subscribe({
        next: (v) => {
          resolve(v.length);
          sub.unsubscribe();
        },
      });
    });
    expect(first).toBe(0);
  });
});

describe('markTemplateUsed', () => {
  it('throws outside a transaction that includes templates and syncQueue', async () => {
    await expect(markTemplateUsed('t', 1)).rejects.toThrow();
    await expect(
      db.transaction('rw', db.templates, () => markTemplateUsed('t', 1)),
    ).rejects.toThrow();
  });

  it('does nothing when the template is missing', async () => {
    await markTemplateUsedInTx('nope', 5);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('sets lastUsedAt and updatedAt and enqueues', async () => {
    const res = await saveTemplate({ id: 'tt', name: 'A', exercises: exs() });
    if (!res.ok) throw new Error('expected ok');
    await markTemplateUsedInTx('tt', 777);
    expect(await db.templates.get('tt')).toMatchObject({ lastUsedAt: 777, updatedAt: 777 });
    expect(await db.syncQueue.count()).toBe(2);
  });
});

describe('startWorkout with a template', () => {
  it('bumps the template exactly once and enqueues it', async () => {
    const res = await saveTemplate({ id: 'tt', name: 'A', exercises: exs() });
    if (!res.ok) throw new Error('expected ok');
    const w = await startWorkout({ templateId: 'tt' });
    const row = await db.templates.get('tt');
    expect(row?.lastUsedAt).toBe(w.startedAt);
    expect(row?.updatedAt).toBe(w.startedAt);
    const q = (await db.syncQueue.toArray()).filter((e) => e.recordId === 'tt');
    expect(q).toHaveLength(2);
    expect(q.at(-1)).toMatchObject({ op: 'upsert' });
  });

  it('does not bump when a workout is already active', async () => {
    const res = await saveTemplate({ id: 'tt', name: 'A', exercises: exs() });
    if (!res.ok) throw new Error('expected ok');
    await startWorkout({ name: 'first' });
    const queued = await db.syncQueue.count();
    const again = await startWorkout({ templateId: 'tt' });
    expect(again.name).toBe('first');
    expect((await db.templates.get('tt'))?.lastUsedAt).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(queued);
  });

  it('does not throw when the template is missing', async () => {
    const w = await startWorkout({ templateId: 'missing' });
    expect(w.templateId).toBe('missing');
    expect(await db.syncQueue.count()).toBe(0);
  });
});

describe('push through fakeClient', () => {
  it('sends a templates row with jsonb exercises, targetDurationSec and last_used_at', async () => {
    const res = await saveTemplate({
      id: 'tt',
      name: 'Push',
      exercises: [
        {
          exerciseId: 'e1',
          order: 0,
          sets: [
            { type: 'normal', targetWeightKg: 45.359237, targetReps: 5 },
            { type: 'normal', targetDurationSec: 90 },
          ],
        },
      ],
    });
    if (!res.ok) throw new Error('expected ok');
    await markTemplateUsedInTx('tt', 1_700_000_000_000);
    const server = new FakeServer();
    const out = await pushOutbox(createFakeClient(server), { now: Date.now(), force: true });
    expect(out.failed).toBe(0);
    const rows = server.tables.templates;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'tt',
      user_id: 'u1',
      name: 'Push',
      last_used_at: new Date(1_700_000_000_000).toISOString(),
      deleted_at: null,
    });
    expect(rows[0]?.exercises).toEqual([
      {
        exerciseId: 'e1',
        order: 0,
        sets: [
          { type: 'normal', targetWeightKg: 45.359237, targetReps: 5 },
          { type: 'normal', targetDurationSec: 90 },
        ],
      },
    ]);
    expect(await db.syncQueue.count()).toBe(0);
  });
});
