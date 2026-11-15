import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BodyweightChart } from '../../../components/charts/BodyweightChart';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { listEntries } from '../../../db/repos/bodyweight';
import { useLiveQuery } from '../../../hooks/useLiveQuery';
import { useNow } from '../../../hooks/useNow';
import { bodyweightSeries } from '../../../lib/calc/bodyweight';
import { resolveRange } from '../../../lib/calc/range';
import { useProgressViewStore } from '../../../store/progressView';
import { useSettingsStore } from '../../../store/settings';
import type { BodyweightEntry } from '../../../types/domain';
import { RangeSelector } from '../RangeSelector';
import { BodyweightStats } from './BodyweightStats';
import { EditEntrySheet } from './EditEntrySheet';
import { EntriesList } from './EntriesList';
import { LogWeightCard } from './LogWeightCard';
import { useDeleteWithUndo } from './useDeleteWithUndo';

const CHART_HEIGHT = 240;

export function BodyweightView() {
  const entries = useLiveQuery<BodyweightEntry[] | null>(() => listEntries(), [], null);
  const unit = useSettingsStore((s) => s.settings.unit);
  const goalKg = useSettingsStore((s) => s.settings.bodyweightGoalKg);
  const range = useProgressViewStore((s) => s.bodyweightRange);
  const setRange = useProgressViewStore((s) => s.setBodyweightRange);
  const now = useNow(60000);
  const nowDay = useMemo(() => new Date(now).setHours(0, 0, 0, 0), [now]);
  const weightInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<BodyweightEntry | null>(null);
  const deleteWithUndo = useDeleteWithUndo();

  const series = useMemo(() => bodyweightSeries(entries ?? []), [entries]);
  const resolved = useMemo(() => resolveRange(series, range, nowDay), [series, range, nowDay]);

  if (entries === null) return null;

  const latest = series[series.length - 1];
  const card = (
    <LogWeightCard entries={entries} unit={unit} now={now} weightInputRef={weightInputRef} />
  );

  if (latest === undefined) {
    return (
      <>
        {card}
        <EmptyState
          title="No weigh-ins yet"
          description="Log your first weigh-in to start tracking."
          action={
            <Button
              onClick={() => {
                weightInputRef.current?.focus();
              }}
            >
              Log weight
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      {card}
      <RangeSelector value={range} onChange={setRange} />
      {resolved.fellBack ? (
        <p className="text-body-sm text-secondary">
          Fewer than 2 weigh-ins in this range. Showing all time.
        </p>
      ) : null}
      <BodyweightChart
        points={resolved.points}
        goalKg={goalKg}
        unit={unit}
        now={now}
        height={CHART_HEIGHT}
      />
      {goalKg === undefined ? (
        <Link to="/settings" className="self-start text-body-sm font-medium text-accent">
          Set a goal
        </Link>
      ) : null}
      <BodyweightStats
        latest={latest}
        shownPoints={resolved.points}
        fellBack={resolved.fellBack}
        range={range}
        unit={unit}
        now={now}
      />
      <EntriesList
        entries={entries}
        unit={unit}
        now={now}
        onEdit={setEditing}
        onDelete={(entry) => {
          void deleteWithUndo(entry);
        }}
      />
      {editing ? (
        <EditEntrySheet
          key={editing.id}
          entry={editing}
          unit={unit}
          now={now}
          onClose={() => {
            setEditing(null);
          }}
          onDelete={(entry) => {
            void deleteWithUndo(entry);
          }}
        />
      ) : null}
    </>
  );
}
