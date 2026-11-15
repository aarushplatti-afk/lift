export interface TooltipText {
  title: string;
  value: string;
  detail?: string;
}

interface ChartTooltipProps<D> {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  isDatum: (v: unknown) => v is D;
  render: (d: D) => TooltipText;
}

export function ChartTooltip<D>({ active, payload, isDatum, render }: ChartTooltipProps<D>) {
  const first = payload?.[0]?.payload;
  if (!active || !isDatum(first)) return null;
  const text = render(first);
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-caption text-secondary">{text.title}</p>
      <p className="text-body font-semibold tabular-nums text-primary">{text.value}</p>
      {text.detail ? (
        <p className="text-caption tabular-nums text-secondary">{text.detail}</p>
      ) : null}
    </div>
  );
}
