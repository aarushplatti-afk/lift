import { StatTile } from '../../../components/ui/StatTile';
import { bodyweightStats } from '../../../lib/calc/bodyweight';
import type { BodyweightPoint } from '../../../lib/calc/bodyweight';
import type { RangeKey } from '../../../lib/calc/range';
import { formatBodyweightChange, formatRelativeDay, formatWeight } from '../../../lib/format';
import type { Unit } from '../../../types/domain';

interface BodyweightStatsProps {
  latest: BodyweightPoint;
  shownPoints: readonly BodyweightPoint[];
  fellBack: boolean;
  range: RangeKey;
  unit: Unit;
  now: number;
}

export function BodyweightStats({
  latest,
  shownPoints,
  fellBack,
  range,
  unit,
  now,
}: BodyweightStatsProps) {
  const shown = bodyweightStats(shownPoints);
  const withUnit = { withUnit: true };

  let changeValue = '—';
  let changeDetail = 'Need 2+ weigh-ins';
  if (shown.count >= 2 && shown.first && shown.last) {
    const change = formatBodyweightChange(shown.first.value, shown.last.value, unit);
    changeValue = change.value;
    changeDetail = change.detail;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Current"
          value={formatWeight(latest.value, unit, withUnit)}
          detail={formatRelativeDay(latest.t, now)}
        />
        <StatTile
          label={`Change · ${fellBack ? 'All' : range}`}
          value={changeValue}
          detail={changeDetail}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Min" value={formatWeight(shown.min?.value, unit, withUnit)} />
        <StatTile label="Max" value={formatWeight(shown.max?.value, unit, withUnit)} />
        <StatTile label="Average" value={formatWeight(shown.averageKg, unit, withUnit)} />
      </div>
    </div>
  );
}
