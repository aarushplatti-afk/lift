import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '../../../components/ui/toastStore';
import { createExercise } from '../../../db/repos/exercises';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { lbToKg } from '../../../lib/units';
import { initActiveWorkoutStore, useActiveWorkoutStore } from '../../../store/activeWorkout';
import { useSettingsStore } from '../../../store/settings';
import { useWorkoutEditStore } from '../../../store/workoutEditDraft';
import type { Workout } from '../../../types/domain';
import { HistoryList } from '../HistoryList';
import { WorkoutDetail } from '../WorkoutDetail';
import { WorkoutEditor } from '../WorkoutEditor';

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

let stopStore: (() => void) | undefined;

afterEach(() => {
  stopStore?.();
  stopStore = undefined;
});

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useToastStore.getState().dismiss();
  useWorkoutEditStore.getState().clear();
  useActiveWorkoutStore.setState({ workout: null, status: 'loading' });
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
    const row = screen.getByRole('link', { name: 'Newer, Thu, Nov 12, 1 PR, 1,102 lb' });
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

function bench(
  id: string,
  name: string,
  startedAt: number,
  exerciseId: string,
  weightKg: number,
  isPR: boolean,
): Workout {
  const w = completed(id, name, startedAt, exerciseId);
  const block = w.exercises[0];
  if (!block) throw new Error('fixture');
  block.sets = [
    {
      id: `${id}-s1`,
      order: 0,
      type: 'normal',
      weightKg,
      reps: 5,
      completed: true,
      completedAt: startedAt,
      ...(isPR ? { isPR: true } : {}),
    },
  ];
  return w;
}

