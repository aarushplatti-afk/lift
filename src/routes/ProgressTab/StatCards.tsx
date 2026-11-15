import { StatTile } from '../../components/ui/StatTile';
import { metricKind } from '../../lib/calc/series';
import type { Metric, Point } from '../../lib/calc/series';
import { rangeStats } from '../../lib/calc/range';
import type { RangeKey } from '../../lib/calc/range';
import { formatChange, formatMetricValue, formatRelativeDay, formatVolume } from '../../lib/format';
import type { ExerciseType, Unit } from '../../types/domain';

interface StatCardsProps {
  allPoints: readonly Point[];
  shownPoints: readonly Point[];
  fellBack: boolean;
  range: RangeKey;
  metric: Metric;
  type: ExerciseType;
  unit: Unit;
  workoutCount: number;
  lastPerformedAt: number | undefined;
  now: number;
}

export function StatCards({
  allPoints,
  shownPoints,
  fellBack,
  range,
  metric,
  type,
  unit,
  workoutCount,
  lastPerformedAt,
  now,
}: StatCardsProps) {
  const kind = metricKind(metric, type);
  const best = rangeStats(allPoints).best;
  const shown = rangeStats(shownPoints);

  const bestText =
    best === undefined
      ? '—'
      : metric === 'volume' && kind === 'kg'
        ? formatVolume(best.value, unit)
        : `${metric === 'weight' && type === 'weighted_bodyweight' ? '+' : ''}${formatMetricValue(best.value, kind, unit)}`;

  let changeValue = '—';
  let changeDetail = 'Need 2+ workouts';
  if (shown.count >= 2 && shown.first && shown.last) {
    const change = formatChange(shown.first.value, shown.last.value, kind, unit, {
      grouped: metric === 'volume',
    });
    changeValue = change.abs;
    changeDetail = change.pct;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <StatTile label="Current best" value={bestText} />
      <StatTile
        label={`Change · ${fellBack ? 'All' : range}`}
        value={changeValue}
        detail={changeDetail}
      />
      <StatTile label="Workouts" value={String(workoutCount)} />
      <StatTile
        label="Last performed"
        value={lastPerformedAt === undefined ? '—' : formatRelativeDay(lastPerformedAt, now)}
      />
    </div>
  );
}
