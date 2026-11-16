import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { Header } from '../../components/ui/Header';
import { TrophyIcon } from '../../components/workout/TrophyIcon';
import { listCompletedWorkouts } from '../../db/repos/workouts';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { groupByMonth, workoutStats } from '../../lib/calc/history';
import type { ExerciseTypes } from '../../lib/calc/volume';
import { formatDurationShort, formatVolume, formatWorkoutDate } from '../../lib/format';
import { useSettingsStore } from '../../store/settings';
import type { Unit, Workout } from '../../types/domain';
import { toExerciseTypes, useExerciseMap } from '../WorkoutTab/useExerciseMap';

interface RowProps {
  workout: Workout;
  types: ExerciseTypes;
  unit: Unit;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function HistoryRow({ workout, types, unit }: RowProps) {
  const stats = workoutStats(workout, types);
  const date = formatWorkoutDate(workout.startedAt);
  const duration = stats.durationMs === undefined ? '—' : formatDurationShort(stats.durationMs);
  const count = stats.exerciseCount;
  const prLabel =
    stats.prCount > 0 ? `, ${String(stats.prCount)} ${plural(stats.prCount, 'PR', 'PRs')}` : '';
  const volumeLabel = stats.volumeKg > 0 ? `, ${formatVolume(stats.volumeKg, unit)}` : '';
  return (
    <li>
      <Link
        to={`/history/${workout.id}`}
        aria-label={`${workout.name}, ${date}${prLabel}${volumeLabel}`}
        className="flex min-h-[72px] flex-col justify-center gap-0.5 border-b border-border px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:bg-surface-2"
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-body font-semibold">{workout.name}</span>
          {stats.prCount > 0 ? (
            <span
              role="img"
              aria-label={`${String(stats.prCount)} ${plural(stats.prCount, 'personal record', 'personal records')}`}
              className="flex shrink-0 items-center gap-1 text-caption font-semibold tabular-nums text-pr-gold"
            >
              <TrophyIcon size={16} />
              PR
            </span>
          ) : null}
        </span>
        <span className="text-body-sm tabular-nums text-secondary">
          {date} · {duration}
        </span>
        <span className="text-body-sm tabular-nums text-secondary">
          {stats.volumeKg > 0 ? `${formatVolume(stats.volumeKg, unit)} · ` : ''}
          {count} {plural(count, 'exercise', 'exercises')}
        </span>
      </Link>
    </li>
  );
}

export function HistoryList() {
  const unit = useSettingsStore((s) => s.settings.unit);
  const workouts = useLiveQuery<Workout[] | null>(() => listCompletedWorkouts(), [], null);
  const exerciseMap = useExerciseMap();
  const groups = useMemo(() => (workouts === null ? null : groupByMonth(workouts)), [workouts]);
  const types = useMemo(
    () => (exerciseMap === null ? null : toExerciseTypes(exerciseMap)),
    [exerciseMap],
  );

  if (groups === null || types === null) return null;

  return (
    <>
      <Header title="History" />
      {groups.length === 0 ? (
        <EmptyState
          title="No workouts yet"
          description="Your finished workouts will show up here."
        />
      ) : (
        <main>
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`month-${g.key}`}>
              <h2
                id={`month-${g.key}`}
                className="bg-bg px-4 pb-1 pt-4 text-body-sm font-semibold uppercase text-secondary"
              >
                {g.label}
              </h2>
              <ul>
                {g.workouts.map((w) => (
                  <HistoryRow key={w.id} workout={w} types={types} unit={unit} />
                ))}
              </ul>
            </section>
          ))}
        </main>
      )}
    </>
  );
}
