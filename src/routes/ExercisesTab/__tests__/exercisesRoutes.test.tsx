import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useToastStore } from '../../../components/ui/toastStore';
import { db } from '../../../db/schema';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import type { Exercise } from '../../../types/domain';
import { ExerciseDetail } from '../ExerciseDetail';
import { ExerciseFormPage } from '../ExerciseFormPage';
import { ExerciseList } from '../ExerciseList';

function row(id: string, name: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id,
    userId: 'u1',
    name,
    muscleGroup: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
    isCustom: true,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/exercises" element={<ExerciseList />} />
        <Route path="/exercises/new" element={<ExerciseFormPage />} />
        <Route path="/exercises/:id" element={<ExerciseDetail />} />
        <Route path="/exercises/:id/edit" element={<ExerciseFormPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  await db.exercises.clear();
  await db.workouts.clear();
  await db.templates.clear();
  await db.syncQueue.clear();
  useToastStore.getState().dismiss();
});

describe('ExerciseList', () => {
  it('folds diacritics and hyphens when searching', async () => {
    await db.exercises.bulkPut([
      row('1', 'Café Press'),
      row('2', 'Pull-Up', { muscleGroup: 'back' }),
      row('3', 'Squat', { muscleGroup: 'quads' }),
    ]);
    renderAt('/exercises');
    await screen.findByText('Squat');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'cafe');
    await waitFor(() => {
      expect(screen.queryByText('Squat')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Café Press')).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search exercises' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'pull up');
    expect(await screen.findByText('Pull-Up')).toBeInTheDocument();
    expect(screen.queryByText('Café Press')).not.toBeInTheDocument();
  });

  it('filters by muscle chip', async () => {
    await db.exercises.bulkPut([
      row('1', 'Bench'),
      row('2', 'Row', { muscleGroup: 'back', equipment: 'cable' }),
    ]);
    renderAt('/exercises');
    await screen.findByText('Bench');
    await userEvent.click(screen.getByRole('radio', { name: 'Back' }));
    await waitFor(() => {
      expect(screen.queryByText('Bench')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Row')).toBeInTheDocument();
    expect(screen.getByText('Back · Cable')).toBeInTheDocument();
  });

  it('reveals archived rows with a badge via Show archived', async () => {
    await db.exercises.bulkPut([row('1', 'Bench'), row('2', 'Old Fly', { archived: true })]);
    renderAt('/exercises');
    await screen.findByText('Bench');
    expect(screen.queryByText('Old Fly')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Show archived/ }));
    const link = await screen.findByRole('link', { name: /Old Fly/ });
    expect(within(link).getByText('Archived')).toBeInTheDocument();
  });

  it('offers to create the searched name when nothing matches', async () => {
    await db.exercises.put(row('1', 'Bench'));
    renderAt('/exercises');
    await screen.findByText('Bench');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'Zercher');
    const cta = await screen.findByRole('link', { name: 'Create “Zercher”' });
    expect(cta).toHaveAttribute('href', '/exercises/new?name=Zercher');
    expect(screen.getByText('No exercises match')).toBeInTheDocument();
  });

  it('shows the empty state with no exercises', async () => {
    renderAt('/exercises');
    expect(await screen.findByText('No exercises yet')).toBeInTheDocument();
  });
});

describe('ExerciseFormPage', () => {
  it('shows required messages on Save', async () => {
    renderAt('/exercises/new?name=');
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(screen.getByText('Choose a muscle group.')).toBeInTheDocument();
    expect(screen.getByText('Choose equipment.')).toBeInTheDocument();
  });

  it('shows a duplicate error and prefills from the query string', async () => {
    await db.exercises.put(row('1', 'Bench Press'));
    renderAt('/exercises/new?name=Bench%20Press&muscle=chest');
    expect(await screen.findByLabelText('Name')).toHaveValue('Bench Press');
    expect(screen.getByLabelText('Muscle group')).toHaveValue('chest');
    await userEvent.click(screen.getByLabelText('Name'));
    await userEvent.tab();
    expect(
      await screen.findByText('You already have an exercise named “Bench Press”.'),
    ).toBeInTheDocument();
  });

  it('creates an exercise and opens its detail page', async () => {
    renderAt('/exercises/new');
    await userEvent.type(await screen.findByLabelText('Name'), 'Zercher Squat');
    await userEvent.selectOptions(screen.getByLabelText('Muscle group'), 'quads');
    await userEvent.selectOptions(screen.getByLabelText('Equipment'), 'barbell');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Zercher Squat', level: 1 })).toBeVisible();
    expect(await db.exercises.count()).toBe(1);
  });

  it('locks name and type on a built-in exercise', async () => {
    await db.exercises.put(row('1', 'Bench Press', { isCustom: false }));
    renderAt('/exercises/1/edit');
    expect(await screen.findByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('Type')).toBeDisabled();
    expect(
      screen.getByText('Built-in exercises can’t be renamed or change type.'),
    ).toBeInTheDocument();
  });

  it('locks only type on a used custom exercise', async () => {
    await db.exercises.put(row('1', 'Mine'));
    await db.templates.put({
      id: 't1',
      userId: 'u1',
      name: 'T',
      createdAt: 1,
      updatedAt: 1,
      exercises: [{ exerciseId: '1', order: 0, sets: [] }],
    });
    renderAt('/exercises/1/edit');
    await waitFor(() => {
      expect(screen.getByLabelText('Type')).toBeDisabled();
    });
    expect(screen.getByLabelText('Name')).toBeEnabled();
    expect(
      screen.getByText('Type can’t change after the exercise has been logged.'),
    ).toBeInTheDocument();
  });

  it('clears notes on edit and queues exactly one upsert', async () => {
    await db.exercises.put(row('1', 'Mine', { notes: 'old note' }));
    renderAt('/exercises/1/edit');
    const notes = await screen.findByLabelText('Notes (optional)');
    await userEvent.clear(notes);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect((await db.exercises.get('1'))?.notes).toBeUndefined();
    });
    expect(await db.syncQueue.count()).toBe(1);
  });

  it('saves an archived row while a live row shares its name', async () => {
    await db.exercises.bulkPut([row('1', 'Dup', { archived: true }), row('2', 'Dup')]);
    renderAt('/exercises/1/edit');
    const notes = await screen.findByLabelText('Notes (optional)');
    await userEvent.type(notes, 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect((await db.exercises.get('1'))?.notes).toBe('hello');
    });
  });

  it('handles a missing exercise', async () => {
    renderAt('/exercises/nope/edit');
    expect(await screen.findByText('Exercise not found')).toBeInTheDocument();
  });
});

