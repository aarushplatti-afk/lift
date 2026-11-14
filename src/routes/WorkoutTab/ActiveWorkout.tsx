import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ExerciseCard } from '../../components/workout/ExerciseCard';
import { ExercisePicker } from '../../components/workout/ExercisePicker';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { useNow } from '../../hooks/useNow';
import { elapsedMs } from '../../lib/calc/duration';
import type { ExerciseTypes } from '../../lib/calc/volume';
import { NAME_MAX } from '../../lib/exercises';
import { formatElapsed } from '../../lib/format';
import { useActiveWorkoutStore } from '../../store/activeWorkout';
import { useSettingsStore } from '../../store/settings';
import { useFinishFlow } from './FinishFlow';
import { toExerciseTypes, useExerciseMap } from './useExerciseMap';

const EMPTY_TYPES: ExerciseTypes = new Map();

function WorkoutTitle({ name }: { name: string }) {
  const rename = useActiveWorkoutStore((s) => s.rename);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) rename(draft);
    setDraft(null);
  };
  return (
    <input
      aria-label="Workout name"
      type="text"
      maxLength={NAME_MAX}
      value={draft ?? name}
      onFocus={() => {
        setDraft(name);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className="min-h-tap min-w-0 flex-1 truncate rounded-control bg-transparent px-2 text-[16px] font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    />
  );
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const now = useNow();
  return (
    <span aria-label="Elapsed time" className="shrink-0 text-body-sm tabular-nums text-secondary">
      {formatElapsed(elapsedMs(startedAt, now))}
    </span>
  );
}

export function ActiveWorkout() {
  const navigate = useNavigate();
  const status = useActiveWorkoutStore((s) => s.status);
  const workout = useActiveWorkoutStore((s) => s.workout);
  const addExercises = useActiveWorkoutStore((s) => s.addExercises);
  const unit = useSettingsStore((s) => s.settings.unit);
  const exerciseMap = useExerciseMap();
  const finishFlow = useFinishFlow(exerciseMap ? toExerciseTypes(exerciseMap) : EMPTY_TYPES);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(
    () => () => {
      void useActiveWorkoutStore.getState().flush();
    },
    [],
  );

  if (!workout) {
    if (status === 'ready' && !finishFlow.finishing && !discarding) {
      return <Navigate to="/" replace />;
    }
    return null;
  }

  const discard = async () => {
    setCancelOpen(false);
    setDiscarding(true);
    try {
      await useActiveWorkoutStore.getState().discard();
      navigate('/', { replace: true });
    } catch {
      setDiscarding(false);
    }
  };

  return (
    <>
      <header className="pt-safe pl-safe pr-safe sticky top-0 z-10 border-b border-border bg-bg">
        <div className="flex min-h-[56px] items-center gap-1 px-2">
          <IconButton
            aria-label="Minimize workout"
            onClick={() => {
              void useActiveWorkoutStore
                .getState()
                .flush()
                .then(() => {
                  navigate('/');
                });
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </IconButton>
          <WorkoutTitle name={workout.name} />
          <Elapsed startedAt={workout.startedAt} />
          <Button disabled={exerciseMap === null} onClick={finishFlow.begin}>
            Finish
          </Button>
        </div>
      </header>

      <main className="flex flex-col gap-3 px-4 pb-6 pt-3">
        {exerciseMap !== null &&
          workout.exercises.map((we, i) => (
            <ExerciseCard
              key={we.id}
              we={we}
              index={i}
              count={workout.exercises.length}
              exercise={exerciseMap.get(we.exerciseId)}
              unit={unit}
            />
          ))}
        {workout.exercises.length === 0 && (
          <EmptyState
            title="No exercises yet"
            description="Add an exercise to start logging sets."
          />
        )}
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setPickerOpen(true);
          }}
        >
          + Add Exercise
        </Button>
        <Button
          variant="secondary"
          fullWidth
          className="text-danger"
          onClick={() => {
            setCancelOpen(true);
          }}
        >
          Cancel Workout
        </Button>
      </main>

      <ExercisePicker
        open={pickerOpen}
        title="Add exercises"
        onClose={() => {
          setPickerOpen(false);
        }}
        onAdd={addExercises}
      />
      <Dialog
        open={cancelOpen}
        title="Discard this workout?"
        onClose={() => {
          setCancelOpen(false);
        }}
      >
        <p className="mb-4 text-body-sm text-secondary">{"This can't be undone."}</p>
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              void discard();
            }}
          >
            Discard workout
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setCancelOpen(false);
            }}
          >
            Keep logging
          </Button>
        </div>
      </Dialog>
      {finishFlow.dialogs}
    </>
  );
}
