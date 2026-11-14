import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExerciseFilterBar } from '../../components/exercises/ExerciseFilterBar';
import { EmptyState } from '../../components/ui/EmptyState';
import { Header } from '../../components/ui/Header';
import { ListRow } from '../../components/ui/ListRow';
import { listExercises } from '../../db/repos/exercises';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { EQUIPMENT, MUSCLE_GROUPS, groupByInitial } from '../../lib/exercises';
import type { Exercise, MuscleGroup } from '../../types/domain';

const LINK_BTN =
  'inline-flex min-h-tap items-center justify-center rounded-control px-4 text-body font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

function subtitleOf(ex: Exercise): string {
  const muscle = MUSCLE_GROUPS.find((m) => m.value === ex.muscleGroup)?.label ?? ex.muscleGroup;
  const equipment = EQUIPMENT.find((q) => q.value === ex.equipment)?.label ?? ex.equipment;
  return `${muscle} · ${equipment}`;
}

function ExerciseRow({ ex }: { ex: Exercise }) {
  return (
    <li>
      <ListRow
        to={`/exercises/${ex.id}`}
        title={ex.name}
        subtitle={subtitleOf(ex)}
        dimmed={ex.archived}
        trailing={
          ex.archived ? (
            <span className="rounded-control border border-border px-2 py-0.5 text-caption font-semibold">
              Archived
            </span>
          ) : undefined
        }
      />
    </li>
  );
}

export function ExerciseList() {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);

  const trimmed = query.trim();
  const exercises = useLiveQuery<Exercise[] | null>(
    () =>
      listExercises({
        includeArchived: showArchived,
        query: trimmed,
        ...(muscle === 'all' ? {} : { muscleGroup: muscle }),
      }),
    [showArchived, trimmed, muscle],
    null,
  );

  const newParams = new URLSearchParams();
  if (trimmed !== '') newParams.set('name', trimmed);
  if (muscle !== 'all') newParams.set('muscle', muscle);
  const newQuery = newParams.toString();
  const newHref = `/exercises/new${newQuery === '' ? '' : `?${newQuery}`}`;
  const filtering = trimmed !== '' || muscle !== 'all';

  let body;
  if (exercises === null) {
    body = null;
  } else if (exercises.length === 0) {
    body = filtering ? (
      <EmptyState
        title="No exercises match"
        description="Try a different search or filter."
        action={
          trimmed !== '' ? (
            <Link to={newHref} className={`${LINK_BTN} bg-accent text-on-accent`}>
              Create “{trimmed}”
            </Link>
          ) : undefined
        }
      />
    ) : (
      <EmptyState
        title="No exercises yet"
        description="Create your first exercise."
        action={
          <Link to={newHref} className={`${LINK_BTN} bg-accent text-on-accent`}>
            New exercise
          </Link>
        }
      />
    );
  } else if (trimmed !== '') {
    body = (
      <ul className="divide-y divide-border">
        {exercises.map((ex) => (
          <ExerciseRow key={ex.id} ex={ex} />
        ))}
      </ul>
    );
  } else {
    body = (
      <div>
        {groupByInitial(exercises).map((group) => (
          <section key={group.letter} aria-label={`Exercises ${group.letter}`}>
            <h2 className="sticky top-[calc(52px+env(safe-area-inset-top))] z-[5] bg-bg px-4 py-1 text-caption font-semibold text-secondary">
              {group.letter}
            </h2>
            <ul className="divide-y divide-border">
              {group.items.map((ex) => (
                <ExerciseRow key={ex.id} ex={ex} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <>
      <Header
        title="Exercises"
        right={
          <Link to="/exercises/new" className={`${LINK_BTN} text-accent`}>
            + New
          </Link>
        }
      />
      <div className="flex flex-col gap-2 px-4 py-3">
        <ExerciseFilterBar query={query} onQuery={setQuery} muscle={muscle} onMuscle={setMuscle} />
        <button
          type="button"
          role="switch"
          aria-checked={showArchived}
          onClick={() => {
            setShowArchived((v) => !v);
          }}
          className="flex min-h-tap items-center justify-between gap-3 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span>Show archived</span>
          <span
            aria-hidden="true"
            className={`flex h-7 w-12 items-center rounded-full border px-0.5 ${
              showArchived
                ? 'justify-end border-accent bg-accent'
                : 'justify-start border-border bg-surface-2'
            }`}
          >
            <span className="h-5 w-5 rounded-full bg-surface" />
          </span>
        </button>
      </div>
      {body}
    </>
  );
}
