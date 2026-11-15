import { useMemo } from 'react';
import { ListRow } from '../../components/ui/ListRow';
import { topSet } from '../../lib/calc/records';
import type { ExerciseSession } from '../../lib/calc/history';
import { isWorkingSet } from '../../lib/calc/volume';
import { formatSetDetail, formatWorkoutDate } from '../../lib/format';
import type { ExerciseType, Unit } from '../../types/domain';

const MAX_SESSIONS = 10;

interface RecentSessionsProps {
  sessions: readonly ExerciseSession[];
  type: ExerciseType;
  unit: Unit;
  now: number;
}

export function RecentSessions({ sessions, type, unit, now }: RecentSessionsProps) {
  const rows = useMemo(
    () =>
      sessions.slice(0, MAX_SESSIONS).map((s) => {
        const working = s.sets.filter((set) => isWorkingSet(set, type));
        const top = topSet(working, type);
        const detail = top
          ? `${formatSetDetail(top, type, unit)} · ${String(working.length)} ${working.length === 1 ? 'set' : 'sets'}`
          : 'Warm-up only';
        return { session: s, detail };
      }),
    [sessions, type, unit],
  );

  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="recent-sessions-heading" className="flex flex-col gap-2">
      <h2 id="recent-sessions-heading" className="text-title-sm font-semibold">
        Recent sessions
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {rows.map(({ session, detail }) => (
          <li key={session.workoutId}>
            <ListRow
              to={`/history/${session.workoutId}`}
              title={`${formatWorkoutDate(session.startedAt, now)} · ${session.workoutName}`}
              subtitle={detail}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
