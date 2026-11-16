import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExercise } from '../../../db/repos/exercises';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { fromDisplay } from '../../../lib/units';
import { useProgressViewStore } from '../../../store/progressView';
import { useSettingsStore } from '../../../store/settings';
import type { ExerciseType, SetType, Workout } from '../../../types/domain';
import { ProgressTab } from '../ProgressTab';

vi.mock('../../../hooks/useElementWidth', () => ({
  useElementWidth: () => [{ current: null }, 360],
}));

const DAY = 86_400_000;

interface SetSpec {
  lb?: number;
  reps?: number;
  sec?: number;
  type?: SetType;
}

async function seedExercise(name: string, type: ExerciseType = 'weight_reps'): Promise<string> {
  const r = await createExercise({
    name,
    muscleGroup: 'chest',
    equipment: 'barbell',
    type,
  });
  if (!r.ok) throw new Error('seed failed');
  return r.exercise.id;
}

function workout(id: string, daysAgo: number, exerciseId: string, sets: SetSpec[]): Workout {
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
        sets: sets.map((s, i) => ({
          id: `${id}-s${String(i)}`,
          order: i,
          type: s.type ?? 'normal',
          weightKg: s.lb === undefined ? undefined : fromDisplay(s.lb, 'lb'),
          reps: s.reps,
          durationSec: s.sec,
          completed: true,
          completedAt: startedAt,
        })),
      },
    ],
  };
}

async function seedBench(): Promise<string> {
  const bench = await seedExercise('Barbell Bench Press');
  await db.workouts.bulkPut([
    workout('b1', 150, bench, [{ lb: 185, reps: 5 }]),
    workout('b2', 60, bench, [{ lb: 205, reps: 5 }]),
    workout('b3', 30, bench, [{ lb: 215, reps: 5 }]),
    workout('b4', 10, bench, [
      { lb: 245, reps: 1, type: 'warmup' },
      { lb: 225, reps: 5 },
    ]),
  ]);
  return bench;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

function renderTab(path = '/progress') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/progress" element={<ProgressTab />} />
        <Route path="/history/:id" element={<div>History detail</div>} />
        <Route path="/" element={<div>Workout home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function tile(label: string): HTMLElement {
  const el = screen.getByText(label).parentElement;
  if (!el) throw new Error('tile not found');
  return el;
}

beforeEach(async () => {
  cleanup();
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'lb' }, hydrated: true });
  useProgressViewStore.setState({
    view: 'exercises',
    exerciseId: undefined,
    metric: undefined,
    range: '3M',
    bodyweightRange: '3M',
  });
});

