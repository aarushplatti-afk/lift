import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '../../../components/ui/toastStore';
import { createExercise } from '../../../db/repos/exercises';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { initActiveWorkoutStore, useActiveWorkoutStore } from '../../../store/activeWorkout';
import { useSettingsStore } from '../../../store/settings';
import type { Workout } from '../../../types/domain';
import { ActiveWorkout } from '../ActiveWorkout';
import { Summary } from '../Summary';
import { WorkoutHome } from '../WorkoutHome';

const KG_135_LB = 61.234994;

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

function workoutRow(id: string, over: Partial<Workout> = {}): Workout {
  return {
    id,
    userId: 'u1',
    name: 'Seeded',
    startedAt: Date.now() - 3600_000,
    status: 'in_progress',
    exercises: [],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

async function startStore(): Promise<void> {
  stopStore = initActiveWorkoutStore();
  await waitFor(() => {
    expect(useActiveWorkoutStore.getState().status).toBe('ready');
  });
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<WorkoutHome />} />
        <Route path="/workout/active" element={<ActiveWorkout />} />
        <Route path="/workout/summary/:id" element={<Summary />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function addBench(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: '+ Add Exercise' }));
  await user.click(await screen.findByRole('checkbox', { name: /Bench Press/ }));
  await user.click(screen.getByRole('button', { name: 'Add (1)' }));
}

