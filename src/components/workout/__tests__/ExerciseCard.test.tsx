import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDraft } from '../../../lib/templates';
import { useTemplateDraftStore } from '../../../store/templateDraft';
import { useRestTimerStore } from '../../../store/restTimer';
import { useWorkoutEditStore } from '../../../store/workoutEditDraft';
import type { Exercise, Workout, WorkoutExercise } from '../../../types/domain';
import { ExerciseCard } from '../ExerciseCard';

const exercise: Exercise = {
  userId: 'u1',
  updatedAt: 1,
  id: 'a',
  name: 'Bench Press',
  muscleGroup: 'chest',
  equipment: 'barbell',
  type: 'weight_reps',
  isCustom: false,
  archived: false,
  createdAt: 1,
};

const we: WorkoutExercise = {
  id: 'we1',
  exerciseId: 'a',
  order: 0,
  sets: [{ id: 's1', order: 0, type: 'normal', completed: false, weightKg: 100, reps: 8 }],
};

beforeEach(() => {
  useTemplateDraftStore.getState().load({ ...emptyDraft(1), exercises: [we] });
});

function renderCard() {
  return render(
    <ExerciseCard
      mode="template"
      we={we}
      index={0}
      count={2}
      exercise={exercise}
      unit="kg"
      previous={undefined}
    />,
  );
}

describe('ExerciseCard template mode', () => {
  it('shows the template menu without note items', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Bench Press options' }));
    expect(screen.getByRole('button', { name: 'Move up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rest timer:/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove exercise' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /note/i })).toBeNull();
    expect(screen.queryByLabelText('Complete set 1')).toBeNull();
  });

  it('adds a set that copies the last set targets into the draft', async () => {
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: '+ Add Set' }));
    const sets = useTemplateDraftStore.getState().draft?.exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(2);
    expect(sets[1]).toMatchObject({ weightKg: 100, reps: 8, completed: false });
  });
});

describe('ExerciseCard edit mode', () => {
  beforeEach(() => {
    const workout: Workout = {
      userId: 'u1',
      updatedAt: 1,
      id: 'w1',
      name: 'Push',
      startedAt: 1000,
      endedAt: 2000,
      status: 'completed',
      exercises: [we],
      createdAt: 1,
    };
    useWorkoutEditStore.getState().load(workout);
  });

  function renderEdit() {
    return render(
      <ExerciseCard
        mode="edit"
        we={we}
        index={0}
        count={2}
        exercise={exercise}
        unit="kg"
        previous={undefined}
      />,
    );
  }

  it('ticking a set updates the edit store and leaves the rest timer idle', async () => {
    renderEdit();
    await userEvent.click(screen.getByLabelText('Complete set 1'));
    const sets = useWorkoutEditStore.getState().draft?.exercises[0]?.sets ?? [];
    expect(sets[0]?.completed).toBe(true);
    expect(useRestTimerStore.getState().phase).toBe('idle');
  });

  it('shows note items and hides the rest timer item in the menu', async () => {
    renderEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Bench Press options' }));
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove exercise' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rest timer/ })).toBeNull();
  });
});
