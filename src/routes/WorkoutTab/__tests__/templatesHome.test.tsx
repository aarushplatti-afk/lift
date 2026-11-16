import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '../../../components/ui/toastStore';
import { createExercise } from '../../../db/repos/exercises';
import { ensureSeeded } from '../../../db/seed';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { getTemplate, listTemplates, saveTemplate } from '../../../db/repos/templates';
import { db } from '../../../db/schema';
import { initActiveWorkoutStore, useActiveWorkoutStore } from '../../../store/activeWorkout';
import { useSettingsStore } from '../../../store/settings';
import type { Template, Workout } from '../../../types/domain';
import { WorkoutHome } from '../WorkoutHome';

let stopStore: (() => void) | undefined;

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

async function seedTemplate(exerciseId: string, name = 'Push Day'): Promise<Template> {
  const r = await saveTemplate({
    name,
    exercises: [
      {
        exerciseId,
        order: 0,
        sets: [
          { type: 'normal', targetWeightKg: 60, targetReps: 8 },
          { type: 'normal', targetWeightKg: 60, targetReps: 6 },
        ],
      },
    ],
  });
  if (!r.ok) throw new Error('seed failed');
  return r.template;
}

async function startStore(): Promise<void> {
  stopStore = initActiveWorkoutStore();
  await waitFor(() => {
    expect(useActiveWorkoutStore.getState().status).toBe('ready');
  });
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<WorkoutHome />} />
        <Route path="/workout/active" element={<div>Active screen</div>} />
        <Route path="/templates/new" element={<div>New template screen</div>} />
        <Route path="/templates/:id/edit" element={<div>Edit template screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useToastStore.getState().dismiss();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'lb' }, hydrated: true });
});

afterEach(() => {
  stopStore?.();
  stopStore = undefined;
});

describe('Workout home templates', () => {
  it('shows the empty state and navigates to new', async () => {
    await startStore();
    const user = userEvent.setup();
    renderHome();
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    expect(
      screen.getByText('Save a routine you repeat, like Push Day, and start it in one tap.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create template' }));
    expect(await screen.findByText('New template screen')).toBeInTheDocument();
  });

  it('adds the starter templates from the empty state', async () => {
    await ensureSeeded('u1');
    await startStore();
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole('button', { name: 'Add starter templates' }));
    expect(await screen.findByRole('button', { name: 'Push Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pull Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leg Day' })).toBeInTheDocument();
    expect(screen.queryByText('No templates yet')).not.toBeInTheDocument();
  });

  it('lists templates with summary and last used text', async () => {
    const bench = await seedBench();
    await seedTemplate(bench);
    await startStore();
    renderHome();
    const row = await screen.findByRole('button', { name: 'Push Day' });
    expect(within(row).getByText('Bench Press')).toBeInTheDocument();
    expect(within(row).getByText('Never used')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Push Day options' })).toBeInTheDocument();
  });

  it('starts a workout prefilled from the template', async () => {
    const bench = await seedBench();
    const t = await seedTemplate(bench);
    await startStore();
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole('button', { name: 'Push Day' }));
    const sheet = await screen.findByRole('dialog', { name: 'Push Day' });
    expect(within(sheet).getByText('2 sets')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Start Workout' }));
    expect(await screen.findByText('Active screen')).toBeInTheDocument();
    const w = useActiveWorkoutStore.getState().workout;
    expect(w?.templateId).toBe(t.id);
    expect(w?.exercises[0]?.sets.map((s) => [s.reps, s.completed])).toEqual([
      [8, false],
      [6, false],
    ]);
    expect(w?.exercises[0]?.sets[0]?.weightKg).toBe(60);
    const updated = await getTemplate(t.id);
    expect(updated?.lastUsedAt).toBeDefined();
  });

  it('blocks start while a workout is active and Resume navigates', async () => {
    const bench = await seedBench();
    await seedTemplate(bench);
    await startStore();
    await useActiveWorkoutStore.getState().start();
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole('button', { name: 'Push Day' }));
    await user.click(await screen.findByRole('button', { name: 'Start Workout' }));
    const dialog = await screen.findByRole('dialog', { name: 'Workout in progress' });
    expect(
      within(dialog).getByText('Finish or discard your current workout before starting another.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Resume workout' }));
    expect(await screen.findByText('Active screen')).toBeInTheDocument();
    expect(useActiveWorkoutStore.getState().workout?.templateId).toBeUndefined();
  });

  it('duplicates a template with a toast and a new row', async () => {
    const bench = await seedBench();
    await seedTemplate(bench);
    await startStore();
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole('button', { name: 'Push Day options' }));
    await user.click(await screen.findByRole('button', { name: 'Duplicate' }));
    expect(await screen.findByRole('button', { name: 'Copy of Push Day' })).toBeInTheDocument();
    expect(useToastStore.getState().toast?.message).toBe('Duplicated as “Copy of Push Day”');
    expect(await listTemplates()).toHaveLength(2);
  });

  it('deletes after confirmation and leaves workouts untouched', async () => {
    const bench = await seedBench();
    const t = await seedTemplate(bench);
    const logged: Workout = {
      id: 'w-old',
      userId: 'u1',
      name: 'Old',
      startedAt: 1,
      endedAt: 2,
      status: 'completed',
      templateId: t.id,
      exercises: [],
      createdAt: 1,
      updatedAt: 1,
    };
    await db.workouts.put(logged);
    await startStore();
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole('button', { name: 'Push Day options' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this template?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete template' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Push Day' })).not.toBeInTheDocument();
    });
    expect(useToastStore.getState().toast?.message).toBe('Template deleted');
    expect(await db.workouts.get('w-old')).toEqual(logged);
  });
});
