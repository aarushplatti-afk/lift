import { useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { useElementWidth } from '../../hooks/useElementWidth';
import { xDomain, yAxis } from '../../lib/calc/axis';
import type { Point } from '../../lib/calc/series';
import { ChartTooltip } from './ChartTooltip';
import type { TooltipText } from './ChartTooltip';
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

const YEAR_MS = 365 * 86_400_000;
const Y_AXIS_WIDTH = 48;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function xTicks([lo, hi]: [number, number]): number[] {
  const count = hi - lo > 2 * 86_400_000 ? 4 : 3;
  return Array.from({ length: count }, (_, i) => Math.round(lo + ((hi - lo) * i) / (count - 1)));
}

function formatTick(t: number, spanMs: number): string {
  const d = new Date(t);
  if (spanMs <= YEAR_MS) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${month} ’${String(d.getFullYear()).slice(-2)}`;
}

export function LineChart({ data, height, zeroBased, formatY, renderTooltip, ariaLabel }: LineChartProps) {
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
            content={(p) => <ChartTooltip active={p.active} payload={p.payload} render={renderTooltip} />}
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