describe('ExerciseDetail', () => {
  it('deletes an unused custom exercise and returns to the list', async () => {
    await db.exercises.put(row('1', 'Mine'));
    renderAt('/exercises/1');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete exercise' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete exercise?' });
    expect(dialog).toHaveTextContent(
      '“Mine” has never been used. It will be permanently deleted on all your devices.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('heading', { name: 'Exercises', level: 1 })).toBeVisible();
    expect(useToastStore.getState().toast?.message).toBe('Exercise deleted');
    expect(await db.exercises.count()).toBe(0);
  });

  it('archives a built-in exercise and stays on the page', async () => {
    await db.exercises.put(row('1', 'Bench Press', { isCustom: false }));
    renderAt('/exercises/1');
    expect(await screen.findByText('Built-in')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archive exercise' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive exercise?' });
    expect(dialog).toHaveTextContent('is part of the built-in library');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(
      await screen.findByText('Archived. Hidden from the library and picker.'),
    ).toBeInTheDocument();
    expect(useToastStore.getState().toast?.message).toBe('Exercise archived');
    expect((await db.exercises.get('1'))?.archived).toBe(true);
    expect(screen.queryByRole('button', { name: 'Archive exercise' })).not.toBeInTheDocument();
  });

  it('archives a used custom exercise with the used copy', async () => {
    await db.exercises.put(row('1', 'Mine'));
    await db.templates.put({
      id: 't1',
      userId: 'u1',
      name: 'T',
      createdAt: 1,
      updatedAt: 1,
      exercises: [{ exerciseId: '1', order: 0, sets: [] }],
    });
    renderAt('/exercises/1');
    await userEvent.click(await screen.findByRole('button', { name: 'Archive exercise' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('is used in your workouts or templates');
  });

  it('blocks restore when another exercise has the same name', async () => {
    await db.exercises.bulkPut([
      row('1', 'Bench Press', { archived: true }),
      row('2', 'bench press'),
    ]);
    renderAt('/exercises/1');
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => {
      expect(useToastStore.getState().toast?.message).toBe(
        'Can’t restore: another exercise is named “Bench Press”. Rename or archive it first.',
      );
    });
    expect((await db.exercises.get('1'))?.archived).toBe(true);
  });

  it('shows not found for an unknown id', async () => {
    renderAt('/exercises/nope');
    expect(await screen.findByText('Exercise not found')).toBeInTheDocument();
  });
});
