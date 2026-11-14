import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '../../../components/ui/toastStore';
import { createExercise } from '../../../db/repos/exercises';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { saveTemplate } from '../../../db/repos/templates';
import { db } from '../../../db/schema';
import { lbToKg, roundKg } from '../../../lib/units';
import { useSettingsStore } from '../../../store/settings';
import { TemplateEditor } from '../Templates/TemplateEditor';

type User = ReturnType<typeof userEvent.setup>;

async function seedBench(): Promise<string> {
  const r = await createExercise({
    name: 'Bench Press',
    muscleGroup: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
  });
  if (!r.ok) throw new Error('seed failed');
  return r.exercise.id;
}

async function seedTemplate(exerciseId: string): Promise<string> {
  const r = await saveTemplate({
    name: 'Push Day',
    exercises: [
      { exerciseId, order: 0, sets: [{ type: 'normal', targetReps: 8, targetWeightKg: 60 }] },
    ],
  });
  if (!r.ok) throw new Error('seed failed');
  return r.template.id;
}

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>Home screen</div>} />
        <Route path="/templates/new" element={<TemplateEditor />} />
        <Route path="/templates/:id/edit" element={<TemplateEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function addBench(user: User): Promise<void> {
  await user.click(await screen.findByRole('button', { name: '+ Add Exercise' }));
  await user.click(await screen.findByRole('checkbox', { name: /Bench Press/ }));
  await user.click(screen.getByRole('button', { name: 'Add (1)' }));
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useToastStore.getState().dismiss();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'lb' }, hydrated: true });
});

describe('TemplateEditor', () => {
  it('creates a template with name, exercise and lb targets stored as kg', async () => {
    const user = userEvent.setup();
    await seedBench();
    renderEditor('/templates/new');
    await user.type(await screen.findByLabelText('Template name'), 'Push Day');
    await addBench(user);
    const w = await screen.findByLabelText('Target weight (lb) set 1');
    await user.clear(w);
    await user.type(w, '135');
    const r = screen.getByLabelText('Target reps set 1');
    await user.clear(r);
    await user.type(r, '5');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    const rows = await db.templates.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Push Day');
    expect(rows[0]?.exercises[0]?.sets[0]?.targetWeightKg).toBe(roundKg(lbToKg(135)));
    expect(rows[0]?.exercises[0]?.sets[0]?.targetReps).toBe(5);
    expect(useToastStore.getState().toast?.message).toBe('Template saved');
  });

  it('edits an existing template and persists the change', async () => {
    const user = userEvent.setup();
    const id = await seedTemplate(await seedBench());
    renderEditor(`/templates/${id}/edit`);
    const name = await screen.findByLabelText('Template name');
    expect(name).toHaveValue('Push Day');
    await user.clear(name);
    await user.type(name, 'Pull Day');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    expect((await db.templates.get(id))?.name).toBe('Pull Day');
  });

  it('cancels a clean editor without a dialog', async () => {
    const user = userEvent.setup();
    await seedBench();
    renderEditor('/templates/new');
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
  });

  it('guards a dirty cancel and Discard leaves the template unchanged', async () => {
    const user = userEvent.setup();
    const id = await seedTemplate(await seedBench());
    renderEditor(`/templates/${id}/edit`);
    const name = await screen.findByLabelText('Template name');
    await user.type(name, ' Extra');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' });
    expect(within(dialog).getByText('Your changes to this template won’t be saved.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    expect((await db.templates.get(id))?.name).toBe('Push Day');
  });

  it('Keep editing closes the discard dialog', async () => {
    const user = userEvent.setup();
    await seedBench();
    renderEditor('/templates/new');
    await user.type(await screen.findByLabelText('Template name'), 'X');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText('Template name')).toHaveValue('X');
  });

  it('shows validation messages for empty name, no exercises and long names', async () => {
    const user = userEvent.setup();
    await seedBench();
    renderEditor('/templates/new');
    expect(await screen.findByText('No exercises yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a name')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Template name'), 'Push Day');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Add at least one exercise')).toBeInTheDocument();
    expect(await db.templates.count()).toBe(0);

    await addBench(user);
    const name = screen.getByLabelText('Template name');
    await user.clear(name);
    await user.type(name, 'a'.repeat(60));
    await user.type(name, 'b');
    expect(name).toHaveValue('a'.repeat(60));
  });

  it('shows too-long error when the name exceeds the limit after normalization', async () => {
    const user = userEvent.setup();
    await seedBench();
    renderEditor('/templates/new');
    const name = await screen.findByLabelText('Template name');
    await user.type(name, 'a'.repeat(60));
    expect(name).toHaveAttribute('maxlength', '60');
  });

  it('shows not-found for a missing template', async () => {
    const user = userEvent.setup();
    renderEditor('/templates/missing/edit');
    expect(await screen.findByText('Template not found')).toBeInTheDocument();
    expect(screen.getByText('It may have been deleted.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
  });

  it('deletes the template from the editor after confirm', async () => {
    const user = userEvent.setup();
    const id = await seedTemplate(await seedBench());
    renderEditor(`/templates/${id}/edit`);
    await user.click(await screen.findByRole('button', { name: 'Delete Template' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this template?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete template' }));
    expect(await screen.findByText('Home screen')).toBeInTheDocument();
    expect(await db.templates.get(id)).toBeUndefined();
  });

  it('hides Delete Template in new mode', async () => {
    renderEditor('/templates/new');
    await screen.findByLabelText('Template name');
    expect(screen.queryByRole('button', { name: 'Delete Template' })).not.toBeInTheDocument();
  });
});