function renderFull(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history" element={<HistoryList />} />
        <Route path="/history/:id" element={<WorkoutDetail />} />
        <Route path="/history/:id/edit" element={<WorkoutEditor />} />
        <Route path="/workout/active" element={<div>Active screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function rowFor(name: string): HTMLElement {
  return screen.getByRole('link', { name: new RegExp(`^${name},`) });
}

function inProgress(id: string, name: string, exerciseId: string): Workout {
  const { endedAt: _ended, ...rest } = completed(id, name, Date.now() - 1000, exerciseId);
  void _ended;
  return { ...rest, status: 'in_progress' };
}

async function startStore(): Promise<void> {
  stopStore = initActiveWorkoutStore();
  await waitFor(() => {
    expect(useActiveWorkoutStore.getState().status).toBe('ready');
  });
}

describe('History list rows', () => {
  it('formats date, duration, grouped volume, exercise count and PR badge only with PRs', async () => {
    const benchId = await seedBench();
    const big = completed('big', 'Big Day', new Date(2026, 10, 12, 18).getTime(), benchId);
    const block = big.exercises[0];
    if (!block) throw new Error('fixture');
    block.sets = [
      {
        id: 'big-s1',
        order: 0,
        type: 'normal',
        weightKg: lbToKg(12345.6),
        reps: 1,
        completed: true,
        isPR: true,
      },
    ];
    big.exercises = [
      block,
      { ...block, id: 'big-we2', order: 1, sets: [] },
      { ...block, id: 'big-we3', order: 2, sets: [] },
    ];
    const plain = bench('plain', 'Plain', new Date(2026, 10, 10, 18).getTime(), benchId, 50, false);
    await db.workouts.bulkPut([big, plain]);
    renderFull('/history');
    const bigRow = await screen.findByRole('link', {
      name: 'Big Day, Thu, Nov 12, 1 PR, 12,346 lb',
    });
    expect(within(bigRow).getByText('Thu, Nov 12 · 45m')).toBeInTheDocument();
    expect(within(bigRow).getByText('12,346 lb · 3 exercises')).toBeInTheDocument();
    expect(within(bigRow).getByLabelText('1 personal record')).toBeInTheDocument();
    const plainRow = rowFor('Plain');
    expect(within(plainRow).queryByLabelText(/personal record/)).not.toBeInTheDocument();
    expect(within(plainRow).getByText(/1 exercise$/)).toBeInTheDocument();
  });

  it('hides in-progress rows, local and remote', async () => {
    const benchId = await seedBench();
    await db.workouts.bulkPut([
      inProgress('live', 'Live Local', benchId),
      inProgress('rem', 'Live Remote', benchId),
      bench('done', 'Done One', new Date(2026, 10, 12, 18).getTime(), benchId, 50, false),
    ]);
    await db.meta.put({ key: 'activeWorkoutId', value: 'live' });
    renderFull('/history');
    expect(await screen.findByRole('link', { name: /^Done One,/ })).toBeInTheDocument();
    expect(screen.queryByText('Live Local')).not.toBeInTheDocument();
    expect(screen.queryByText('Live Remote')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('orders months newest first across a year boundary', async () => {
    const benchId = await seedBench();
    await db.workouts.bulkPut([
      bench('a', 'A', new Date(2025, 11, 31, 23, 59).getTime(), benchId, 50, false),
      bench('b', 'B', new Date(2026, 0, 1, 0, 30).getTime(), benchId, 50, false),
      bench('c', 'C', new Date(2026, 10, 2, 9).getTime(), benchId, 50, false),
    ]);
    renderFull('/history');
    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'November 2026',
      'January 2026',
      'December 2025',
    ]);
  });
});

describe('Editing history updates PR badges', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'kg' }, hydrated: true });
  });

  async function seedThree(): Promise<void> {
    const benchId = await seedBench();
    await db.workouts.bulkPut([
      bench('w1', 'W1', new Date(2026, 10, 3, 18).getTime(), benchId, 100, false),
      bench('w2', 'W2', new Date(2026, 10, 10, 18).getTime(), benchId, 110, true),
      bench('w3', 'W3', new Date(2026, 10, 12, 18).getTime(), benchId, 105, false),
    ]);
  }

  it('lowering W2 from 110 to 95 removes its trophy and moves the badge to W3', async () => {
    await seedThree();
    const user = userEvent.setup();
    renderFull('/history/w2/edit');
    const weight = await screen.findByLabelText('Weight (kg) set 1');
    await user.clear(weight);
    await user.type(weight, '95');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'W2', level: 1 })).toBeInTheDocument();
    expect(screen.queryByLabelText('Personal record')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'History' });
    expect(within(rowFor('W3')).getByLabelText('1 personal record')).toBeInTheDocument();
    expect(within(rowFor('W2')).queryByLabelText(/personal record/)).not.toBeInTheDocument();
    expect(within(rowFor('W1')).queryByLabelText(/personal record/)).not.toBeInTheDocument();
  });

  it('moving a workout into the previous month regroups it and re-flags by chronology', async () => {
    const benchId = await seedBench();
    await db.workouts.bulkPut([
      bench('w2', 'W2', new Date(2026, 10, 10, 18).getTime(), benchId, 110, false),
      bench('w1', 'W1', new Date(2026, 10, 11, 18).getTime(), benchId, 120, true),
      bench('w3', 'W3', new Date(2026, 10, 12, 18).getTime(), benchId, 105, false),
    ]);
    const user = userEvent.setup();
    renderFull('/history/w1/edit');
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2026-10-05' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'W1', level: 1 });
    await user.click(screen.getByRole('link', { name: 'Back' }));
    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['November 2026', 'October 2026']);
    const october = headings[1]?.parentElement;
    if (!october) throw new Error('missing October group');
    expect(within(october).getByRole('link', { name: /^W1, Mon, Oct 5/ })).toBeInTheDocument();
    expect(screen.queryAllByLabelText(/personal record/)).toHaveLength(0);
    expect((await db.workouts.get('w1'))?.startedAt).toBe(new Date(2026, 9, 5, 18).getTime());
  });

  it('deleting the PR workout moves the badge to the next best', async () => {
    await seedThree();
    const user = userEvent.setup();
    renderFull('/history/w2');
    await user.click(await screen.findByRole('button', { name: 'Delete Workout' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Delete this workout?' })).getByRole(
        'button',
        { name: 'Delete workout' },
      ),
    );
    await screen.findByRole('heading', { name: 'History' });
    await waitFor(() => {
      expect(within(rowFor('W3')).getByLabelText('1 personal record')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /^W2,/ })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/personal record/)).toHaveLength(1);
  });
});

