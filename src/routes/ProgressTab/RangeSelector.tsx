import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { RANGE_KEYS } from '../../lib/calc/range';
import type { RangeKey } from '../../lib/calc/range';

const OPTIONS = RANGE_KEYS.map((k) => ({ value: k, label: k }));

interface RangeSelectorProps {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
}

export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <SegmentedControl<RangeKey>
      label="Chart range"
      options={OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}
