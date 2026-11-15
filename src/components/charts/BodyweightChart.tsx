import { useCallback, useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { useElementWidth } from '../../hooks/useElementWidth';
import { xDomain, yAxis } from '../../lib/calc/axis';
import type { BodyweightPoint } from '../../lib/calc/bodyweight';
import { downsample } from '../../lib/calc/series';
import { formatShortDate, formatWeight } from '../../lib/format';
import { toDisplay } from '../../lib/units';
import type { Unit } from '../../types/domain';
import { ChartTooltip } from './ChartTooltip';
import type { TooltipText } from './ChartTooltip';
import { formatTick, prefersReducedMotion, xTicks, Y_AXIS_WIDTH } from './chartAxis';
import './chart.css';

export interface BodyweightChartProps {
  points: readonly BodyweightPoint[];
  goalKg?: number;
  unit: Unit;
  now: number;
  height: number;
}

interface BodyweightDatum {
  t: number;
  raw: number;
  trend: number;
  point: BodyweightPoint;
}

const MAX_POINTS = 500;
const NOTE_MAX = 40;

function isDatum(v: unknown): v is BodyweightDatum {
  return typeof v === 'object' && v !== null && 't' in v && 'raw' in v && 'point' in v;
}

function truncateNote(note: string): string {
  return note.length > NOTE_MAX ? `${note.slice(0, NOTE_MAX)}…` : note;
}

export function BodyweightChart({ points, goalKg, unit, now, height }: BodyweightChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();

  const data = useMemo<BodyweightDatum[]>(
    () =>
      downsample(points, MAX_POINTS).map((point) => ({
        t: point.t,
        raw: toDisplay(point.value, unit),
        trend: toDisplay(point.trend, unit),
        point,
      })),
    [points, unit],
  );

  const goal = goalKg === undefined ? undefined : toDisplay(goalKg, unit);

  const axes = useMemo(() => {
    const domain = xDomain(data.map((d) => d.t));
    const ys = data.flatMap((d) => [d.raw, d.trend]);
    if (goal !== undefined) ys.push(goal);
    return { x: domain, xTicks: xTicks(domain), y: yAxis(ys, false) };
  }, [data, goal]);

  const formatY = useCallback(
    (y: number): string => y.toLocaleString('en-US', { maximumFractionDigits: 1 }),
    [],
  );

  const renderTooltip = useCallback(
    (d: BodyweightDatum): TooltipText => {
      const { entry } = d.point;
      const trendText = `Trend ${formatWeight(d.point.trend, unit, { withUnit: true })}`;
      return {
        title: formatShortDate(d.t, now),
        value: formatWeight(d.point.value, unit, { withUnit: true }),
        detail: entry.note ? `${trendText} · ${truncateNote(entry.note)}` : trendText,
      };
    },
    [unit, now],
  );

  const span = axes.x[1] - axes.x[0];
  const dotR = data.length > 150 ? 1.5 : 2.5;
  const animate = !prefersReducedMotion();
  const mutable = useMemo(() => [...data], [data]);

  const first = points[0];
  const last = points[points.length - 1];
  const ariaLabel =
    first && last
      ? `Bodyweight chart, ${points.length} ${points.length === 1 ? 'weigh-in' : 'weigh-ins'}, from ${formatShortDate(first.t, now)} to ${formatShortDate(last.t, now)}`
      : 'Bodyweight chart, no weigh-ins';

  return (
    <div>
      <div ref={ref} className="lift-chart w-full" style={{ height }}>
        <p className="sr-only">{ariaLabel}</p>
        {width > 0 ? (
          <ComposedChart
            width={width}
            height={height}
            data={mutable}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={axes.x}
              ticks={axes.xTicks}
              tickFormatter={(t: number) => formatTick(t, span)}
              padding={{ left: 8, right: 8 }}
              tickMargin={6}
            />
            <YAxis
              type="number"
              domain={axes.y.domain}
              ticks={axes.y.ticks}
              tickFormatter={formatY}
              width={Y_AXIS_WIDTH}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor
              content={(p) => (
                <ChartTooltip
                  active={p.active}
                  payload={p.payload}
                  isDatum={isDatum}
                  render={renderTooltip}
                />
              )}
            />
            {goal !== undefined && goalKg !== undefined ? (
              <ReferenceLine
                y={goal}
                className="lift-bw-goal"
                strokeDasharray="6 4"
                ifOverflow="extendDomain"
                label={{
                  value: `Goal ${formatWeight(goalKg, unit, { withUnit: true })}`,
                  position: 'insideTopRight',
                  className: 'lift-bw-goal-label',
                }}
              />
            ) : null}
            <Line
              type="linear"
              dataKey="raw"
              className="lift-bw-raw"
              dot={{ r: dotR, className: 'lift-bw-raw-dot' }}
              activeDot={{ r: 5 }}
              isAnimationActive={animate}
              animationDuration={200}
              animationEasing="ease-out"
            />
            {data.length >= 2 ? (
              <Line
                type="monotone"
                dataKey="trend"
                className="lift-bw-trend"
                dot={false}
                activeDot={false}
                isAnimationActive={animate}
                animationDuration={200}
                animationEasing="ease-out"
              />
            ) : null}
          </ComposedChart>
        ) : null}
      </div>
      {points.length === 1 ? (
        <p className="mt-2 text-center text-body-sm text-secondary">
          One weigh-in so far. Log another to see a trend.
        </p>
      ) : null}
    </div>
  );
}
