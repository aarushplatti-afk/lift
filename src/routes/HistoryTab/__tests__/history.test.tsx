import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '../../../components/ui/toastStore';
import { createExercise } from '../../../db/repos/exercises';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { useSettingsStore } from '../../../store/settings';
import type { Workout } from '../../../types/domain';
import { HistoryList } from '../HistoryList';
import { WorkoutDetail } from '../WorkoutDetail';

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

function completed(id: string, name: string, startedAt: number, exerciseId: string): Workout {
  return {
    id,
    userId: 'u1',
    name,
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
            id: `${id}-s1`,
            order: 0,
            type: 'normal',
            weightKg: 100,
            reps: 5,
            completed: true,
            completedAt: startedAt,
            isPR: true,
          },
        ],
      },
    ],
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history" element={<HistoryList />} />
        <Route path="/history/:id" element={<WorkoutDetail />} />
        <Route path="/history/:id/edit" element={<div>Editor screen</div>} />
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

describe('History list', () => {
  it('shows the empty state', async () => {
    renderAt('/history');
    expect(await screen.findByText('No workouts yet')).toBeInTheDocument();
    expect(screen.getByText('Your finished workouts will show up here.')).toBeInTheDocument();
  });

  it('groups rows under month headings, newest first', async () => {
    const bench = await seedBench();
    await db.workouts.bulkPut([
      completed('a', 'Older', new Date(2026, 9, 5, 18).getTime(), bench),
      completed('b', 'Newer', new Date(2026, 10, 12, 18).getTime(), bench),
    ]);
    renderAt('/history');
    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['November 2026', 'October 2026']);
    const row = screen.getByRole('link', { name: 'Newer, Thu, Nov 12' });
    expect(row).toHaveAttribute('href', '/history/b');
    expect(within(row).getByText('Thu, Nov 12 · 45m')).toBeInTheDocument();
    expect(within(row).getByText('1,102 lb · 1 exercise')).toBeInTheDocument();
    expect(within(row).getByLabelText('1 personal record')).toBeInTheDocument();
  });
});

describe('Workout detail', () => {
  it('renders stats, sets and a trophy', async () => {
    const bench = await seedBench();
    await db.workouts.put(
      completed('b', 'Push Day', new Date(2026, 10, 12, 18, 5).getTime(), bench),
    );
    renderAt('/history/b');
    expect(await screen.findByRole('heading', { name: 'Push Day', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Thu, Nov 12, 2026 · 6:05 PM')).toBeInTheDocument();
    expect(screen.getByText('Duration').parentElement).toHaveTextContent('45m');
    expect(screen.getByRole('link', { name: 'Bench Press' })).toHaveAttribute(
      'href',
      `/exercises/${bench}`,
    );
    expect(screen.getByText('220.5 lb × 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Personal record')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/history/b/edit');
  });

  it('shows not found for a missing workout', async () => {
    renderAt('/history/nope');
    expect(await screen.findByText('Workout not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to history' })).toBeInTheDocument();
  });

  it('deletes after confirmation and returns to the list', async () => {
    const bench = await seedBench();
    await db.workouts.put(completed('b', 'Push Day', new Date(2026, 10, 12, 18).getTime(), bench));
    const user = userEvent.setup();
    renderAt('/history/b');
    await user.click(await screen.findByRole('button', { name: 'Delete Workout' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this workout?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete workout' }));
    expect(await screen.findByText('No workouts yet')).toBeInTheDocument();
    expect(useToastStore.getState().toast?.message).toBe('Workout deleted');
    await waitFor(async () => {
      expect(await db.workouts.get('b')).toBeUndefined();
    });
  });
});
