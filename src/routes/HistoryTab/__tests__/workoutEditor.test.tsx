import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '../../../components/ui/toastStore';
import { createExercise } from '../../../db/repos/exercises';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { useSettingsStore } from '../../../store/settings';
import { useWorkoutEditStore } from '../../../store/workoutEditDraft';
import type { Workout, WorkoutSet } from '../../../types/domain';
import { WorkoutEditor } from '../WorkoutEditor';

const STARTED = new Date(2026, 10, 12, 18, 0).getTime();

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

function set(order: number, patch: Partial<WorkoutSet>): WorkoutSet {
  return { id: `s${order}`, order, type: 'normal', completed: false, ...patch };
}

function workout(exerciseId: string, sets: WorkoutSet[], status: Workout['status'] = 'completed') {
  const w: Workout = {
    id: 'w1',
    userId: 'u1',
    name: 'Push Day',
    startedAt: STARTED,
    endedAt: STARTED + 45 * 60000,
    status,
    createdAt: STARTED,
    updatedAt: STARTED,
    exercises: [{ id: 'we1', exerciseId, order: 0, sets }],
  };
  return w;
}

const done = (order: number, weightKg: number, reps: number): WorkoutSet =>
  set(order, { weightKg, reps, completed: true, completedAt: STARTED });

function renderEditor(path = '/history/w1/edit') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history" element={<div>List screen</div>} />
        <Route path="/history/:id" element={<div>Detail screen</div>} />
        <Route path="/history/:id/edit" element={<WorkoutEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function rename(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  const input = await screen.findByLabelText('Workout name');
  await user.clear(input);
  await user.type(input, name);
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useToastStore.getState().dismiss();
  useWorkoutEditStore.getState().clear();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'lb' }, hydrated: true });
});

describe('WorkoutEditor', () => {
  it('loads the workout, saves an edited weight and navigates to the detail', async () => {
    const bench = await seedBench();
    await db.workouts.put(workout(bench, [done(0, 100, 5)]));
    const user = userEvent.setup();
    renderEditor();
    expect(await screen.findByLabelText('Workout name')).toHaveValue('Push Day');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-12');
    expect(screen.getByLabelText('Start time')).toHaveValue('18:00');
    expect(screen.getByLabelText('Duration hours')).toHaveValue('0');
    expect(screen.getByLabelText('Duration minutes')).toHaveValue('45');
    const weight = await screen.findByLabelText('Weight (lb) set 1');
    await user.clear(weight);
    await user.type(weight, '200');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Detail screen')).toBeInTheDocument();
    expect(useToastStore.getState().toast?.message).toBe('Workout updated');
    const stored = await db.workouts.get('w1');
    expect(stored?.exercises[0]?.sets[0]?.weightKg).toBeCloseTo(90.72, 1);
  });

  it('rejects a start time in the future and a malformed date', async () => {
    const bench = await seedBench();
    await db.workouts.put(workout(bench, [done(0, 100, 5)]));
    const user = userEvent.setup();
    renderEditor();
    const date = await screen.findByLabelText('Date');
    fireEvent.change(date, { target: { value: '2999-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Start time can’t be in the future')).toBeInTheDocument();
    expect((await db.workouts.get('w1'))?.startedAt).toBe(STARTED);

    fireEvent.change(date, { target: { value: '' } });
    expect(await screen.findByText('Enter a valid date and time')).toBeInTheDocument();
    expect(useWorkoutEditStore.getState().draft?.startedAt).toBe(
      new Date(2999, 0, 1, 18, 0).getTime(),
    );
    expect(date).toHaveValue('');
  });

  it('resyncs the date and time fields when the draft start changes elsewhere', async () => {
    const bench = await seedBench();
    await db.workouts.put(workout(bench, [done(0, 100, 5)]));
    renderEditor();
    expect(await screen.findByLabelText('Date')).toHaveValue('2026-11-12');
    useWorkoutEditStore.getState().setStartedAt(new Date(2026, 9, 3, 7, 30).getTime());
    await waitFor(() => {
      expect(screen.getByLabelText('Date')).toHaveValue('2026-10-03');
    });
    expect(screen.getByLabelText('Start time')).toHaveValue('07:30');
  });

  it('offers to mark incomplete sets complete', async () => {
    const bench = await seedBench();
    await db.workouts.put(
      workout(bench, [done(0, 100, 5), set(1, { weightKg: 50, reps: 5, completed: false })]),
    );
    const user = userEvent.setup();
    renderEditor();
    await rename(user, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Mark complete & save' }));
    expect(await screen.findByText('Detail screen')).toBeInTheDocument();
    const stored = await db.workouts.get('w1');
    expect(stored?.name).toBe('Renamed');
    expect(stored?.exercises[0]?.sets.map((s) => s.completed)).toEqual([true, true]);
  });

  it('can discard incomplete sets instead', async () => {
    const bench = await seedBench();
    await db.workouts.put(
      workout(bench, [done(0, 100, 5), set(1, { weightKg: 50, reps: 5, completed: false })]),
    );
    const user = userEvent.setup();
    renderEditor();
    await rename(user, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save changes?' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Discard incomplete sets & save' }),
    );
    expect(await screen.findByText('Detail screen')).toBeInTheDocument();
    expect((await db.workouts.get('w1'))?.exercises[0]?.sets).toHaveLength(1);
  });

  it('deletes the workout when nothing is left to save', async () => {
    const bench = await seedBench();
    await db.workouts.put(workout(bench, [set(0, {})]));
    const user = userEvent.setup();
    renderEditor();
    await rename(user, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nothing left to save' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete workout' }));
    expect(await screen.findByText('List screen')).toBeInTheDocument();
    expect(useToastStore.getState().toast?.message).toBe('Workout deleted');
    expect(await db.workouts.get('w1')).toBeUndefined();
  });

  it('cancels straight away when clean', async () => {
    const bench = await seedBench();
    await db.workouts.put(workout(bench, [done(0, 100, 5)]));
    const user = userEvent.setup();
    renderEditor();
    await screen.findByLabelText('Workout name');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Detail screen')).toBeInTheDocument();
  });

  it('asks before discarding dirty changes', async () => {
    const bench = await seedBench();
    await db.workouts.put(workout(bench, [done(0, 100, 5)]));
    const user = userEvent.setup();
    renderEditor();
    await rename(user, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes?' })).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    expect(await screen.findByText('Detail screen')).toBeInTheDocument();
    expect((await db.workouts.get('w1'))?.name).toBe('Push Day');
  });

  it('shows not found for a missing or in-progress workout', async () => {
    const bench = await seedBench();
    await db.workouts.put({ ...workout(bench, [done(0, 100, 5)], 'in_progress'), id: 'live' });
    const first = renderEditor('/history/nope/edit');
    expect(await screen.findByText('Workout not found')).toBeInTheDocument();
    first.unmount();
    renderEditor('/history/live/edit');
    expect(await screen.findByText('Workout not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to history' })).toBeInTheDocument();
  });
});
