import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { useSettingsStore } from '../../../store/settings';
import type { Exercise, ExerciseType, Workout, WorkoutSet } from '../../../types/domain';
import { ExerciseDetail } from '../ExerciseDetail';

vi.mock('../../../hooks/useElementWidth', () => ({
  useElementWidth: () => [{ current: null }, 360],
}));

const YEAR = new Date().getFullYear();

function exerciseOf(type: ExerciseType): Exercise {
  return {
    id: 'ex',
    userId: 'u1',
    name: 'Test Exercise',
    muscleGroup: 'chest',
    equipment: 'barbell',
    type,
    isCustom: true,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

function set(id: string, order: number, over: Partial<WorkoutSet> = {}): WorkoutSet {
  return { id, order, type: 'normal', completed: true, completedAt: 1, ...over };
}

function workout(id: string, startedAt: number, sets: WorkoutSet[]): Workout {
  return {
    id,
    userId: 'u1',
    name: id,
    startedAt,
    endedAt: startedAt + 60000,
    status: 'completed',
    createdAt: startedAt,
    updatedAt: startedAt,
    exercises: [{ id: `${id}-we`, exerciseId: 'ex', order: 0, sets }],
  };
}

async function setup(type: ExerciseType, workouts: Workout[] = []) {
  await db.exercises.put(exerciseOf(type));
  await db.workouts.bulkPut(workouts);
}

async function renderRecords() {
  render(
    <MemoryRouter initialEntries={['/exercises/ex']}>
      <Routes>
        <Route path="/exercises/:id" element={<ExerciseDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole('radio', { name: 'Records' }));
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'kg' }, hydrated: true });
});

describe('Records tab', () => {
  it('shows weight, e1RM and volume cards for weight_reps with date and link', async () => {
    await setup('weight_reps', [
      workout('w1', new Date(YEAR, 2, 3, 12).getTime(), [
        set('a', 0, { weightKg: 100, reps: 5 }),
        set('b', 1, { weightKg: 60, reps: 20 }),
      ]),
    ]);
    await renderRecords();
    const weight = (await screen.findByText('Best weight')).closest('a');
    expect(weight).toHaveAttribute('href', '/history/w1');
    expect(within(weight as HTMLElement).getByText('100 kg')).toBeInTheDocument();
    expect(within(weight as HTMLElement).getByText('100 kg × 5 · Mar 3')).toBeInTheDocument();
    expect(screen.getByText('Best est. 1RM').closest('a')).toHaveAttribute('href', '/history/w1');
    const volume = screen.getByText('Best set volume').closest('a') as HTMLElement;
    expect(within(volume).getByText('1,200 kg')).toBeInTheDocument();
    expect(within(volume).getByText('60 kg × 20 · Mar 3')).toBeInTheDocument();
    expect(screen.queryByText('Most reps')).not.toBeInTheDocument();
  });

  it('prefixes + and adds Most reps for weighted_bodyweight', async () => {
    await setup('weighted_bodyweight', [
      workout('w2', new Date(YEAR, 0, 9, 12).getTime(), [set('a', 0, { weightKg: 20, reps: 8 })]),
    ]);
    await renderRecords();
    const weight = (await screen.findByText('Best weight')).closest('a') as HTMLElement;
    expect(within(weight).getByText('+20 kg')).toBeInTheDocument();
    expect(within(weight).getByText('+20 kg × 8 · Jan 9')).toBeInTheDocument();
    const reps = screen.getByText('Most reps').closest('a') as HTMLElement;
    expect(within(reps).getByText('8 reps')).toBeInTheDocument();
    expect(reps).toHaveAttribute('href', '/history/w2');
  });

  it('shows only Most reps for bodyweight_reps', async () => {
    await setup('bodyweight_reps', [
      workout('w3', new Date(YEAR, 4, 1, 12).getTime(), [set('a', 0, { reps: 15 })]),
    ]);
    await renderRecords();
    const reps = (await screen.findByText('Most reps')).closest('a') as HTMLElement;
    expect(within(reps).getByText('15 reps')).toBeInTheDocument();
    expect(within(reps).getByText('15 reps · May 1')).toBeInTheDocument();
    expect(screen.queryByText('Best weight')).not.toBeInTheDocument();
  });

  it('shows Longest set for duration', async () => {
    await setup('duration', [
      workout('w4', new Date(YEAR, 5, 2, 12).getTime(), [set('a', 0, { durationSec: 90 })]),
    ]);
    await renderRecords();
    const card = (await screen.findByText('Longest set')).closest('a') as HTMLElement;
    expect(within(card).getAllByText(/1:30/)).toHaveLength(2);
    expect(card).toHaveAttribute('href', '/history/w4');
  });

  it('shows the empty state without working sets', async () => {
    await setup('weight_reps', [
      workout('w5', new Date(YEAR, 2, 3, 12).getTime(), [
        set('a', 0, { type: 'warmup', weightKg: 50, reps: 10 }),
      ]),
    ]);
    await renderRecords();
    expect(await screen.findByText('No records yet')).toBeInTheDocument();
    expect(
      screen.getByText('Complete a working set to set your first record.'),
    ).toBeInTheDocument();
  });
});

describe('Chart tab', () => {
  it('lazy-loads the mini chart and links to Progress', async () => {
    await setup('weight_reps', [
      workout('w6', new Date(YEAR, 2, 3, 12).getTime(), [set('a', 0, { weightKg: 100, reps: 5 })]),
    ]);
    render(
      <MemoryRouter initialEntries={['/exercises/ex']}>
        <Routes>
          <Route path="/exercises/:id" element={<ExerciseDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('radio', { name: 'Chart' }));
    expect(
      await screen.findByText(
        'One workout so far. Log another to see a trend.',
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Weight chart, 1 workout/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View progress' })).toHaveAttribute(
      'href',
      '/progress?exercise=ex',
    );
  });

  it('shows the empty state when there are no workouts', async () => {
    await setup('weight_reps');
    render(
      <MemoryRouter initialEntries={['/exercises/ex']}>
        <Routes>
          <Route path="/exercises/:id" element={<ExerciseDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('radio', { name: 'Chart' }));
    expect(await screen.findByText('No workouts yet', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a workout' })).toHaveAttribute('href', '/');
  });
});
