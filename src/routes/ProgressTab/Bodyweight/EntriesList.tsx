import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { SwipeRow } from '../../../components/ui/SwipeRow';
import { parseLocalDate } from '../../../lib/dates';
import { formatWeight, formatWorkoutDate } from '../../../lib/format';
import type { BodyweightEntry, Unit } from '../../../types/domain';

const PAGE = 30;

interface EntriesListProps {
  entries: readonly BodyweightEntry[];
  unit: Unit;
  now: number;
  onEdit: (entry: BodyweightEntry) => void;
  onDelete: (entry: BodyweightEntry) => void;
}

export function EntriesList({ entries, unit, now, onEdit, onDelete }: EntriesListProps) {
  const [limit, setLimit] = useState(PAGE);
  const visible = entries.slice(0, limit);

  return (
    <section aria-label="Weigh-ins" className="flex flex-col gap-2">
      <h2 className="text-title-sm font-semibold">Weigh-ins</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {visible.map((entry) => {
          const date = formatWorkoutDate(parseLocalDate(entry.date), now);
          const weight = formatWeight(entry.weightKg, unit, { withUnit: true });
          return (
            <li key={entry.id}>
              <SwipeRow
                deleteLabel={`Delete weigh-in ${date}`}
                onDelete={() => {
                  onDelete(entry);
                }}
              >
                <button
                  type="button"
                  aria-label={`Edit weigh-in ${date}, ${weight}`}
                  onClick={() => {
                    onEdit(entry);
                  }}
                  className="flex min-h-tap w-full flex-col gap-0.5 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-body">{date}</span>
                    <span className="text-body font-semibold tabular-nums">{weight}</span>
                  </span>
                  {entry.note ? (
                    <span className="truncate text-body-sm text-secondary">{entry.note}</span>
                  ) : null}
                </button>
              </SwipeRow>
            </li>
          );
        })}
      </ul>
      {entries.length > limit ? (
        <Button
          variant="secondary"
          onClick={() => {
            setLimit(limit + PAGE);
          }}
        >
          Show more
        </Button>
      ) : null}
    </section>
  );
}
