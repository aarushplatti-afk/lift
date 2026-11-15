import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ExerciseFilterBar } from '../../../components/exercises/ExerciseFilterBar';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { listCompletedWorkouts } from '../../../db/repos/workouts';
import { useLiveQuery } from '../../../hooks/useLiveQuery';
import { useNow } from '../../../hooks/useNow';
import { recordsByExercise } from '../../../lib/calc/records';
import { prGroups } from '../../../lib/exercises';
import { useProgressViewStore } from '../../../store/progressView';
import { useSettingsStore } from '../../../store/settings';
import type { Workout } from '../../../types/domain';
import { toExerciseTypes, useExerciseMap } from '../../WorkoutTab/useExerciseMap';
import { PRGroupCard } from './PRGroupCard';

export function PRsView() {
  const workouts = useLiveQuery<Workout[] | null>(() => listCompletedWorkouts(), [], null);
  const exercises = useExerciseMap();
  const unit = useSettingsStore((s) => s.settings.unit);
  const query = useProgressViewStore((s) => s.prsQuery);
  const muscle = useProgressViewStore((s) => s.prsMuscle);
  const setQuery = useProgressViewStore((s) => s.setPrsQuery);
  const setMuscle = useProgressViewStore((s) => s.setPrsMuscle);
  const now = useNow(60000);

  const records = useMemo(
    () =>
      workouts === null || exercises === null
        ? null
        : recordsByExercise(workouts, toExerciseTypes(exercises)),
    [workouts, exercises],
  );
  const groups = useMemo(
    () =>
      records === null || exercises === null ? [] : prGroups(exercises, records, query, muscle),
    [exercises, records, query, muscle],
  );

  if (records === null) return null;

  if (records.size === 0) {
    return (
      <EmptyState
        title="No records yet"
        description="Finish a workout to set your first records."
        action={
          <Link to="/">
            <Button>Start a workout</Button>
          </Link>
        }
      />
    );
  }

  const clearFilters = () => {
    setQuery('');
    setMuscle('all');
  };

  return (
    <>
      <ExerciseFilterBar query={query} onQuery={setQuery} muscle={muscle} onMuscle={setMuscle} />
      {groups.length === 0 ? (
        <EmptyState
          title="No matching records"
          description="Try another search or muscle group."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <PRGroupCard
              key={g.exercise.id}
              exercise={g.exercise}
              records={g.records}
              unit={unit}
              now={now}
            />
          ))}
        </div>
      )}
    </>
  );
}
