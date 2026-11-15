import { useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { useElementWidth } from '../../hooks/useElementWidth';
import { xDomain, yAxis } from '../../lib/calc/axis';
import type { Point } from '../../lib/calc/series';
import { ChartTooltip } from './ChartTooltip';
import type { TooltipText } from './ChartTooltip';
import { formatTick, prefersReducedMotion, xTicks, Y_AXIS_WIDTH } from './chartAxis';
import './chart.css';

export interface ChartDatum {
  t: number;
  y: number;
  point: Point;
}

export interface LineChartProps {
  data: readonly ChartDatum[];
  height: number;
  zeroBased: boolean;
  formatY: (y: number) => string;
  renderTooltip: (d: ChartDatum) => TooltipText;
  ariaLabel: string;
}

function isDatum(v: unknown): v is ChartDatum {
  return typeof v === 'object' && v !== null && 't' in v && 'y' in v && 'point' in v;
}

export function LineChart({
  data,
  height,
  zeroBased,
  formatY,
  renderTooltip,
  ariaLabel,
}: LineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const axes = useMemo(() => {
    const domain = xDomain(data.map((d) => d.t));
    return {
      x: domain,
      xTicks: xTicks(domain),
      y: yAxis(
        data.map((d) => d.y),
        zeroBased,
      ),
    };
  }, [data, zeroBased]);
  const span = axes.x[1] - axes.x[0];
  const dotR = data.length > 150 ? 2 : 3;
  const animate = !prefersReducedMotion();
  const mutable = useMemo(() => [...data], [data]);

  return (
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
          <Line
            type={data.length >= 2 ? 'monotone' : 'linear'}
            dataKey="y"
            stroke="currentColor"
            strokeWidth={2}
            dot={{ r: dotR }}
            activeDot={{ r: 5 }}
            isAnimationActive={animate}
            animationDuration={200}
            animationEasing="ease-out"
          />
        </ComposedChart>
      ) : null}
    </div>
  );
}
