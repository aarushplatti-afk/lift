import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExerciseChart } from '../../components/charts/ExerciseChart';
import { metricLabel } from '../../components/charts/metricLabels';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { listCompletedWorkouts } from '../../db/repos/workouts';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useNow } from '../../hooks/useNow';
import { exerciseHistory } from '../../lib/calc/history';
import { resolveRange } from '../../lib/calc/range';
import { trainedExercises } from '../../lib/calc/records';
import { exerciseSeries, metricsFor } from '../../lib/calc/series';
import { useProgressViewStore } from '../../store/progressView';
import { useSettingsStore } from '../../store/settings';
import type { Workout } from '../../types/domain';
import { useExerciseMap } from '../WorkoutTab/useExerciseMap';
import { ExerciseSelector } from './ExerciseSelector';
import { MetricChips } from './MetricChips';
import { RangeSelector } from './RangeSelector';
import { RecentSessions } from './RecentSessions';
import { StatCards } from './StatCards';

const CHART_HEIGHT = 240;

function StartWorkoutAction() {
  return (
    <Link to="/">
      <Button>Start a workout</Button>
    </Link>
  );
}

export function ExercisesView() {
  const workouts = useLiveQuery<Workout[] | null>(() => listCompletedWorkouts(), [], null);
  const exercises = useExerciseMap();
  const unit = useSettingsStore((s) => s.settings.unit);
  const storedId = useProgressViewStore((s) => s.exerciseId);
  const storedMetric = useProgressViewStore((s) => s.metric);
  const range = useProgressViewStore((s) => s.range);
  const setExercise = useProgressViewStore((s) => s.setExercise);
  const setMetric = useProgressViewStore((s) => s.setMetric);
  const setRange = useProgressViewStore((s) => s.setRange);

  const now = useNow(60000);
  const nowDay = useMemo(() => new Date(now).setHours(0, 0, 0, 0), [now]);

  const trained = useMemo(() => trainedExercises(workouts ?? []), [workouts]);
  const exerciseId =
    storedId !== undefined && exercises?.has(storedId) ? storedId : trained[0]?.exerciseId;
  const exercise = exerciseId === undefined ? undefined : exercises?.get(exerciseId);
  const type = exercise?.type ?? 'weight_reps';
  const metrics = metricsFor(type);
  const metric =
    storedMetric !== undefined && metrics.includes(storedMetric)
      ? storedMetric
      : (metrics[0] ?? 'weight');

  const sessions = useMemo(
    () => (exerciseId === undefined ? [] : exerciseHistory(exerciseId, workouts ?? [])),
    [workouts, exerciseId],
  );
  const series = useMemo(
    () =>
      exerciseId === undefined ? [] : exerciseSeries(exerciseId, workouts ?? [], metric, type),
    [workouts, exerciseId, metric, type],
  );
  const resolved = useMemo(() => resolveRange(series, range, nowDay), [series, range, nowDay]);

  if (workouts === null || exercises === null) return null;

  if (workouts.length === 0 || exercise === undefined) {
    return (
      <EmptyState
        title="No workouts yet"
        description="Finish a workout to see your progress here."
        action={<StartWorkoutAction />}
      />
    );
  }

  const selector = (
    <ExerciseSelector
      exercise={exercise}
      exercises={exercises}
      trained={trained}
      now={now}
      onSelect={setExercise}
    />
  );

  if (sessions.length === 0) {
    return (
      <>
        {selector}
        <EmptyState
          title="No sessions yet"
          description="Log this exercise a few times to see your progress."
          action={<StartWorkoutAction />}
        />
      </>
    );
  }

  const label = metricLabel(metric, type);

  return (
    <>
      {selector}
      <MetricChips metrics={metrics} type={type} value={metric} onChange={setMetric} />
      <RangeSelector value={range} onChange={setRange} />
      {resolved.fellBack ? (
        <p className="text-body-sm text-secondary">
          Fewer than 2 workouts in this range. Showing all time.
        </p>
      ) : null}
      {series.length === 0 ? (
        <EmptyState title={`No ${label} data yet`} description="Try another metric." />
      ) : (
        <ExerciseChart
          points={resolved.points}
          metric={metric}
          type={type}
          unit={unit}
          now={now}
          height={CHART_HEIGHT}
        />
      )}
      <StatCards
        allPoints={series}
        shownPoints={resolved.points}
        fellBack={resolved.fellBack}
        range={range}
        metric={metric}
        type={type}
        unit={unit}
        workoutCount={sessions.length}
        lastPerformedAt={sessions[0]?.startedAt}
        now={now}
      />
      <RecentSessions sessions={sessions} type={type} unit={unit} now={now} />
    </>
  );
}
