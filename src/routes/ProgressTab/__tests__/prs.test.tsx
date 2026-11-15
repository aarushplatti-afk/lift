import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExercise } from '../../../db/repos/exercises';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { fromDisplay } from '../../../lib/units';
import { useProgressViewStore } from '../../../store/progressView';
import { useSettingsStore } from '../../../store/settings';
import type { MuscleGroup, Workout } from '../../../types/domain';
import { ProgressTab } from '../ProgressTab';

vi.mock('../../../hooks/useElementWidth', () => ({
  useElementWidth: () => [{ current: null }, 360],
}));

const DAY = 86_400_000;

async function seedExercise(name: string, muscleGroup: MuscleGroup): Promise<string> {
  const r = await createExercise({ name, muscleGroup, equipment: 'barbell', type: 'weight_reps' });
  if (!r.ok) throw new Error('seed failed');
  return r.exercise.id;
}

function workout(
  id: string,
  daysAgo: number,
  exerciseId: string,
  lb: number,
  reps: number,
): Workout {
  const startedAt = Date.now() - daysAgo * DAY;
  return {
    id,
    userId: 'u1',
    name: `Session ${id}`,
    startedAt,
    endedAt: startedAt + 45 * 60000,
    status: 'completed',
    createdAt: startedAt,
    updatedAt: startedAt,
    exercises: [
      {
        id: `${id}-we`,
        exerciseId,
        order: 0,
        sets: [
          {
            id: `${id}-s0`,
            order: 0,
            type: 'normal',
            weightKg: fromDisplay(lb, 'lb'),
            reps,
            completed: true,
            completedAt: startedAt,
          },
        ],
      },
    ],
  };
}

async function seed(): Promise<{ bench: string; squat: string }> {
  const bench = await seedExercise('Barbell Bench Press', 'chest');
  const squat = await seedExercise('Back Squat', 'quads');
  await db.workouts.bulkPut([workout('w1', 20, bench, 225, 5), workout('w2', 10, squat, 315, 3)]);
  return { bench, squat };
}

function renderTab() {
  return render(
    <MemoryRouter initialEntries={['/progress']}>
      <Routes>
        <Route path="/progress" element={<ProgressTab />} />
        <Route path="/history/:id" element={<div>History detail</div>} />
        <Route path="/" element={<div>Workout home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  cleanup();
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'lb' }, hydrated: true });
  useProgressViewStore.setState({
    view: 'prs',
    exerciseId: undefined,
    metric: undefined,
    prsQuery: '',
    prsMuscle: 'all',
  });
});

describe('PRs view', () => {
  it('renders groups with values and dates', async () => {
    await seed();
    renderTab();
    const bench = await screen.findByRole('region', { name: 'Barbell Bench Press' });
    expect(within(bench).getByText('Chest')).toBeInTheDocument();
    expect(within(bench).getByText('Best weight')).toBeInTheDocument();
    expect(within(bench).getByText('225 lb')).toBeInTheDocument();
    expect(within(bench).getAllByText(/225 lb × 5 · /).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Back Squat' })).toBeInTheDocument();
  });

  it('filters by search and muscle chip', async () => {
    await seed();
    renderTab();
    await screen.findByRole('region', { name: 'Back Squat' });
    await userEvent.type(screen.getByRole('searchbox'), 'bench');
    expect(screen.queryByRole('region', { name: 'Back Squat' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Barbell Bench Press' })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.click(screen.getByRole('radio', { name: 'Quads' }));
    expect(screen.queryByRole('region', { name: 'Barbell Bench Press' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Back Squat' })).toBeInTheDocument();
  });

  it('shows the empty state with a start link', async () => {
    renderTab();
    expect(await screen.findByText('No records yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start a workout' }));
    expect(screen.getByText('Workout home')).toBeInTheDocument();
  });

  it('shows no-match and Clear filters restores the list', async () => {
    await seed();
    renderTab();
    await screen.findByRole('region', { name: 'Back Squat' });
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No matching records')).toBeInTheDocument();
    expect(screen.getByText('Try another search or muscle group.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('region', { name: 'Back Squat' })).toBeInTheDocument();
    expect(useProgressViewStore.getState().prsQuery).toBe('');
    expect(useProgressViewStore.getState().prsMuscle).toBe('all');
  });

  it('links each record to its workout', async () => {
    await seed();
    renderTab();
    const squat = await screen.findByRole('region', { name: 'Back Squat' });
    const link = within(squat).getAllByRole('link', { name: /Best weight/ })[0];
    expect(link).toHaveAttribute('href', '/history/w2');
    await userEvent.click(link as HTMLElement);
    expect(screen.getByText('History detail')).toBeInTheDocument();
  });

  it('header link opens the Exercises view with that exercise selected', async () => {
    const { squat } = await seed();
    renderTab();
    await userEvent.click(await screen.findByRole('link', { name: 'Back Squat progress' }));
    expect(
      await screen.findByRole('radio', { name: 'Exercises', checked: true }),
    ).toBeInTheDocument();
    expect(useProgressViewStore.getState().exerciseId).toBe(squat);
    expect(useProgressViewStore.getState().view).toBe('exercises');
  });
});
