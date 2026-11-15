import { Link } from 'react-router-dom';
import { ListRow } from '../../../components/ui/ListRow';
import { formatSetDetail, formatShortDate } from '../../../lib/format';
import { MUSCLE_GROUPS } from '../../../lib/exercises';
import { recordCards } from '../../../lib/recordCards';
import type { ExerciseRecords } from '../../../lib/calc/records';
import type { Exercise, Unit } from '../../../types/domain';

interface PRGroupCardProps {
  exercise: Exercise;
  records: ExerciseRecords;
  unit: Unit;
  now: number;
}

export function PRGroupCard({ exercise, records, unit, now }: PRGroupCardProps) {
  const muscle = MUSCLE_GROUPS.find((m) => m.value === exercise.muscleGroup)?.label ?? '';
  const cards = recordCards(records, exercise.type, unit);
  return (
    <section
      aria-label={exercise.name}
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <Link
        to={`/progress?exercise=${encodeURIComponent(exercise.id)}`}
        aria-label={`${exercise.name} progress`}
        className="flex min-h-[56px] flex-col justify-center border-b border-border px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:bg-surface-2"
      >
        <span className="truncate text-body font-semibold text-primary">{exercise.name}</span>
        <span className="truncate text-body-sm text-secondary">
          {muscle}
          {exercise.archived ? ' · Archived' : ''}
        </span>
      </Link>
      <ul className="divide-y divide-border">
        {cards.map((card) => (
          <li key={card.key}>
            <ListRow
              to={`/history/${card.entry.workoutId}`}
              title={card.label}
              subtitle={`${formatSetDetail(card.entry.set, exercise.type, unit)} · ${formatShortDate(card.entry.startedAt, now)}`}
              trailing={card.value}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
