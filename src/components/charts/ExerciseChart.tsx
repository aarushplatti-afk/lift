import { useCallback, useMemo } from 'react';
import { downsample, isZeroBased, metricKind } from '../../lib/calc/series';
import type { Metric, Point } from '../../lib/calc/series';
import { formatDurationInput } from '../../lib/duration';
import {
  formatMetricValue,
  formatSetDetail,
  formatShortDate,
  formatVolume,
} from '../../lib/format';
import { toDisplay } from '../../lib/units';

import type { ExerciseType, Unit } from '../../types/domain';
import { LineChart } from './LineChart';
import type { ChartDatum } from './LineChart';
import { metricLabel } from './metricLabels';

export interface ExerciseChartProps {
  points: readonly Point[];
  metric: Metric;
  type: ExerciseType;
  unit: Unit;
  now: number;
  height: number;
}

const MAX_POINTS = 500;

export function ExerciseChart({ points, metric, type, unit, now, height }: ExerciseChartProps) {
  const kind = metricKind(metric, type);
  const label = metricLabel(metric, type);

  const data = useMemo<ChartDatum[]>(
    () =>
      downsample(points, MAX_POINTS).map((point) => ({
        t: point.t,
        y: kind === 'kg' ? toDisplay(point.value, unit) : point.value,
        point,
      })),
    [points, unit, kind],
  );

  const formatY = useCallback(
    (y: number): string => {
      if (kind === 'seconds') return formatDurationInput(y);
      return y.toLocaleString('en-US', { maximumFractionDigits: 1 });
    },
    [kind],
  );

  const renderTooltip = useCallback(
    (d: ChartDatum) => {
      const { point } = d;
      const title = formatShortDate(point.t, now);
      const set = point.set;
      const setText = set ? formatSetDetail(set, type, unit) : undefined;
      switch (metric) {
        case 'weight':
          return { title, value: setText ?? formatMetricValue(point.value, kind, unit) };
        case 'e1rm':
          return { title, value: formatMetricValue(point.value, kind, unit), detail: setText };
        case 'volume':
          return {
            title,
            value:
              kind === 'kg'
                ? formatVolume(point.value, unit)
                : formatMetricValue(point.value, kind, unit),
            detail: `${point.setCount} ${point.setCount === 1 ? 'set' : 'sets'}`,
          };
        case 'reps':
          return {
            title,
            value: formatMetricValue(point.value, kind, unit),
            detail: type === 'bodyweight_reps' ? undefined : setText,
          };
        case 'duration':
          return { title, value: formatMetricValue(point.value, kind, unit) };
      }
    },
    [metric, kind, type, unit, now],
  );

  const first = points[0];
  const last = points[points.length - 1];
  const ariaLabel =
    first && last
      ? `${label} chart, ${points.length} ${points.length === 1 ? 'workout' : 'workouts'}, from ${formatShortDate(first.t, now)} to ${formatShortDate(last.t, now)}`
      : `${label} chart, no workouts`;

  return (
    <div>
      <LineChart
        data={data}
        height={height}
        zeroBased={isZeroBased(metric)}
        formatY={formatY}
        renderTooltip={renderTooltip}
        ariaLabel={ariaLabel}
      />
      {points.length === 1 ? (
        <p className="mt-2 text-center text-body-sm text-secondary">
          One workout so far. Log another to see a trend.
        </p>
      ) : null}
    </div>
  );
}
