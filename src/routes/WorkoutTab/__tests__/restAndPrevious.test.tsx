import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToastHost } from '../../../components/ui/Toast';
import { useToastStore } from '../../../components/ui/toastStore';
import { createExercise } from '../../../db/repos/exercises';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { initActiveWorkoutStore, useActiveWorkoutStore } from '../../../store/activeWorkout';
import { useRestTimerStore } from '../../../store/restTimer';
import { useSettingsStore } from '../../../store/settings';
import type { SettingsData, Unit, Workout, WorkoutSet } from '../../../types/domain';
import { ActiveWorkout } from '../ActiveWorkout';

let stopStore: (() => void) | undefined;

function set(id: string, order: number, over: Partial<WorkoutSet> = {}): WorkoutSet {
  return { id, order, type: 'normal', completed: false, ...over };
}

function workoutRow(id: string, over: Partial<Workout>): Workout {
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

async function seed(opts: {
  current: WorkoutSet[];
  previous?: WorkoutSet[];
  restSeconds?: number;
  unit?: Unit;
  settings?: Partial<SettingsData>;
}): Promise<void> {
  const r = await createExercise({
    name: 'Bench Press',
    muscleGroup: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
  });
  if (!r.ok) throw new Error('seed failed');
  const exerciseId = r.exercise.id;
  if (opts.previous) {
    await db.workouts.put(
      workoutRow('prev', {
        status: 'completed',
        startedAt: Date.now() - 86_400_000,
        exercises: [{ id: 'pwe', exerciseId, order: 0, sets: opts.previous }],
      }),
    );
  }
  await db.workouts.put(
    workoutRow('cur', {
      exercises: [
        { id: 'we1', exerciseId, order: 0, restSeconds: opts.restSeconds, sets: opts.current },
      ],
    }),
  );
  await db.meta.put({ key: 'activeWorkoutId', value: 'cur' });
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, unit: opts.unit ?? 'kg', ...opts.settings },
    hydrated: true,
  });
  stopStore = initActiveWorkoutStore();
  await waitFor(() => {
    expect(useActiveWorkoutStore.getState().status).toBe('ready');
  });
  render(
    <MemoryRouter>
      <ActiveWorkout />
      <ToastHost />
    </MemoryRouter>,
  );
  await screen.findByRole('region', { name: 'Bench Press' });
}

function rowSwipeTarget(n: number): HTMLElement {
  const content = screen.getByRole('group', { name: `Set ${String(n)}` }).parentElement;
  if (!content?.parentElement) throw new Error('no swipe row');
  content.parentElement.getBoundingClientRect = () => ({ width: 390 }) as DOMRect;
  return content;
}

function swipeLeft(el: HTMLElement, dx: number): void {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 300, clientY: 100 });
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 300 - dx, clientY: 100 });
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 300 - dx, clientY: 100 });
}

function weightValues(): string[] {
  return screen
    .getAllByLabelText(/^Weight \(\w+\) set \d+$/)
    .map((el) => (el as HTMLInputElement).value);
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useToastStore.getState().dismiss();
  useRestTimerStore.getState().skip();
});

afterEach(() => {
  stopStore?.();
  stopStore = undefined;
  useRestTimerStore.getState().skip();
});

