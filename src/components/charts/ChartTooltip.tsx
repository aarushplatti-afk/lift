import type { ChartDatum } from './LineChart';

export interface TooltipText {
  title: string;
  value: string;
  detail?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  render: (d: ChartDatum) => TooltipText;
}

function isDatum(v: unknown): v is ChartDatum {
  return typeof v === 'object' && v !== null && 't' in v && 'y' in v && 'point' in v;
}

export function ChartTooltip({ active, payload, render }: ChartTooltipProps) {
  const first = payload?.[0]?.payload;
  if (!active || !isDatum(first)) return null;
  const text = render(first);
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-caption text-secondary">{text.title}</p>
      <p className="text-body font-semibold tabular-nums text-primary">{text.value}</p>
      {text.detail ? <p className="text-caption tabular-nums text-secondary">{text.detail}</p> : null}
    </div>
  );
}
