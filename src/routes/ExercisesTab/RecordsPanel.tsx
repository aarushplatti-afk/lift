import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { listCompletedWorkouts } from '../../db/repos/workouts';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useNow } from '../../hooks/useNow';
import { exerciseRecords } from '../../lib/calc/records';
import type { RecordEntry } from '../../lib/calc/records';
import { formatDurationInput } from '../../lib/duration';
import { formatSetDetail, formatShortDate, formatVolume, formatWeight } from '../../lib/format';
import { useSettingsStore } from '../../store/settings';
import type { Exercise, Unit, Workout } from '../../types/domain';

interface Card {
  key: string;
  label: string;
  entry: RecordEntry;
  value: string;
}

function buildCards(exercise: Exercise, workouts: readonly Workout[], unit: Unit): Card[] {
  const records = exerciseRecords(exercise.id, workouts, exercise.type);
  const plus = exercise.type === 'weighted_bodyweight' ? '+' : '';
  const cards: Card[] = [];
  if (records.weight) {
    const value = `${plus}${formatWeight(records.weight.value, unit, { withUnit: true })}`;
    cards.push({ key: 'weight', label: 'Best weight', entry: records.weight, value });
  }
  if (records.e1rm) {
    const value = formatWeight(records.e1rm.value, unit, { withUnit: true });
    cards.push({ key: 'e1rm', label: 'Best est. 1RM', entry: records.e1rm, value });
  }
  if (records.setVolume) {
    const value = formatVolume(records.setVolume.value, unit);
    cards.push({ key: 'setVolume', label: 'Best set volume', entry: records.setVolume, value });
  }
  if (records.reps) {
    const value = `${records.reps.value} reps`;
    cards.push({ key: 'reps', label: 'Most reps', entry: records.reps, value });
  }
  if (records.duration) {
    const value = formatDurationInput(records.duration.value);
    cards.push({ key: 'duration', label: 'Longest set', entry: records.duration, value });
  }
  return cards;
}

export function RecordsPanel({ exercise }: { exercise: Exercise }) {
  const unit = useSettingsStore((s) => s.settings.unit);
  const now = useNow(60000);
  const workouts = useLiveQuery<Workout[] | null>(() => listCompletedWorkouts(), [], null);
  if (workouts === null) return null;
  const cards = buildCards(exercise, workouts, unit);
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