describe('Progress tab shell', () => {
  it('shows the three segments with the Bodyweight view and the PRs view', async () => {
    renderTab();
    const group = screen.getByRole('radiogroup', { name: 'Progress views' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Exercises', 'Bodyweight', 'PRs']);
    await userEvent.click(screen.getByRole('radio', { name: 'Bodyweight' }));
    expect(await screen.findByText('No weigh-ins yet')).toBeInTheDocument();
    expect(screen.getByText('Log your first weigh-in to start tracking.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'PRs' }));
    expect(await screen.findByText('No records yet')).toBeInTheDocument();
    expect(screen.getByText('Finish a workout to set your first records.')).toBeInTheDocument();
  });

  it('shows the empty state with a start link when nothing is logged', async () => {
    renderTab();
    expect(await screen.findByText('No workouts yet')).toBeInTheDocument();
    expect(screen.getByText('Finish a workout to see your progress here.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Start a workout' }));
    expect(screen.getByText('Workout home')).toBeInTheDocument();
  });
});

describe('Exercises view', () => {
  it('defaults to the most recently trained exercise', async () => {
    await seedBench();
    const squat = await seedExercise('Squat');
    await db.workouts.put(workout('s1', 3, squat, [{ lb: 315, reps: 3 }]));
    renderTab();
    expect(await screen.findByRole('button', { name: 'Exercise: Squat. Change' })).toBeVisible();
  });

  it('lists only trained exercises when blank and adds untrained matches for a query', async () => {
    await seedBench();
    await seedExercise('Deadlift');
    renderTab();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Exercise: Barbell Bench Press. Change' }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Choose exercise' });
    expect(within(sheet).getByText('Barbell Bench Press')).toBeInTheDocument();
    expect(within(sheet).queryByText('Deadlift')).toBeNull();
    expect(within(sheet).queryByText('Not logged yet')).toBeNull();

    await userEvent.type(within(sheet).getByRole('searchbox'), 'dead');
    expect(within(sheet).getByText('Not logged yet')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByText('Deadlift'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByText('Log this exercise a few times to see your progress.'),
    ).toBeInTheDocument();
  });

  it('shows the chips for each exercise type and hides them for duration', async () => {
    const bench = await seedBench();
    useProgressViewStore.setState({ exerciseId: bench });
    const pushUp = await seedExercise('Push-Up', 'bodyweight_reps');
    const plank = await seedExercise('Plank', 'duration');
    await db.workouts.bulkPut([
      workout('p1', 2, pushUp, [{ reps: 20 }]),
      workout('k1', 1, plank, [{ sec: 90 }]),
    ]);
    renderTab();
    const chips = () => screen.getByRole('radiogroup', { name: 'Chart metric' });

    expect(await screen.findByRole('radiogroup', { name: 'Chart metric' })).toBeInTheDocument();
    expect(
      within(chips())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Weight', 'Est. 1RM', 'Volume', 'Reps']);
    expect(within(chips()).getByRole('radio', { name: 'Weight' })).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: /^Exercise: Barbell Bench Press/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Push-Up'));
    expect(
      within(chips())
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Reps', 'Total reps']);

    await userEvent.click(screen.getByRole('button', { name: /^Exercise: Push-Up/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Plank'));
    expect(screen.queryByRole('radiogroup', { name: 'Chart metric' })).toBeNull();
  });

  it('shows the stat cards and the Est. 1RM metric changes Current best', async () => {
    await seedBench();
    renderTab();
    expect(await screen.findByText('Current best')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '3M' })).toBeChecked();
    expect(tile('Current best')).toHaveTextContent('225 lb');
    expect(tile('Change · 3M')).toHaveTextContent('+20 lb');
    expect(tile('Change · 3M')).toHaveTextContent('+10%');
    expect(tile('Workouts')).toHaveTextContent('4');
    expect(tile('Last performed')).toHaveTextContent('1 week ago');
    expect(screen.queryByText(/Fewer than 2 workouts/)).toBeNull();

    await userEvent.click(screen.getByRole('radio', { name: 'Est. 1RM' }));
    expect(tile('Current best')).toHaveTextContent('262.5 lb');
  });

  it('falls back to all time with a hint when the range has fewer than 2 points', async () => {
    const bench = await seedExercise('Squat');
    await db.workouts.bulkPut([
      workout('f1', 60, bench, [{ lb: 200, reps: 5 }]),
      workout('f2', 10, bench, [{ lb: 240, reps: 5 }]),
    ]);
    renderTab();
    await screen.findByText('Current best');
    await userEvent.click(screen.getByRole('radio', { name: '1M' }));
    expect(
      screen.getByText('Fewer than 2 workouts in this range. Showing all time.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1M' })).toBeChecked();
    expect(tile('Change · All')).toHaveTextContent('+40 lb');
  });

  it('shows the single-point note and no line for one workout', async () => {
    const bench = await seedExercise('Bench Press');
    await db.workouts.put(workout('only', 5, bench, [{ lb: 135, reps: 8 }]));
    const { container } = renderTab();
    expect(
      await screen.findByText('One workout so far. Log another to see a trend.'),
    ).toBeInTheDocument();
    expect(container.querySelector('.recharts-line-curve')).toBeNull();
    expect(tile('Change · 3M')).toHaveTextContent('Need 2+ workouts');
  });

  it('lists recent sessions newest first with links, top sets and warm-up only', async () => {
    await seedBench();
    const squat = await seedExercise('Squat');
    await db.workouts.bulkPut([
      workout('w-old', 9, squat, [{ lb: 135, reps: 5, type: 'warmup' }]),
      ...Array.from({ length: 11 }, (_, i) =>
        workout(`q${String(i)}`, 20 + i, squat, [
          { lb: 200 + i, reps: 5 },
          { lb: 100, reps: 10 },
        ]),
      ),
    ]);
    useProgressViewStore.setState({ exerciseId: squat });
    renderTab();
    await screen.findByText('Recent sessions');
    const items = screen.getAllByRole('link');
    expect(items).toHaveLength(10);
    expect(items[0]).toHaveAttribute('href', '/history/w-old');
    expect(within(items[0] as HTMLElement).getByText('Warm-up only')).toBeInTheDocument();
    expect(items[1]).toHaveAttribute('href', '/history/q0');
    expect(within(items[1] as HTMLElement).getByText('200 lb × 5 · 2 sets')).toBeInTheDocument();
    await userEvent.click(items[1] as HTMLElement);
    expect(screen.getByText('History detail')).toBeInTheDocument();
  });

  it('selects the exercise from the deep link', async () => {
    await seedBench();
    const squat = await seedExercise('Squat');
    await db.workouts.put(workout('s1', 1, squat, [{ lb: 315, reps: 3 }]));
    const bench = (await db.exercises.toArray()).find((e) => e.name === 'Barbell Bench Press');
    renderTab(`/progress?exercise=${bench?.id ?? ''}`);
    expect(
      await screen.findByRole('button', { name: 'Exercise: Barbell Bench Press. Change' }),
    ).toBeVisible();
  });

  it('clears the deep link param so a later selection survives a remount', async () => {
    const bench = await seedBench();
    const squat = await seedExercise('Squat');
    await db.workouts.put(workout('s1', 1, squat, [{ lb: 315, reps: 3 }]));
    const first = renderTab(`/progress?exercise=${bench}`);
    await screen.findByRole('button', { name: 'Exercise: Barbell Bench Press. Change' });
    expect(screen.getByTestId('search').textContent).toBe('');
    await userEvent.click(screen.getByRole('button', { name: /^Exercise: Barbell Bench Press/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Squat'));
    first.unmount();
    renderTab();
    expect(await screen.findByRole('button', { name: 'Exercise: Squat. Change' })).toBeVisible();
  });

  it('renders the content inside a main landmark', async () => {
    renderTab();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('prefixes Current best with + for weighted bodyweight weight only', async () => {
    const pull = await seedExercise('Weighted Pull-Up', 'weighted_bodyweight');
    await db.workouts.bulkPut([
      workout('wp1', 20, pull, [{ lb: 25, reps: 8 }]),
      workout('wp2', 3, pull, [{ lb: 45, reps: 5 }]),
    ]);
    renderTab();
    await screen.findByText('Current best');
    expect(tile('Current best')).toHaveTextContent('+45 lb');
    await userEvent.click(screen.getByRole('radio', { name: 'Est. 1RM' }));
    expect(tile('Current best')).not.toHaveTextContent('+');
  });

  it('shows the volume change grouped as an integer', async () => {
    const bench = await seedExercise('Bench');
    await db.workouts.bulkPut([
      workout('v1', 20, bench, [{ lb: 100, reps: 10 }]),
      workout('v2', 3, bench, [{ lb: 200, reps: 12 }]),
    ]);
    renderTab();
    await screen.findByText('Current best');
    await userEvent.click(screen.getByRole('radio', { name: 'Volume' }));
    expect(tile('Change · 3M')).toHaveTextContent('+1,400 lb');
  });

  it('keeps the selection across unmount and remount', async () => {
    await seedBench();
    const squat = await seedExercise('Squat');
    await db.workouts.put(workout('s1', 1, squat, [{ lb: 315, reps: 3 }]));
    const first = renderTab();
    await userEvent.click(await screen.findByRole('button', { name: /^Exercise: Squat/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Barbell Bench Press'));
    await userEvent.click(screen.getByRole('radio', { name: '6M' }));
    first.unmount();
    renderTab();
    expect(
      await screen.findByRole('button', { name: 'Exercise: Barbell Bench Press. Change' }),
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: '6M' })).toBeChecked();
  });

  it('re-renders values in kg when the unit changes', async () => {
    await seedBench();
    renderTab();
    await screen.findByText('Current best');
    expect(tile('Current best')).toHaveTextContent('225 lb');
    act(() => {
      useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'kg' }, hydrated: true });
    });
    expect(tile('Current best')).toHaveTextContent('102.1 kg');
    expect(tile('Change · 3M')).toHaveTextContent('+9.1 kg');
    expect(tile('Change · 3M')).toHaveTextContent('+10%');
    await userEvent.click(screen.getByRole('radio', { name: 'Est. 1RM' }));
    expect(tile('Current best')).toHaveTextContent('119.1 kg');
  });

  it('shows the no-data state for a metric with no points while keeping the recent sessions', async () => {
    const pull = await seedExercise('Weighted Pull-Up', 'weighted_bodyweight');
    await db.workouts.put(workout('wp1', 3, pull, [{ lb: 0, reps: 8 }]));
    renderTab();
    expect(await screen.findByText('No Added weight data yet')).toBeInTheDocument();
    expect(screen.getByText('Try another metric.')).toBeInTheDocument();
    expect(screen.getByText('Recent sessions')).toBeInTheDocument();
  });
});