describe('previous column', () => {
  it('shows the prior set and fills values on tap without completing', async () => {
    const user = userEvent.setup();
    await seed({
      current: [set('s1', 0)],
      previous: [set('p1', 0, { weightKg: 80, reps: 5, completed: true })],
    });
    await user.click(await screen.findByRole('button', { name: 'Use previous: 80 × 5' }));
    expect(screen.getByLabelText('Weight (kg) set 1')).toHaveValue('80');
    expect(screen.getByLabelText('Reps set 1')).toHaveValue('5');
    expect(screen.getByRole('button', { name: 'Complete set 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('converts to lb for display and stores kg exactly', async () => {
    const user = userEvent.setup();
    await seed({
      unit: 'lb',
      current: [set('s1', 0)],
      previous: [set('p1', 0, { weightKg: 61.234994, reps: 5, completed: true })],
    });
    await user.click(await screen.findByRole('button', { name: 'Use previous: 135 × 5' }));
    expect(screen.getByLabelText('Weight (lb) set 1')).toHaveValue('135');
    expect(useActiveWorkoutStore.getState().workout?.exercises[0]?.sets[0]?.weightKg).toBe(
      61.234994,
    );
  });

  it('does not offer fill on a completed row', async () => {
    await seed({
      current: [set('s1', 0, { weightKg: 50, reps: 5, completed: true })],
      previous: [set('p1', 0, { weightKg: 80, reps: 5, completed: true })],
    });
    expect(await screen.findByText('80 × 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use previous/ })).toBeNull();
  });

  it('shows a dash when there is no previous set', async () => {
    await seed({ current: [set('s1', 0)] });
    const row = screen.getByRole('group', { name: 'Set 1' });
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use previous/ })).toBeNull();
  });
});

describe('badge sheet and swipe', () => {
  it('changing a set type renumbers the badges', async () => {
    const user = userEvent.setup();
    await seed({ current: [set('s1', 0), set('s2', 1), set('s3', 2), set('s4', 3)] });
    await user.click(screen.getByRole('button', { name: 'Set 3 options' }));
    const group = await screen.findByRole('radiogroup', { name: 'Set type' });
    await user.click(within(group).getByRole('radio', { name: 'Drop set' }));
    const badges = screen
      .getAllByRole('button', { name: /^Set \d options/ })
      .map((b) => b.textContent);
    expect(badges).toEqual(['1', '2', 'D', '3']);
    expect(screen.getByRole('button', { name: 'Set 3 options, drop set' })).toBeInTheDocument();
  });

  it('Delete set in the badge sheet removes the set', async () => {
    const user = userEvent.setup();
    await seed({ current: [set('s1', 0), set('s2', 1)] });
    await user.click(screen.getByRole('button', { name: 'Set 2 options' }));
    await user.click(await screen.findByRole('button', { name: 'Delete set' }));
    expect(screen.queryByLabelText('Reps set 2')).toBeNull();
  });

  it('swipe delete then Undo restores the set at the same position', async () => {
    const user = userEvent.setup();
    await seed({
      current: [
        set('s1', 0, { weightKg: 10 }),
        set('s2', 1, { weightKg: 20 }),
        set('s3', 2, { weightKg: 30 }),
      ],
    });
    swipeLeft(rowSwipeTarget(2), 250);
    expect(weightValues()).toEqual(['10', '30']);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(weightValues()).toEqual(['10', '20', '30']);
  });
});

describe('rest timer', () => {
  it('starts with the default duration when completing a set', async () => {
    const user = userEvent.setup();
    await seed({ current: [set('s1', 0, { weightKg: 50, reps: 5 })] });
    expect(screen.queryByRole('progressbar', { name: 'Rest remaining' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    const bar = await screen.findByTestId('rest-timer-bar');
    expect(bar).toHaveTextContent('1:30');
    expect(screen.getByRole('progressbar', { name: 'Rest remaining' })).toHaveAttribute(
      'aria-valuemax',
      '90',
    );
  });

  it('uses the exercise override', async () => {
    const user = userEvent.setup();
    await seed({ current: [set('s1', 0, { weightKg: 50, reps: 5 })], restSeconds: 120 });
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    expect(await screen.findByTestId('rest-timer-bar')).toHaveTextContent('2:00');
  });

  it('does not start when auto-start is off', async () => {
    const user = userEvent.setup();
    await seed({
      current: [set('s1', 0, { weightKg: 50, reps: 5 })],
      settings: { restTimerAutoStart: false },
    });
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    expect(screen.queryByTestId('rest-timer-bar')).toBeNull();
    expect(useRestTimerStore.getState().phase).toBe('idle');
  });

  it('unchecking a set keeps the timer running', async () => {
    const user = userEvent.setup();
    await seed({ current: [set('s1', 0, { weightKg: 50, reps: 5 })] });
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    await screen.findByTestId('rest-timer-bar');
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    expect(screen.getByRole('button', { name: 'Complete set 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('rest-timer-bar')).toBeInTheDocument();
    expect(useRestTimerStore.getState().phase).toBe('running');
  });

  it('Skip, -15s and +15s adjust the timer', async () => {
    const user = userEvent.setup();
    await seed({ current: [set('s1', 0, { weightKg: 50, reps: 5 })] });
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    await screen.findByTestId('rest-timer-bar');
    await user.click(screen.getByRole('button', { name: 'Add 15 seconds' }));
    expect(useRestTimerStore.getState().durationSec).toBe(105);
    await user.click(screen.getByRole('button', { name: 'Subtract 15 seconds' }));
    await user.click(screen.getByRole('button', { name: 'Subtract 15 seconds' }));
    expect(useRestTimerStore.getState().durationSec).toBe(75);
    await user.click(screen.getByRole('button', { name: 'Skip rest' }));
    expect(screen.queryByTestId('rest-timer-bar')).toBeNull();
    expect(useRestTimerStore.getState().phase).toBe('idle');
  });

  it('shows Rest complete when the timer finishes', async () => {
    await seed({ current: [set('s1', 0, { weightKg: 50, reps: 5 })] });
    act(() => {
      useRestTimerStore.getState().start(15, 'cur');
    });
    act(() => {
      useRestTimerStore.getState().tick(Date.now() + 16_000);
    });
    expect(await screen.findByTestId('rest-timer-bar')).toHaveTextContent('Rest complete');
  });

  it('announces when a rest starts, including a restart from done', async () => {
    await seed({ current: [set('s1', 0, { weightKg: 50, reps: 5 })] });
    const live = (): string =>
      document.querySelector('[aria-live="polite"][aria-atomic="true"]')?.textContent ?? '';
    act(() => {
      useRestTimerStore.getState().start(15, 'cur');
    });
    expect(live()).toBe('Rest started, 0:15');
    act(() => {
      useRestTimerStore.getState().tick(Date.now() + 16_000);
    });
    expect(live()).toBe('Rest complete');
    act(() => {
      useRestTimerStore.getState().start(30, 'cur');
    });
    expect(live()).toBe('Rest started, 0:30');
  });

  it('sets a per-exercise override from the menu and shows it in the menu label', async () => {
    const user = userEvent.setup();
    await seed({ current: [set('s1', 0)] });
    await user.click(screen.getByRole('button', { name: 'Bench Press options' }));
    await user.click(await screen.findByRole('button', { name: 'Rest timer: Default (1:30)' }));
    await user.click(screen.getByRole('button', { name: 'Increase Rest time' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(useActiveWorkoutStore.getState().workout?.exercises[0]?.restSeconds).toBe(105);
    await user.click(screen.getByRole('button', { name: 'Bench Press options' }));
    await user.click(await screen.findByRole('button', { name: 'Rest timer: 1:45' }));
    await user.click(screen.getByRole('button', { name: 'Use default' }));
    expect(useActiveWorkoutStore.getState().workout?.exercises[0]?.restSeconds).toBeUndefined();
  });
});
