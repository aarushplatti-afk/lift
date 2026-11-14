import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ExerciseFilterBar } from '../ExerciseFilterBar';
import { ExerciseForm } from '../ExerciseForm';
import type { ExerciseWriteResult } from '../../../db/repos/exercises';
import type { MuscleGroup } from '../../../types/domain';

const { isNameTakenMock } = vi.hoisted(() => ({
  isNameTakenMock: vi.fn<(name: string, excludeId?: string) => Promise<boolean>>(),
}));

vi.mock('../../../db/repos/exercises', () => ({
  isNameTaken: isNameTakenMock,
}));

const okResult = (): Promise<ExerciseWriteResult> =>
  Promise.resolve({ ok: false, error: { field: 'name', code: 'duplicate' } });

beforeEach(() => {
  isNameTakenMock.mockReset();
  isNameTakenMock.mockResolvedValue(false);
});

describe('ExerciseForm', () => {
  it('shows required messages on submit and does not call onSubmit', async () => {
    const onSubmit = vi.fn(okResult);
    render(<ExerciseForm submitLabel="Save" onSubmit={onSubmit} onCancel={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(screen.getByText('Choose a muscle group.')).toBeInTheDocument();
    expect(screen.getByText('Choose equipment.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the name error on blur', async () => {
    render(<ExerciseForm submitLabel="Save" onSubmit={okResult} onCancel={() => undefined} />);
    const name = screen.getByLabelText('Name');
    await userEvent.click(name);
    await userEvent.tab();
    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
  });

  it('shows a live duplicate error and passes excludeId', async () => {
    isNameTakenMock.mockImplementation((n) => Promise.resolve(n === 'Bench Press'));
    render(
      <ExerciseForm
        submitLabel="Save"
        excludeId="abc"
        onSubmit={okResult}
        onCancel={() => undefined}
      />,
    );
    await userEvent.type(screen.getByLabelText('Name'), '  Bench   Press ');
    await userEvent.tab();
    expect(
      await screen.findByText('You already have an exercise named “Bench Press”.'),
    ).toBeInTheDocument();
    expect(isNameTakenMock).toHaveBeenCalledWith('Bench Press', 'abc');
  });

  it('maps a returned duplicate error to the name field', async () => {
    const onSubmit = vi.fn(okResult);
    render(
      <ExerciseForm
        submitLabel="Save"
        initial={{ name: 'Row', muscleGroup: 'back', equipment: 'cable' }}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('You already have an exercise named “Row”.'),
    ).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Row',
      muscleGroup: 'back',
      equipment: 'cable',
      notes: '',
      type: 'weight_reps',
    });
  });

  it('disables locked fields and shows the lock hint', () => {
    render(
      <ExerciseForm
        submitLabel="Save"
        initial={{ name: 'Squat', muscleGroup: 'quads', equipment: 'barbell' }}
        locked={{ name: true, type: true }}
        lockReason="Built-in exercises can’t be renamed or change type."
        onSubmit={okResult}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('Type')).toBeDisabled();
    expect(screen.getByLabelText('Muscle group')).toBeEnabled();
    expect(
      screen.getByText('Built-in exercises can’t be renamed or change type.'),
    ).toBeInTheDocument();
  });

  it('hides the submit button when showSubmit is false and exposes formId', () => {
    const { container } = render(
      <ExerciseForm
        submitLabel="Save"
        formId="ex-form"
        showSubmit={false}
        onSubmit={okResult}
        onCancel={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(container.querySelector('form#ex-form')).not.toBeNull();
  });
});

describe('ExerciseFilterBar', () => {
  function Harness({
    onQuery,
    onMuscle,
  }: {
    onQuery: (q: string) => void;
    onMuscle: (m: MuscleGroup | 'all') => void;
  }) {
    const [query, setQuery] = useState('');
    const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
    return (
      <ExerciseFilterBar
        query={query}
        onQuery={(q) => {
          setQuery(q);
          onQuery(q);
        }}
        muscle={muscle}
        onMuscle={(m) => {
          setMuscle(m);
          onMuscle(m);
        }}
      />
    );
  }

  it('emits query and muscle changes', async () => {
    const onQuery = vi.fn();
    const onMuscle = vi.fn();
    render(<Harness onQuery={onQuery} onMuscle={onMuscle} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'ab');
    expect(onQuery).toHaveBeenLastCalledWith('ab');
    await userEvent.click(screen.getByRole('radio', { name: 'Chest' }));
    expect(onMuscle).toHaveBeenCalledWith('chest');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Chest' })).toBeChecked();
    });
    expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked();
  });
});
