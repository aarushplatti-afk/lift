import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Header } from '../../components/ui/Header';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useToastStore } from '../../components/ui/toastStore';
import {
  deleteOrArchiveExercise,
  getExercise,
  isExerciseUsed,
  restoreExercise,
} from '../../db/repos/exercises';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { EQUIPMENT, EXERCISE_TYPES, MUSCLE_GROUPS } from '../../lib/exercises';
import type { Exercise } from '../../types/domain';
import { BackLink } from './BackLink';

type DetailTab = 'history' | 'records' | 'chart';

const TAB_OPTIONS: readonly { value: DetailTab; label: string }[] = [
  { value: 'history', label: 'History' },
  { value: 'records', label: 'Records' },
  { value: 'chart', label: 'Chart' },
];

const TAB_PLACEHOLDER: Record<DetailTab, { title: string; description: string }> = {
  history: { title: 'No history yet', description: 'Logged sets will appear here.' },
  records: { title: 'No records yet', description: 'Personal records will appear here.' },
  chart: { title: 'No data to chart', description: 'Progress charts will appear here.' },
};

const SAVE_FAILED = 'Couldn’t save. Storage may be full.';

function ArchiveMessage({ name, builtIn }: { name: string; builtIn: boolean }) {
  const reason = builtIn
    ? 'is part of the built-in library'
    : 'is used in your workouts or templates';
  return (
    <p className="mb-4 text-body">
      “{name}” {reason}, so it can’t be deleted. Archiving hides it from the library and picker.
      Your history is kept, and you can restore it with Show archived.
    </p>
  );
}

function Detail({ exercise, used }: { exercise: Exercise; used: boolean }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<DetailTab>('history');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const muscle =
    MUSCLE_GROUPS.find((m) => m.value === exercise.muscleGroup)?.label ?? exercise.muscleGroup;
  const equipment =
    EQUIPMENT.find((q) => q.value === exercise.equipment)?.label ?? exercise.equipment;
  const typeLabel = EXERCISE_TYPES.find((t) => t.value === exercise.type)?.label ?? exercise.type;

  const deletable = exercise.isCustom && !used;
  const showAction = deletable || !exercise.archived;
  const toast = (message: string) => {
    useToastStore.getState().show({ message });
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await deleteOrArchiveExercise(exercise.id);
      setConfirming(false);
      if (outcome === 'deleted') {
        toast('Exercise deleted');
        navigate('/exercises');
      } else {
        toast('Exercise archived');
      }
    } catch {
      setConfirming(false);
      toast(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await restoreExercise(exercise.id);
      if (!result.ok) {
        toast(
          `Can’t restore: another exercise is named “${exercise.name}”. Rename or archive it first.`,
        );
      }
    } catch {
      toast(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const placeholder = TAB_PLACEHOLDER[tab];

  return (
    <>
      <Header
        title={exercise.name}
        left={<BackLink to="/exercises" />}
        right={
          <Link
            to={`/exercises/${exercise.id}/edit`}
            className="inline-flex min-h-tap items-center px-3 text-body font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Edit
          </Link>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        {exercise.archived && (
          <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface-2 p-3">
            <p className="text-body-sm">Archived. Hidden from the library and picker.</p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void restore();
              }}
            >
              Restore
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <p className="text-body">
            {muscle} · {equipment}
          </p>
          <p className="text-body-sm text-secondary">{typeLabel}</p>
          <p>
            <span className="rounded-control border border-border px-2 py-0.5 text-caption font-semibold">
              {exercise.isCustom ? 'Custom' : 'Built-in'}
            </span>
          </p>
          {exercise.notes !== undefined && (
            <p className="mt-2 whitespace-pre-wrap break-words text-body">{exercise.notes}</p>
          )}
        </div>

        <SegmentedControl
          label="Exercise sections"
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
        />
        <EmptyState title={placeholder.title} description={placeholder.description} />

        {showAction && (
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              setConfirming(true);
            }}
          >
            {deletable ? 'Delete exercise' : 'Archive exercise'}
          </Button>
        )}
      </div>

      <Dialog
        open={confirming}
        title={deletable ? 'Delete exercise?' : 'Archive exercise?'}
        onClose={() => {
          setConfirming(false);
        }}
      >
        {deletable ? (
          <p className="mb-4 text-body">
            “{exercise.name}” has never been used. It will be permanently deleted on all your
            devices.
          </p>
        ) : (
          <ArchiveMessage name={exercise.name} builtIn={!exercise.isCustom} />
        )}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            onClick={() => {
              setConfirming(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={busy}
            onClick={() => {
              void confirm();
            }}
          >
            {deletable ? 'Delete' : 'Archive'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function ExerciseDetail() {
  const { id = '' } = useParams();
  const exercise = useLiveQuery<Exercise | null | undefined>(
    async () => (await getExercise(id)) ?? null,
    [id],
    undefined,
  );
  const used = useLiveQuery<boolean | undefined>(() => isExerciseUsed(id), [id], undefined);

  if (exercise === undefined || used === undefined) return null;
  if (exercise === null) {
    return (
      <>
        <Header title="Exercise" left={<BackLink to="/exercises" />} />
        <EmptyState
          title="Exercise not found"
          description="It may have been deleted on another device."
          action={
            <Link
              to="/exercises"
              className="inline-flex min-h-tap items-center px-4 text-body font-semibold text-accent"
            >
              Back to exercises
            </Link>
          }
        />
      </>
    );
  }
  return <Detail exercise={exercise} used={used} />;
}
