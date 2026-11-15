import { useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { NumberInput } from '../../components/ui/NumberInput';
import { BW_MAX_KG, roundBodyweightKg, validateBodyweightKg } from '../../lib/calc/bodyweight';
import { formatWeight } from '../../lib/format';
import { fromDisplayInput } from '../../lib/units';
import type { Unit } from '../../types/domain';

interface GoalWeightFieldProps {
  goalKg?: number;
  unit: Unit;
  onSave: (kg: number | undefined) => void;
}

interface Pending {
  kg: number | undefined;
  saved: boolean;
}

export function GoalWeightField({ goalKg, unit, onSave }: GoalWeightFieldProps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const shownKg = pending ? pending.kg : goalKg;

  const commit = () => {
    if (!pending || pending.saved) return;
    if (pending.kg === undefined) {
      setPending(null);
      setError(null);
      return;
    }
    const problem = validateBodyweightKg(pending.kg);
    if (problem === 'too_high') {
      setError(`Weight must be under ${formatWeight(BW_MAX_KG, unit, { withUnit: true })}`);
      return;
    }
    if (problem !== undefined) {
      setError('Enter a weight above 0');
      return;
    }
    setError(null);
    const kg = roundBodyweightKg(pending.kg);
    setPending({ kg, saved: true });
    if (kg !== goalKg) onSave(kg);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div className="flex flex-col gap-2" onBlur={commit} onKeyDown={handleKeyDown}>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-body">Goal weight</span>
        <NumberInput
          value={shownKg}
          mode="decimal"
          format={(kg) => formatWeight(kg, unit)}
          parse={(raw) => fromDisplayInput(raw, unit)}
          onCommit={(kg) => {
            setError(null);
            setPending({ kg, saved: false });
          }}
          aria-label={`Goal weight in ${unit}`}
          placeholder="None"
          invalid={error !== null}
          className="w-24"
        />
        <span className="w-6 text-body text-secondary">{unit}</span>
      </div>
      {error !== null && (
        <p id={errorId} role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-body-sm text-secondary">
        Shown as a dashed line on your bodyweight chart.
      </p>
      {goalKg !== undefined && (
        <Button
          variant="ghost"
          onClick={() => {
            setPending(null);
            setError(null);
            onSave(undefined);
          }}
        >
          Clear goal
        </Button>
      )}
    </div>
  );
}
