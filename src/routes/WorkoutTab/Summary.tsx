import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatTile } from '../../components/ui/StatTile';
import { TrophyIcon } from '../../components/workout/TrophyIcon';
import { SaveAsTemplateDialog } from '../../components/workout/SaveAsTemplateDialog';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Header } from '../../components/ui/Header';
import { getWorkout } from '../../db/repos/workouts';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { completedSetCount, workoutVolume } from '../../lib/calc/volume';
import { formatDurationShort, formatSetDetail, formatWeight } from '../../lib/format';
import { useSettingsStore } from '../../store/settings';
import type { Exercise, Unit, WorkoutExercise } from '../../types/domain';
import { toExerciseTypes, useExerciseMap } from './useExerciseMap';

interface PrRow {
  key: string;
  text: string;
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
        text: `${exercise?.name ?? 'Deleted exercise'} · ${formatSetDetail(s, exercise?.type ?? 'weight_reps', unit)}`,
      });
    }
  }
  return rows;
}

export function Summary() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const unit = useSettingsStore((s) => s.settings.unit);
  const exerciseMap = useExerciseMap();
  const workout = useLiveQuery(() => getWorkout(id), [id], null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savedAsTemplate, setSavedAsTemplate] = useState(false);

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
          <StatTile label="Duration" value={duration} />
          <StatTile label="Total volume" value={volume} />
          <StatTile label="Sets" value={String(completedSetCount(workout, types))} />
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
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          disabled={savedAsTemplate}
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          {savedAsTemplate ? 'Saved as template' : 'Save as Template'}
        </Button>
      </main>
      <SaveAsTemplateDialog
        open={dialogOpen}
        workout={workout}
        onClose={() => {
          setDialogOpen(false);
        }}
        onSaved={() => {
          setSavedAsTemplate(true);
          setDialogOpen(false);
        }}
      />
    </>
  );
}
