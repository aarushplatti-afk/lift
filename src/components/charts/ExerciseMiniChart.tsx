import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { listCompletedWorkouts } from '../../db/repos/workouts';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useNow } from '../../hooks/useNow';
import { exerciseSeries, metricsFor } from '../../lib/calc/series';
import { useSettingsStore } from '../../store/settings';
import type { Exercise, Workout } from '../../types/domain';
import { EmptyState } from '../ui/EmptyState';
import { ExerciseChart } from './ExerciseChart';
import { metricLabel } from './metricLabels';

const HEIGHT = 180;

export default function ExerciseMiniChart({ exercise }: { exercise: Exercise }) {
  const unit = useSettingsStore((s) => s.settings.unit);
  const now = useNow(60000);
  const workouts = useLiveQuery<Workout[] | null>(() => listCompletedWorkouts(), [], null);
  const metric = metricsFor(exercise.type)[0];
  const points = useMemo(
    () =>
      workouts === null || metric === undefined
        ? []
        : exerciseSeries(exercise.id, workouts, metric, exercise.type),
    [workouts, exercise.id, exercise.type, metric],
  );

  if (workouts === null || metric === undefined) return null;
  if (points.length === 0) {
    const empty = workouts.length === 0;
    return (
      <EmptyState
        title={empty ? 'No workouts yet' : `No ${metricLabel(metric, exercise.type)} data yet`}
        description={
          empty
            ? 'Finish a workout to see your progress here.'
            : 'Log this exercise a few times to see your progress.'
        }
        action={
          <Link
            to="/"
            className="inline-flex min-h-tap items-center px-4 text-body font-semibold text-accent"
          >
            Start a workout
          </Link>
        }
      />
    );
  }
  return (
    <ExerciseChart
      points={points}
      metric={metric}
      type={exercise.type}
      unit={unit}
      now={now}
      height={HEIGHT}
    />
  );
}
