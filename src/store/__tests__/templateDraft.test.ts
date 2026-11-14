import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { setOwner } from '../../db/repos/meta';
import { useToastStore } from '../../components/ui/toastStore';
import { emptyDraft } from '../../lib/templates';
import { useTemplateDraftStore } from '../templateDraft';

const store = () => useTemplateDraftStore.getState();

function undo(): void {
  useToastStore.getState().toast?.onAction?.();
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
  useToastStore.setState({ toast: null });
  store().clear();
  store().load(emptyDraft(1));
});

afterEach(() => {
  store().clear();
});

describe('templateDraft store', () => {
  it('tracks dirtiness against the baseline', () => {
    expect(store().isDirty()).toBe(false);
    store().setName('Push');
    expect(store().isDirty()).toBe(true);
    store().setName('');
    expect(store().isDirty()).toBe(false);
    store().addExercises(['a']);
    expect(store().isDirty()).toBe(true);
  });

  it('undoes a set removal within the same load', () => {
    store().addExercises(['a']);
    const we = store().draft?.exercises[0];
    if (!we) throw new Error('missing');
    store().addSet(we.id);
    const setId = store().draft?.exercises[0]?.sets[0]?.id ?? '';
    store().removeSet(we.id, setId);
    expect(store().draft?.exercises[0]?.sets).toHaveLength(1);
    undo();
    expect(store().draft?.exercises[0]?.sets).toHaveLength(2);
  });

  it('ignores an old Undo after a new load', () => {
    store().addExercises(['a']);
    const we = store().draft?.exercises[0];
    if (!we) throw new Error('missing');
    store().removeExercise(we.id, 'Bench');
    expect(useToastStore.getState().toast?.message).toBe('Removed Bench');
    store().load(emptyDraft(2));
    undo();
    expect(store().draft?.exercises).toHaveLength(0);
  });

  it('re-baselines and keeps the saved id after save', async () => {
    store().setName('Push');
    store().addExercises(['a']);
    const result = await store().save();
    expect(result.ok).toBe(true);
    expect(store().isDirty()).toBe(false);
    const id = store().draft?.id;
    expect(id).toBeTruthy();
    expect(await db.templates.count()).toBe(1);
    store().setName('Push 2');
    expect(store().isDirty()).toBe(true);
    await store().save();
    expect(await db.templates.count()).toBe(1);
    expect(store().draft?.id).toBe(id);
  });

  it('stays dirty and returns the error when validation fails', async () => {
    store().addExercises(['a']);
    const result = await store().save();
    expect(result).toEqual({ ok: false, error: { field: 'name', code: 'required' } });
    expect(store().isDirty()).toBe(true);
  });
});
