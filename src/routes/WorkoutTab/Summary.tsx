import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Header } from '../../components/ui/Header';
import { getWorkout } from '../../db/repos/workouts';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { completedSetCount, workoutVolume } from '../../lib/calc/volume';
import { formatDurationInput } from '../../lib/duration';
import { formatDurationShort, formatWeight } from '../../lib/format';
import { useSettingsStore } from '../../store/settings';
import type { Exercise, Unit, WorkoutExercise, WorkoutSet } from '../../types/domain';
import { toExerciseTypes, useExerciseMap } from './useExerciseMap';

interface PrRow {
  key: string;
  text: string;
}

function describeSet(set: WorkoutSet, exercise: Exercise | undefined, unit: Unit): string {
  const type = exercise?.type ?? 'weight_reps';
  if (type === 'duration') return formatDurationInput(set.durationSec ?? 0);
  if (type === 'bodyweight_reps') return `${set.reps ?? 0} reps`;
  const prefix = type === 'weighted_bodyweight' ? '+' : '';
  return `${prefix}${formatWeight(set.weightKg ?? 0, unit, { withUnit: true })} × ${set.reps ?? 0}`;
}

function prRows(
  exercises: WorkoutExercise[],
  map: ReadonlyMap<string, Exercise>,
  unit: Unit,
): PrRow[] {
  const rows: PrRow[] = [];
  for (const we of exercises) {
    const exercise = map.get(we.exerciseId);
    for (const s of we.sets) {
      if (!s.isPR) continue;
      rows.push({
        key: s.id,
        text: `${exercise?.name ?? 'Deleted exercise'} · ${describeSet(s, exercise, unit)}`,
      });
    }
  }
  return rows;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-card border border-border bg-surface px-2 py-3">
      <span className="text-title font-semibold tabular-nums">{value}</span>
      <span className="text-caption text-secondary">{label}</span>
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-pr-gold"
    >
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

export function Summary() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const unit = useSettingsStore((s) => s.settings.unit);
  const exerciseMap = useExerciseMap();
  const workout = useLiveQuery(() => getWorkout(id), [id], null);

  const done = () => {
    navigate('/', { replace: true });
  };

  if (workout === null || exerciseMap === null) return null;

  if (workout === undefined) {
    return (
      <>
        <Header title="Summary" />
        <EmptyState
          title="Workout not found"
          description="It may have been deleted."
          action={<Button onClick={done}>Done</Button>}
        />
      </>
    );
  }

  const types = toExerciseTypes(exerciseMap);
  const duration = formatDurationShort((workout.endedAt ?? workout.startedAt) - workout.startedAt);
  const volume = formatWeight(workoutVolume(workout, types), unit, { withUnit: true });
  const prs = prRows(workout.exercises, exerciseMap, unit);

  return (
    <>
      <Header title={workout.name} />
      <main className="flex flex-col gap-4 px-4 py-4">
        <div className="flex gap-2">
          <Stat label="Duration" value={duration} />
          <Stat label="Total volume" value={volume} />
          <Stat label="Sets" value={String(completedSetCount(workout, types))} />
        </div>
        <section aria-labelledby="pr-heading" className="flex flex-col gap-2">
          <h2 id="pr-heading" className="text-title-sm font-semibold">
            Personal records
          </h2>
          {prs.length === 0 ? (
            <p className="text-body-sm text-secondary">No new records this time.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {prs.map((r) => (
                <li
                  key={r.key}
                  className="flex min-h-[44px] items-center gap-2 rounded-control border border-border bg-surface px-3 text-body tabular-nums"
                >
                  <TrophyIcon />
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Button size="lg" fullWidth onClick={done}>
          Done
        </Button>
      </main>
    </>
  );
}
