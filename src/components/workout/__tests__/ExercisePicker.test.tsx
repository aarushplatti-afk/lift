import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExercisePicker } from '../ExercisePicker';
import { db } from '../../../db/schema';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { createExercise } from '../../../db/repos/exercises';
import type { ExerciseInput } from '../../../db/repos/exercises';

const input = (name: string, over: Partial<ExerciseInput> = {}): ExerciseInput => ({
  name,
  muscleGroup: 'chest',
  equipment: 'barbell',
  type: 'weight_reps',
  ...over,
});

async function seed(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const [name, over] of [
    ['Bench Press', {}],
    ['Curl', { muscleGroup: 'biceps', equipment: 'dumbbell' }],
    ['Squat', { muscleGroup: 'quads' }],
  ] as const) {
    const r = await createExercise(input(name, over));
    if (r.ok) ids[name] = r.exercise.id;
  }
  return ids;
}

function setup(open = true) {
  const onAdd = vi.fn<(ids: string[]) => void>();
  const onClose = vi.fn();
  const ui = (o: boolean) => (
    <MemoryRouter>
      <ExercisePicker open={o} onAdd={onAdd} onClose={onClose} />
    </MemoryRouter>
  );
  const view = render(ui(open));
  return { onAdd, onClose, rerender: (o: boolean) => view.rerender(ui(o)) };
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
});

describe('ExercisePicker', () => {
  it('shows the count and disables Add at zero', async () => {
    await seed();
    setup();
    const add = await screen.findByRole('button', { name: 'Add (0)' });
    expect(add).toBeDisabled();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Bench Press/ }));
    expect(screen.getByRole('button', { name: 'Add (1)' })).toBeEnabled();
    expect(screen.getByText('Chest · Barbell')).toBeInTheDocument();
  });

  it('keeps tap order and closes after adding', async () => {
    const ids = await seed();
    const { onAdd, onClose } = setup();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Squat/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Bench Press/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add (2)' }));
    expect(onAdd).toHaveBeenCalledWith([ids.Squat, ids['Bench Press']]);
    expect(onClose).toHaveBeenCalled();
  });

  it('deselects on second tap', async () => {
    await seed();
    setup();
    const row = await screen.findByRole('checkbox', { name: /Curl/ });
    await userEvent.click(row);
    await userEvent.click(row);
    expect(screen.getByRole('button', { name: 'Add (0)' })).toBeDisabled();
  });

  it('hides archived exercises', async () => {
    const ids = await seed();
    const curlId = ids.Curl;
    if (curlId === undefined) throw new Error('seed failed');
    await db.exercises.update(curlId, { archived: true });
    setup();
    await screen.findByRole('checkbox', { name: /Squat/ });
    expect(screen.queryByRole('checkbox', { name: /Curl/ })).not.toBeInTheDocument();
  });

  it('filters by search', async () => {
    await seed();
    setup();
    await screen.findByRole('checkbox', { name: /Squat/ });
    await userEvent.type(screen.getByLabelText('Search exercises'), 'cur');
    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: /Squat/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('checkbox', { name: /Curl/ })).toBeInTheDocument();
  });

  it('creates a new exercise, auto-selects it and returns to the list', async () => {
    await seed();
    const { onAdd } = setup();
    await screen.findByRole('checkbox', { name: /Squat/ });
    await userEvent.type(screen.getByLabelText('Search exercises'), 'Zottman Curl');
    await userEvent.click(screen.getByRole('button', { name: '+ Create new exercise' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Zottman Curl');
    await userEvent.selectOptions(screen.getByLabelText('Muscle group'), 'biceps');
    await userEvent.selectOptions(screen.getByLabelText('Equipment'), 'dumbbell');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('button', { name: 'Add (1)' })).toBeEnabled();
    await userEvent.clear(screen.getByLabelText('Search exercises'));
    const row = await screen.findByRole('checkbox', { name: /Zottman Curl/ });
    expect(row).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Add (1)' }));
    const created = await db.exercises.filter((e) => e.name === 'Zottman Curl').first();
    expect(onAdd).toHaveBeenCalledWith([created?.id]);
  });

  it('cancel in the create view returns to the list', async () => {
    await seed();
    setup();
    await userEvent.click(await screen.findByRole('button', { name: '+ Create new exercise' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Add (0)' })).toBeInTheDocument();
  });

  it('resets selection and query on reopen', async () => {
    await seed();
    const { rerender } = setup();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Squat/ }));
    await userEvent.type(screen.getByLabelText('Search exercises'), 'sq');
    rerender(false);
    rerender(true);
    expect(await screen.findByRole('button', { name: 'Add (0)' })).toBeDisabled();
    expect(screen.getByLabelText('Search exercises')).toHaveValue('');
  });
});
