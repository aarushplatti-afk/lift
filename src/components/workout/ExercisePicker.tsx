import { useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { ListRow } from '../ui/ListRow';
import { useToastStore } from '../ui/toastStore';
import { ExerciseFilterBar } from '../exercises/ExerciseFilterBar';
import { ExerciseForm } from '../exercises/ExerciseForm';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { createExercise, listExercises } from '../../db/repos/exercises';
import type { ExerciseInput, ExerciseWriteResult } from '../../db/repos/exercises';
import { EQUIPMENT, MUSCLE_GROUPS } from '../../lib/exercises';
import type { Exercise, MuscleGroup } from '../../types/domain';

interface ExercisePickerProps {
  open: boolean;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
  title?: string;
}

const SAVE_FAILED = 'Couldn’t save. Storage may be full.';

const labelOf = (list: readonly { value: string; label: string }[], value: string): string =>
  list.find((o) => o.value === value)?.label ?? value;

function PickerBody({ onClose, onAdd, title }: Omit<ExercisePickerProps, 'open'>) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const showToast = useToastStore((s) => s.show);

  const exercises = useLiveQuery<Exercise[]>(
    () =>
      listExercises({
        query,
        ...(muscle === 'all' ? {} : { muscleGroup: muscle }),
      }),
    [query, muscle],
    [],
  );

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const handleCreate = async (input: ExerciseInput): Promise<ExerciseWriteResult> => {
    try {
      const result = await createExercise(input);
      if (result.ok) {
        setSelected((s) => [...s, result.exercise.id]);
        setCreating(false);
      }
      return result;
    } catch {
      showToast({ message: SAVE_FAILED });
      return { ok: false, error: { field: 'name', code: 'locked' } };
    }
  };

  const add = () => {
    onAdd(selected);
    onClose();
  };

  if (creating) {
    const trimmed = query.trim();
    return (
      <BottomSheet open title="New exercise" onClose={onClose}>
        <ExerciseForm
          initial={{
            ...(trimmed === '' ? {} : { name: trimmed }),
            ...(muscle === 'all' ? {} : { muscleGroup: muscle }),
          }}
          lockReason={SAVE_FAILED}
          submitLabel="Create"
          onSubmit={handleCreate}
          onCancel={() => {
            setCreating(false);
          }}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open
      title={title ?? 'Add exercises'}
      onClose={onClose}
      footer={
        <Button fullWidth disabled={selected.length === 0} onClick={add}>
          {`Add (${selected.length})`}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <ExerciseFilterBar query={query} onQuery={setQuery} muscle={muscle} onMuscle={setMuscle} />
        <ListRow
          title="+ Create new exercise"
          onClick={() => {
            setCreating(true);
          }}
        />
        {exercises.length === 0 ? (
          <p className="px-4 py-6 text-center text-body-sm text-secondary">
            No exercises match your search.
          </p>
        ) : (
          <div role="group" aria-label="Exercises">
            {exercises.map((e) => (
              <ListRow
                key={e.id}
                title={e.name}
                subtitle={`${labelOf(MUSCLE_GROUPS, e.muscleGroup)} · ${labelOf(EQUIPMENT, e.equipment)}`}
                checked={selected.includes(e.id)}
                onClick={() => {
                  toggle(e.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

export function ExercisePicker({ open, ...rest }: ExercisePickerProps) {
  if (!open) return null;
  return <PickerBody {...rest} />;
}
