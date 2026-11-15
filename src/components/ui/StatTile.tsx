interface StatTileProps {
  label: string;
  value: string;
  detail?: string;
}

export function StatTile({ label, value, detail }: StatTileProps) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-card border border-border bg-surface px-2 py-3">
      <span className="text-title font-semibold tabular-nums">{value}</span>
      <span className="text-caption text-secondary">{label}</span>
      {detail ? <span className="text-caption text-secondary tabular-nums">{detail}</span> : null}
    </div>
  );
}
