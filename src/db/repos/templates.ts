import Dexie, { liveQuery, type Observable } from 'dexie';
import { db } from '../schema';
import { enqueue, runWrite } from './outbox';
import { requireUserId } from './meta';
import { normalizeName } from '../../lib/exercises';
import { newId } from '../../lib/ids';
import {
  compareTemplates,
  duplicateName,
  normalizeTemplateExercises,
  validateTemplateInput,
  type TemplateFieldError,
  type TemplateInput,
} from '../../lib/templates';
import type { Template } from '../../types/domain';

export type TemplateWriteResult =
  { ok: true; template: Template } | { ok: false; error: TemplateFieldError };

async function put(t: Template): Promise<void> {
  await db.templates.put(t);
  await enqueue('templates', t.id, 'upsert', t);
}

export async function listTemplates(): Promise<Template[]> {
  const rows = await db.templates.toArray();
  return rows.sort(compareTemplates);
}

export function observeTemplates(): Observable<Template[]> {
  return liveQuery(listTemplates);
}

export function getTemplate(id: string): Promise<Template | undefined> {
  return db.templates.get(id);
}

export async function saveTemplate(
  input: TemplateInput & { id?: string },
): Promise<TemplateWriteResult> {
  const userId = await requireUserId();
  const name = normalizeName(input.name);
  const exercises = normalizeTemplateExercises(input.exercises);
  const error = validateTemplateInput({ name, exercises });
  if (error) return { ok: false, error };
  return runWrite(['templates'], async (): Promise<TemplateWriteResult> => {
    const now = Date.now();
    const existing = input.id === undefined ? undefined : await db.templates.get(input.id);
    if (existing) {
      if (
        existing.name === name &&
        JSON.stringify(normalizeTemplateExercises(existing.exercises)) === JSON.stringify(exercises)
      ) {
        return { ok: true, template: existing };
      }
      const next: Template = { ...existing, name, exercises, updatedAt: now };
      await put(next);
      return { ok: true, template: next };
    }
    const created: Template = {
      id: input.id ?? newId(),
      userId,
      name,
      exercises,
      createdAt: now,
      updatedAt: now,
    };
    await put(created);
    return { ok: true, template: created };
  });
}

export async function duplicateTemplate(id: string): Promise<Template> {
  const userId = await requireUserId();
  return runWrite(['templates'], async () => {
    const source = await db.templates.get(id);
    if (!source) throw new Error('Template not found');
    const now = Date.now();
    const copy: Template = {
      id: newId(),
      userId,
      name: duplicateName(source.name),
      exercises: structuredClone(source.exercises),
      createdAt: now,
      updatedAt: now,
    };
    await put(copy);
    return copy;
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await runWrite(['templates'], async () => {
    if ((await db.templates.get(id)) === undefined) return;
    await db.templates.delete(id);
    await enqueue('templates', id, 'delete');
  });
}

export async function markTemplateUsed(id: string, at: number): Promise<void> {
  const tx = Dexie.currentTransaction;
  if (!tx || !tx.storeNames.includes('templates') || !tx.storeNames.includes('syncQueue')) {
    throw new Error(
      'markTemplateUsed must run inside a transaction that includes templates and syncQueue',
    );
  }
  const row = await db.templates.get(id);
  if (!row) return;
  await put({ ...row, lastUsedAt: at, updatedAt: at });
}
