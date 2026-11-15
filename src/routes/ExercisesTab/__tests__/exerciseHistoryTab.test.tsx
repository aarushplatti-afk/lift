import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { useSettingsStore } from '../../../store/settings';
import type { Exercise, Workout, WorkoutSet } from '../../../types/domain';
import { ExerciseDetail } from '../ExerciseDetail';

const exercise: Exercise = {
  id: 'bench',
  userId: 'u1',
  name: 'Bench Press',
  muscleGroup: 'chest',
  equipment: 'barbell',
  type: 'weight_reps',
  isCustom: true,
  archived: false,
  createdAt: 1,
  updatedAt: 1,
};

function set(id: string, order: number, over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id,
    order,
    type: 'normal',
    weightKg: 100,
    reps: 5,
    completed: true,
    completedAt: 1,
    ...over,
  };
}

function workout(
  id: string,
  name: string,
  startedAt: number,
  sets: WorkoutSet[],
  status: Workout['status'] = 'completed',
): Workout {
  return {
    id,
    userId: 'u1',
    name,
    startedAt,
    endedAt: status === 'completed' ? startedAt + 60000 : undefined,
    status,
    createdAt: startedAt,
    updatedAt: startedAt,
    exercises: [{ id: `${id}-we`, exerciseId: 'bench', order: 0, sets }],
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/exercises/bench']}>
      <Routes>
        <Route path="/exercises/:id" element={<ExerciseDetail />} />
        <Route path="/history/:id" element={<div>Workout screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  await db.exercises.put(exercise);
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'kg' }, hydrated: true });
});

describe('ExerciseDetail history tab', () => {
  it('shows the empty state without history', async () => {
    renderDetail();
    expect(await screen.findByText('No history yet')).toBeInTheDocument();
    expect(screen.getByText('Logged sets will appear here.')).toBeInTheDocument();
  });

  it('lists sessions newest first with set lines and trophies, skipping incomplete data', async () => {
    await db.workouts.bulkPut([
      workout('old', 'Older', new Date(2026, 9, 5, 18).getTime(), [set('o1', 0)]),
      workout('new', 'Newer', new Date(2026, 10, 12, 18).getTime(), [
        set('n1', 0, { type: 'warmup', weightKg: 60, reps: 8 }),
        set('n2', 1, { weightKg: 105, reps: 3, isPR: true }),
        set('n3', 2, { weightKg: 90, reps: 1, completed: false }),
      ]),
      workout(
        'live',
        'Live',
        new Date(2026, 10, 13, 18).getTime(),
        [set('l1', 0, { weightKg: 200 })],
        'in_progress',
      ),
    ]);
    renderDetail();
    const links = await screen.findAllByRole('link', { name: /· (Newer|Older)/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/history/new');
    expect(links[1]).toHaveAttribute('href', '/history/old');
    expect(screen.queryByText(/Live/)).not.toBeInTheDocument();

    const newer = within(links[0] as HTMLElement);
    expect(newer.getByText('Thu, Nov 12 · Newer')).toBeInTheDocument();
    expect(newer.getByText('W')).toBeInTheDocument();
    expect(newer.getByText('60 × 8')).toBeInTheDocument();
    expect(newer.getByText('105 × 3')).toBeInTheDocument();
    expect(newer.queryByText('90 × 1')).not.toBeInTheDocument();
    expect(newer.getAllByLabelText('Personal record')).toHaveLength(2);
    expect(within(links[1] as HTMLElement).queryByLabelText('Personal record')).toBeNull();
  });

  it('opens the workout detail route on tap', async () => {
    await db.workouts.put(
      workout('w1', 'Push', new Date(2026, 10, 12, 18).getTime(), [set('a', 0)]),
    );
    renderDetail();
    await userEvent.click(await screen.findByRole('link', { name: /Push/ }));
    expect(await screen.findByText('Workout screen')).toBeInTheDocument();
  });
});
