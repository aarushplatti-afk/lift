import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { listCompletedWorkouts } from '../../db/repos/workouts';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useNow } from '../../hooks/useNow';
import { exerciseRecords } from '../../lib/calc/records';
import { formatSetDetail, formatShortDate } from '../../lib/format';
import { recordCards } from '../../lib/recordCards';
import { useSettingsStore } from '../../store/settings';
import type { Exercise, Workout } from '../../types/domain';

export function RecordsPanel({ exercise }: { exercise: Exercise }) {
  const unit = useSettingsStore((s) => s.settings.unit);
  const now = useNow(60000);
  const workouts = useLiveQuery<Workout[] | null>(() => listCompletedWorkouts(), [], null);
  if (workouts === null) return null;
  const cards = recordCards(
    exerciseRecords(exercise.id, workouts, exercise.type),
    exercise.type,
    unit,
  );
  if (cards.length === 0) {
    return (
      <EmptyState
        title="No records yet"
        description="Complete a working set to set your first record."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {cards.map((card) => (
        <li key={card.key}>
          <Link
            to={`/history/${card.entry.workoutId}`}
            className="block min-h-tap rounded-card border border-border bg-surface p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <p className="text-body-sm text-secondary">{card.label}</p>
            <p className="text-title-sm font-semibold tabular-nums">{card.value}</p>
            <p className="text-body-sm text-secondary tabular-nums">
              {formatSetDetail(card.entry.set, exercise.type, unit)} ·{' '}
              {formatShortDate(card.entry.startedAt, now)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
