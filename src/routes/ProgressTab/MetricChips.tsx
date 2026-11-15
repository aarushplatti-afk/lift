import { ChipGroup } from '../../components/ui/Chip';
import { metricLabel } from '../../components/charts/metricLabels';
import type { Metric } from '../../lib/calc/series';
import type { ExerciseType } from '../../types/domain';

interface MetricChipsProps {
  metrics: readonly Metric[];
  type: ExerciseType;
  value: Metric;
  onChange: (metric: Metric) => void;
}

export function MetricChips({ metrics, type, value, onChange }: MetricChipsProps) {
  if (metrics.length < 2) return null;
  return (
    <ChipGroup<Metric>
      label="Chart metric"
      options={metrics.map((m) => ({ value: m, label: metricLabel(m, type) }))}
      value={value}
      onChange={(v) => {
        if (v !== 'all') onChange(v);
      }}
    />
  );
}