async function fillSet(
  user: ReturnType<typeof userEvent.setup>,
  n: number,
  weight: string,
  reps: string,
): Promise<void> {
  const w = screen.getByLabelText(`Weight (lb) set ${n}`);
  await user.clear(w);
  await user.type(w, weight);
  const r = screen.getByLabelText(`Reps set ${n}`);
  await user.clear(r);
  await user.type(r, reps);
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

describe('WorkoutHome', () => {
  it('start opens the active workout screen', async () => {
    const user = userEvent.setup();
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    expect(await screen.findByLabelText('Workout name')).toBeInTheDocument();
    expect(screen.getByText('No exercises yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('00:0');
  });

  it('banner shows elapsed time and resumes', async () => {
    await db.workouts.put(workoutRow('w1', { startedAt: Date.now() - 65_000 }));
    await db.meta.put({ key: 'activeWorkoutId', value: 'w1' });
    await startStore();
    renderApp();
    const banner = await screen.findByRole('button', { name: /Workout in progress/ });
    expect(banner).toHaveTextContent(/01:0\d/);
    expect(banner).toHaveTextContent('Resume');
    expect(screen.queryByRole('button', { name: 'Start Empty Workout' })).not.toBeInTheDocument();
  });

  it('remote row has no Resume and discards after confirm', async () => {
    const user = userEvent.setup();
    await db.workouts.put(workoutRow('remote', { name: 'Leg Day' }));
    await startStore();
    renderApp();
    expect(await screen.findByText('In progress on another device')).toBeInTheDocument();
    expect(screen.getByText(/Leg Day · started/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resume/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Empty Workout' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Discard Leg Day/ }));
    const dialog = screen.getByRole('dialog', { name: 'Discard this workout?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard workout' }));
    await waitFor(() => {
      expect(screen.queryByText('In progress on another device')).not.toBeInTheDocument();
    });
    expect(await db.workouts.get('remote')).toBeUndefined();
  });
});

describe('ActiveWorkout', () => {
  it('adds an exercise via the picker with one set, and prefills added sets', async () => {
    const user = userEvent.setup();
    await seedBench();
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    await addBench(user);
    expect(await screen.findByRole('region', { name: 'Bench Press' })).toBeInTheDocument();
    expect(screen.getByLabelText('Weight (lb) set 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Weight (lb) set 2')).not.toBeInTheDocument();

    await fillSet(user, 1, '135', '5');
    await user.click(screen.getByRole('button', { name: '+ Add Set' }));
    expect(screen.getByLabelText('Weight (lb) set 2')).toHaveValue('135');
    expect(screen.getByLabelText('Reps set 2')).toHaveValue('5');
  });

  it('completes a set', async () => {
    const user = userEvent.setup();
    await seedBench();
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    await addBench(user);
    await fillSet(user, 1, '135', '5');
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    expect(screen.getByRole('button', { name: 'Complete set 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows Deleted exercise for an unknown exercise id', async () => {
    await db.workouts.put(
      workoutRow('w1', {
        exercises: [
          {
            id: 'we1',
            exerciseId: 'gone',
            order: 0,
            sets: [{ id: 's1', order: 0, type: 'normal', completed: false }],
          },
        ],
      }),
    );
    await db.meta.put({ key: 'activeWorkoutId', value: 'w1' });
    await startStore();
    renderApp('/workout/active');
    expect(await screen.findByRole('region', { name: 'Deleted exercise' })).toBeInTheDocument();
    expect(screen.getByLabelText('Weight (lb) set 1')).toBeInTheDocument();
  });

  it('Cancel Workout asks for confirmation and discards', async () => {
    const user = userEvent.setup();
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel Workout' }));
    const dialog = screen.getByRole('dialog', { name: 'Discard this workout?' });
    expect(within(dialog).getByText("This can't be undone.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Discard workout' }));
    expect(await screen.findByRole('button', { name: 'Start Empty Workout' })).toBeInTheDocument();
    expect(await db.workouts.count()).toBe(0);
  });

  it('persists the name and exercise note on visibility hidden without blur', async () => {
    const user = userEvent.setup();
    await seedBench();
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    await addBench(user);
    await user.click(await screen.findByRole('button', { name: 'Bench Press options' }));
    await user.click(await screen.findByRole('button', { name: 'Add note' }));
    await user.type(await screen.findByLabelText('Exercise note'), 'felt heavy');
    const name = screen.getByLabelText('Workout name');
    await user.clear(name);
    await user.type(name, 'Push Day');

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    try {
      await waitFor(async () => {
        const row = (await db.workouts.toArray())[0];
        expect(row?.name).toBe('Push Day');
        expect(row?.exercises[0]?.notes).toBe('felt heavy');
      });
    } finally {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    }
  });

  it('clearing the name and blurring restores the original name', async () => {
    const user = userEvent.setup();
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    const name = await screen.findByLabelText('Workout name');
    const original = (name as HTMLInputElement).value;
    await user.clear(name);
    await user.tab();
    expect(screen.getByLabelText('Workout name')).toHaveValue(original);
    await waitFor(async () => {
      expect((await db.workouts.toArray())[0]?.name).toBe(original);
    });
  });

  it('minimize flushes and returns home with the banner', async () => {
    const user = userEvent.setup();
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    await user.click(await screen.findByRole('button', { name: 'Minimize workout' }));
    expect(await screen.findByRole('button', { name: /Workout in progress/ })).toBeInTheDocument();
  });
});

describe('Finish flow', () => {
  async function setupTwoSets(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await seedBench();
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    await addBench(user);
    await fillSet(user, 1, '135', '5');
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    await user.click(screen.getByRole('button', { name: '+ Add Set' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));
  }

  it('Mark complete & finish keeps the incomplete set', async () => {
    const user = userEvent.setup();
    await setupTwoSets(user);
    const dialog = await screen.findByRole('dialog', { name: 'Finish workout?' });
    expect(within(dialog).getByText('You have 1 incomplete set. Finish anyway?')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Mark complete & finish' }));
    expect(await screen.findByText('No new records this time.')).toBeInTheDocument();
    const stat = screen.getByText('Sets').parentElement;
    expect(stat).toHaveTextContent('2');
  });

  it('Discard incomplete sets & finish drops it', async () => {
    const user = userEvent.setup();
    await setupTwoSets(user);
    const dialog = await screen.findByRole('dialog', { name: 'Finish workout?' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Discard incomplete sets & finish' }),
    );
    expect(await screen.findByText('Personal records')).toBeInTheDocument();
    expect(screen.getByText('Sets').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Total volume').parentElement).toHaveTextContent('675 lb');
  });

  it('Cancel keeps the workout open', async () => {
    const user = userEvent.setup();
    await setupTwoSets(user);
    const dialog = await screen.findByRole('dialog', { name: 'Finish workout?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useActiveWorkoutStore.getState().workout).not.toBeNull();
  });

  it('an empty workout leads to the discard dialog', async () => {
    const user = userEvent.setup();
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nothing to save' });
    expect(
      within(dialog).getByText('This workout has no completed sets. Discard it?'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Discard workout' }));
    expect(await screen.findByRole('button', { name: 'Start Empty Workout' })).toBeInTheDocument();
    expect(await db.workouts.count()).toBe(0);
  });

  it('finishing with all sets complete goes straight to a summary with a PR row', async () => {
    const user = userEvent.setup();
    const benchId = await seedBench();
    await db.workouts.put(
      workoutRow('prior', {
        status: 'completed',
        startedAt: 1000,
        endedAt: 2000,
        exercises: [
          {
            id: 'pwe',
            exerciseId: benchId,
            order: 0,
            sets: [
              {
                id: 'ps',
                order: 0,
                type: 'normal',
                weightKg: 40,
                reps: 5,
                completed: true,
                completedAt: 1500,
              },
            ],
          },
        ],
      }),
    );
    await startStore();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start Empty Workout' }));
    await addBench(user);
    await fillSet(user, 1, '135', '5');
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.queryByRole('dialog', { name: 'Finish workout?' })).not.toBeInTheDocument();
    expect(await screen.findByText('Personal records')).toBeInTheDocument();
    expect(screen.getByText('Bench Press · 135 lb × 5')).toBeInTheDocument();
    expect(screen.getByText('Duration').parentElement).toHaveTextContent('<1m');
    expect(screen.getByText('Total volume').parentElement).toHaveTextContent('675 lb');
    expect(screen.getByText('Sets').parentElement).toHaveTextContent('1');
    const saved = (await db.workouts.toArray()).find(
      (w) => w.status === 'completed' && w.id !== 'prior',
    );
    expect(saved?.exercises[0]?.sets[0]?.weightKg).toBeCloseTo(KG_135_LB, 4);

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Start Empty Workout' })).toBeInTheDocument();
  });
});

describe('Summary', () => {
  it('shows not found for an unknown id', async () => {
    renderApp('/workout/summary/nope');
    expect(await screen.findByText('Workout not found')).toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(await screen.findByRole('button', { name: 'Start Empty Workout' })).toBeInTheDocument();
  });
});
