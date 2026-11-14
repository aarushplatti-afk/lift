import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../ui/toastStore';
import { setOwner, wipeLocalData } from '../../../db/repos/meta';
import { DEFAULT_SETTINGS } from '../../../db/repos/settings';
import { db } from '../../../db/schema';
import { Summary } from '../../../routes/WorkoutTab/Summary';
import { useSettingsStore } from '../../../store/settings';
import type { Workout } from '../../../types/domain';
import { SaveAsTemplateDialog } from '../SaveAsTemplateDialog';

function workout(over: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    userId: 'u1',
    name: 'Push Day',
    startedAt: 1000,
    endedAt: 5000,
    status: 'completed',
    createdAt: 1,
    updatedAt: 1,
    exercises: [
      {
        id: 'we1',
        exerciseId: 'ex1',
        order: 0,
        sets: [
          { id: 's1', order: 0, type: 'normal', weightKg: 60, reps: 5, completed: true },
          { id: 's2', order: 1, type: 'normal', weightKg: 62.5, reps: 4, completed: false },
        ],
      },
      {
        id: 'we2',
        exerciseId: 'ex2',
        order: 1,
        sets: [{ id: 's3', order: 0, type: 'normal', weightKg: 20, reps: 8, completed: false }],
      },
    ],
    ...over,
  };
}

beforeEach(async () => {
  await wipeLocalData();
  await setOwner('u1', 'a@b.c');
  useToastStore.getState().dismiss();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'kg' }, hydrated: true });
});

describe('SaveAsTemplateDialog', () => {
  it('prefills the name and saves only completed sets with exact kg targets', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<SaveAsTemplateDialog open workout={workout()} onClose={vi.fn()} onSaved={onSaved} />);
    expect(screen.getByLabelText('Template name')).toHaveValue('Push Day');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    const rows = await db.templates.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Push Day');
    expect(rows[0]?.exercises).toEqual([
      {
        exerciseId: 'ex1',
        order: 0,
        sets: [{ type: 'normal', targetReps: 5, targetWeightKg: 60 }],
      },
    ]);
    expect(useToastStore.getState().toast?.message).toBe('Saved “Push Day” as a template');
  });

  it('shows an inline error for an empty name and caps the name at 60 characters', async () => {
    const user = userEvent.setup();
    render(<SaveAsTemplateDialog open workout={workout()} onClose={vi.fn()} onSaved={vi.fn()} />);
    const input = screen.getByLabelText('Template name');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
    expect(await db.templates.count()).toBe(0);
    expect(input).toHaveAttribute('maxlength', '60');
    await user.type(input, 'x'.repeat(61));
    expect(input).toHaveValue('x'.repeat(60));
  });

  it('toasts and closes when there are no completed sets', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const w = workout({
      exercises: [
        {
          id: 'we',
          exerciseId: 'ex1',
          order: 0,
          sets: [{ id: 's', order: 0, type: 'normal', weightKg: 1, reps: 1, completed: false }],
        },
      ],
    });
    render(<SaveAsTemplateDialog open workout={w} onClose={onClose} onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(useToastStore.getState().toast?.message).toBe(
      'Nothing to save. Log at least one set first.',
    );
  });
});

describe('Summary save as template', () => {
  it('disables the button after saving', async () => {
    const user = userEvent.setup();
    await db.workouts.put(workout());
    render(
      <MemoryRouter initialEntries={['/workout/summary/w1']}>
        <Routes>
          <Route path="/workout/summary/:id" element={<Summary />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: 'Save as Template' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const saved = await screen.findByRole('button', { name: 'Saved as template' });
    expect(saved).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
