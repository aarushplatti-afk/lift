import { useMemo, useState } from 'react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { ListRow } from '../../components/ui/ListRow';
import { SearchInput } from '../../components/ui/SearchInput';
import type { TrainedExercise } from '../../lib/calc/records';
import { selectorSections } from '../../lib/exercises';
import { formatRelativeDay } from '../../lib/format';
import type { Exercise } from '../../types/domain';

interface ExerciseSelectorProps {
  exercise?: Exercise;
  exercises: ReadonlyMap<string, Exercise>;
  trained: readonly TrainedExercise[];
  now: number;
  onSelect: (id: string) => void;
}

export function ExerciseSelector({
  exercise,
  exercises,
  trained,
  now,
  onSelect,
}: ExerciseSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const sections = useMemo(
    () => selectorSections([...exercises.values()], trained, query),
    [exercises, trained, query],
  );
  const lastById = useMemo(
    () => new Map(trained.map((t) => [t.exerciseId, t.lastStartedAt])),
    [trained],
  );

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const select = (id: string) => {
    onSelect(id);
    close();
  };
  const name = exercise?.name ?? 'Choose exercise';
  const empty = sections.trained.length === 0 && sections.others.length === 0;

  return (
    <>
      <button
        type="button"
        aria-label={`Exercise: ${name}. Change`}
        onClick={() => {
          setOpen(true);
        }}
        className="flex min-h-tap w-full items-center justify-between gap-2 rounded-control border border-border bg-surface px-4 text-left text-body font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="truncate">{name}</span>
        <span aria-hidden="true" className="text-secondary">
          ▾
        </span>
      </button>
      <BottomSheet open={open} title="Choose exercise" onClose={close}>
        <div className="flex flex-col gap-2">
          <SearchInput
            label="Search exercises"
            placeholder="Search exercises"
            value={query}
            onChange={setQuery}
          />
          {empty ? (
            <p className="py-6 text-center text-body-sm text-secondary">No matching exercises</p>
          ) : null}
          <ul className="-mx-4">
            {sections.trained.map((e) => {
              const last = lastById.get(e.id);
              const parts = [
                last === undefined ? undefined : formatRelativeDay(last, now),
                e.archived ? 'Archived' : undefined,
              ].filter((p): p is string => p !== undefined);
              return (
                <li key={e.id}>
                  <ListRow
                    title={e.name}
                    subtitle={parts.join(' · ')}
                    onClick={() => {
                      select(e.id);
                    }}
                  />
                </li>
              );
            })}
          </ul>
          {sections.others.length > 0 ? (
            <section aria-labelledby="not-logged-heading">
              <h3
                id="not-logged-heading"
                className="pt-2 text-caption font-semibold uppercase text-secondary"
              >
                Not logged yet
              </h3>
              <ul className="-mx-4">
                {sections.others.map((e) => (
                  <li key={e.id}>
                    <ListRow
                      title={e.name}
                      onClick={() => {
                        select(e.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </BottomSheet>
    </>
  );
}
