import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Header } from '../../components/ui/Header';
import { StatTile } from '../../components/ui/StatTile';
import { useToastStore } from '../../components/ui/toastStore';
import { SaveAsTemplateDialog } from '../../components/workout/SaveAsTemplateDialog';
import { TrophyIcon } from '../../components/workout/TrophyIcon';
import { WorkoutInProgressDialog } from '../../components/workout/WorkoutInProgressDialog';
import { deleteWorkout, getWorkout } from '../../db/repos/workouts';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { workoutStats } from '../../lib/calc/history';
import { setBadgeLabels } from '../../lib/calc/previous';
import {
  formatDurationShort,
  formatSetDetail,
  formatWeight,
  formatWorkoutDateTime,
} from '../../lib/format';
import { newId } from '../../lib/ids';
import { workoutInitFromWorkout } from '../../lib/templates';
import { useActiveWorkoutStore } from '../../store/activeWorkout';
import { useSettingsStore } from '../../store/settings';
import type { Exercise, Unit, WorkoutExercise } from '../../types/domain';
import { BackLink } from '../ExercisesTab/BackLink';
import { toExerciseTypes, useExerciseMap } from '../WorkoutTab/useExerciseMap';

function NotFound() {
  const navigate = useNavigate();
  return (
    <>
      <Header title="Workout" left={<BackLink to="/history" />} />
      <EmptyState
        title="Workout not found"
        description="It may have been deleted."
        action={
          <Button
            onClick={() => {
              navigate('/history', { replace: true });
            }}
          >
            Back to history
          </Button>
        }
      />
    </>
  );
}

interface BlockProps {
  block: WorkoutExercise;
  exercise: Exercise | undefined;
  unit: Unit;
}

function Block({ block, exercise, unit }: BlockProps) {
  const sets = [...block.sets].sort((a, b) => a.order - b.order);
  const badges = setBadgeLabels(sets);
  const type = exercise?.type ?? 'weight_reps';
  return (
    <section className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
      {exercise ? (
        <h2 className="text-title-sm font-semibold">
          <Link
            to={`/exercises/${exercise.id}`}
            className="inline-flex min-h-tap items-center text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {exercise.name}
          </Link>
        </h2>
      ) : (
        <h2 className="flex min-h-tap items-center text-title-sm font-semibold text-secondary">
          Deleted exercise
        </h2>
      )}
      {block.notes ? (
        <p className="whitespace-pre-wrap text-body-sm text-secondary">{block.notes}</p>
      ) : null}
      <ul className="flex flex-col">
        {sets.map((s, i) => (
          <li
            key={s.id}
            className="flex min-h-[44px] items-center gap-3 border-t border-border text-body tabular-nums first:border-t-0"
          >
            <span className="w-8 shrink-0 text-body-sm font-semibold text-secondary">
              {badges[i] ?? String(i + 1)}
            </span>
            <span className="flex-1">{formatSetDetail(s, type, unit)}</span>
            {s.isPR ? (
              <span role="img" aria-label="Personal record" className="flex">
                <TrophyIcon />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WorkoutDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const unit = useSettingsStore((s) => s.settings.unit);
  const exerciseMap = useExerciseMap();
  const workout = useLiveQuery(() => getWorkout(id), [id], null);
  const status = useActiveWorkoutStore((s) => s.status);
  const active = useActiveWorkoutStore((s) => s.workout);
  const start = useActiveWorkoutStore((s) => s.start);
  const [starting, setStarting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [savedAsTemplate, setSavedAsTemplate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (workout === null || exerciseMap === null || deleting) return null;
  if (workout === undefined || workout.status !== 'completed') return <NotFound />;

  const types = toExerciseTypes(exerciseMap);
  const stats = workoutStats(workout, types);
  const duration = stats.durationMs === undefined ? '—' : formatDurationShort(stats.durationMs);
  const volume = formatWeight(stats.volumeKg, unit, { withUnit: true });
  const blocks = [...workout.exercises].sort((a, b) => a.order - b.order);

  const handleRepeat = async () => {
    if (active) {
      setBlocked(true);
      return;
    }
    setStarting(true);
    try {
      await start(workoutInitFromWorkout(workout, { now: Date.now(), newId }));
      navigate('/workout/active');
    } catch {
      useToastStore.getState().show({ message: 'Couldn’t start the workout. Try again.' });
    } finally {
      setStarting(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await deleteWorkout(workout.id);
      useToastStore.getState().show({ message: 'Workout deleted' });
      navigate('/history', { replace: true });
    } catch {
      setDeleting(false);
      useToastStore.getState().show({ message: 'Couldn’t delete. Try again.' });
    }
  };

  return (
    <>
      <Header
        title={workout.name}
        left={<BackLink to="/history" />}
        right={
          <Link
            to={`/history/${workout.id}/edit`}
            className="inline-flex min-h-tap min-w-tap items-center justify-center px-2 text-body font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Edit
          </Link>
        }
      />
      <main className="flex flex-col gap-4 px-4 py-4">
        <p className="text-body-sm tabular-nums text-secondary">
          {formatWorkoutDateTime(workout.startedAt)}
        </p>
        <div className="flex gap-2">
          <StatTile label="Duration" value={duration} />
          <StatTile label="Total volume" value={volume} />
          <StatTile label="Sets" value={String(stats.setCount)} />
        </div>
        {workout.notes ? (
          <p className="whitespace-pre-wrap text-body text-secondary">{workout.notes}</p>
        ) : null}
        {blocks.map((b) => (
          <Block key={b.id} block={b} exercise={exerciseMap.get(b.exerciseId)} unit={unit} />
        ))}
        <Button
          size="lg"
          fullWidth
          disabled={starting || status === 'loading'}
          onClick={() => void handleRepeat()}
        >
          Repeat Workout
        </Button>
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          disabled={savedAsTemplate}
          onClick={() => {
            setTemplateOpen(true);
          }}
        >
          {savedAsTemplate ? 'Saved as template' : 'Save as Template'}
        </Button>
        <Button
          size="lg"
          variant="danger"
          fullWidth
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          Delete Workout
        </Button>
      </main>
      <SaveAsTemplateDialog
        open={templateOpen}
        workout={workout}
        onClose={() => {
          setTemplateOpen(false);
        }}
        onSaved={() => {
          setSavedAsTemplate(true);
          setTemplateOpen(false);
        }}
      />
      <WorkoutInProgressDialog
        open={blocked}
        onClose={() => {
          setBlocked(false);
        }}
      />
      <Dialog
        open={confirmDelete}
        title="Delete this workout?"
        onClose={() => {
          setConfirmDelete(false);
        }}
      >
        <p className="mb-4 text-body-sm text-secondary">
          It will be removed from your history on all your devices. Personal records will be
          recalculated.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="danger" fullWidth onClick={() => void handleDelete()}>
            Delete workout
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setConfirmDelete(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </Dialog>
    </>
  );
}