describe('Editor save failures', () => {
  it('toasts and returns to the list when the workout vanished before save', async () => {
    const benchId = await seedBench();
    await db.workouts.put(
      bench('w1', 'W1', new Date(2026, 10, 3, 18).getTime(), benchId, 100, false),
    );
    const user = userEvent.setup();
    renderFull('/history/w1/edit');
    const name = await screen.findByLabelText('Workout name');
    await user.clear(name);
    await user.type(name, 'Renamed');
    await db.workouts.delete('w1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(useToastStore.getState().toast?.message).toBe(
      'This workout was deleted on another device.',
    );
    expect(await db.workouts.get('w1')).toBeUndefined();
  });

  it('toasts when saving throws and stays on the editor', async () => {
    const benchId = await seedBench();
    await db.workouts.put(
      bench('w1', 'W1', new Date(2026, 10, 3, 18).getTime(), benchId, 100, false),
    );
    const user = userEvent.setup();
    renderFull('/history/w1/edit');
    const name = await screen.findByLabelText('Workout name');
    await user.clear(name);
    await user.type(name, 'Renamed');
    useWorkoutEditStore.setState({ save: () => Promise.reject(new Error('quota')) });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(useToastStore.getState().toast?.message).toBe('Couldn’t save. Storage may be full.');
    });
    expect(screen.getByLabelText('Workout name')).toHaveValue('Renamed');
    expect((await db.workouts.get('w1'))?.name).toBe('W1');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('Repeat Workout and Save as Template', () => {
  it('is blocked while a workout is active; Resume navigates to the active screen', async () => {
    const benchId = await seedBench();
    await db.workouts.bulkPut([
      bench('w1', 'Push Day', new Date(2026, 10, 3, 18).getTime(), benchId, 100, false),
      inProgress('live', 'Live', benchId),
    ]);
    await db.meta.put({ key: 'activeWorkoutId', value: 'live' });
    await startStore();
    const user = userEvent.setup();
    renderFull('/history/w1');
    await user.click(await screen.findByRole('button', { name: 'Repeat Workout' }));
    const dialog = await screen.findByRole('dialog', { name: 'Workout in progress' });
    expect(useActiveWorkoutStore.getState().workout?.id).toBe('live');
    await user.click(within(dialog).getByRole('button', { name: 'Resume workout' }));
    expect(await screen.findByText('Active screen')).toBeInTheDocument();
    expect(await db.workouts.where('status').equals('in_progress').count()).toBe(1);
  });

  it('starts an active workout with past values, uncompleted, and no templateId', async () => {
    const benchId = await seedBench();
    const source = bench(
      'w1',
      'Push Day',
      new Date(2026, 10, 3, 18).getTime(),
      benchId,
      45.359237,
      true,
    );
    await db.workouts.put({ ...source, templateId: 'tpl-1', notes: 'felt good' });
    await startStore();
    const user = userEvent.setup();
    renderFull('/history/w1');
    await user.click(await screen.findByRole('button', { name: 'Repeat Workout' }));
    expect(await screen.findByText('Active screen')).toBeInTheDocument();
    const active = useActiveWorkoutStore.getState().workout;
    expect(active?.name).toBe('Push Day');
    expect(active?.status).toBe('in_progress');
    expect(active?.templateId).toBeUndefined();
    expect(active?.notes).toBeUndefined();
    expect(active?.id).not.toBe('w1');
    const sets = active?.exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ weightKg: 45.359237, reps: 5, completed: false });
    expect(sets[0]?.isPR).toBeUndefined();
    expect((await db.workouts.get('w1'))?.status).toBe('completed');
  });

  it('saves as a template with the default name and then disables the button', async () => {
    const benchId = await seedBench();
    await db.workouts.put(
      bench('w1', 'Push Day', new Date(2026, 10, 3, 18).getTime(), benchId, 100, false),
    );
    const user = userEvent.setup();
    renderFull('/history/w1');
    await user.click(await screen.findByRole('button', { name: 'Save as Template' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Template name')).toHaveValue('Push Day');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('button', { name: 'Saved as template' })).toBeDisabled();
    expect((await db.templates.toArray()).map((t) => t.name)).toEqual(['Push Day']);
  });
});
