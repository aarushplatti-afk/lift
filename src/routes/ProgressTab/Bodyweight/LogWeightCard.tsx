import { useState } from 'react';
import type { Ref } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { NumberInput } from '../../../components/ui/NumberInput';
import { TextInput } from '../../../components/ui/TextInput';
import { useToastStore } from '../../../components/ui/toastStore';
import { upsertForDate } from '../../../db/repos/bodyweight';
import { BW_NOTE_MAX, validateBodyweightKg } from '../../../lib/calc/bodyweight';
import { isLocalDateString, todayLocal } from '../../../lib/dates';
import { formatWeight } from '../../../lib/format';
import { fromDisplayInput } from '../../../lib/units';
import type { BodyweightEntry, Unit } from '../../../types/domain';
import { weightErrorMessage } from './weightError';

interface LogWeightCardProps {
  entries: readonly BodyweightEntry[];
  unit: Unit;
  now: number;
  weightInputRef: Ref<HTMLInputElement>;
}

export function LogWeightCard({ entries, unit, now, weightInputRef }: LogWeightCardProps) {
  const [pickedDate, setPickedDate] = useState<string | undefined>(undefined);
  const [typedKg, setTypedKg] = useState<number | undefined>(undefined);
  const [weightTouched, setWeightTouched] = useState(false);
  const [typedNote, setTypedNote] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const today = todayLocal(now);
  const date = pickedDate ?? today;
  const entryForDate = entries.find((e) => e.date === date);
  const latest = entries[0];

  const weightKg = weightTouched ? typedKg : (entryForDate?.weightKg ?? latest?.weightKg);
  const note = typedNote ?? entryForDate?.note ?? '';

  const weightError = validateBodyweightKg(weightKg);
  const message = weightTouched ? weightErrorMessage(weightError, unit) : undefined;
  const dateValid = isLocalDateString(date) && date <= today;
  const canSave = weightError === undefined && dateValid && !saving;

  const resetTouched = () => {
    setWeightTouched(false);
    setTypedKg(undefined);
    setTypedNote(undefined);
  };

  const save = async () => {
    if (weightKg === undefined || !canSave) return;
    setSaving(true);
    const saved = await upsertForDate(date, weightKg, note).then(
      (r) => r.ok,
      () => false,
    );
    setSaving(false);
    if (saved) {
      resetTouched();
      useToastStore.getState().show({ message: 'Weigh-in saved' });
    } else {
      useToastStore.getState().show({ message: 'Couldn’t save weigh-in' });
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-title-sm font-semibold">Log weight</h2>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <NumberInput
            ref={weightInputRef}
            mode="decimal"
            value={weightKg}
            onCommit={(kg) => {
              setWeightTouched(true);
              setTypedKg(kg);
            }}
            format={(kg) => formatWeight(kg, unit)}
            parse={(raw) => fromDisplayInput(raw, unit)}
            aria-label={`Weight in ${unit}`}
            invalid={message !== undefined}
            className="w-28"
          />
          <span className="text-body text-secondary">{unit}</span>
        </div>
        {message !== undefined ? (
          <p role="alert" className="text-body-sm text-danger">
            {message}
          </p>
        ) : null}
      </div>
      <TextInput
        label="Date"
        type="date"
        value={date}
        min="1900-01-01"
        max={today}
        onChange={(e) => {
          setPickedDate(e.target.value);
        }}
      />
      <TextInput
        label="Note (optional)"
        value={note}
        maxLength={BW_NOTE_MAX}
        onChange={(e) => {
          setTypedNote(e.target.value);
        }}
      />
      {entryForDate ? (
        <p className="text-body-sm text-secondary">
          Already logged {formatWeight(entryForDate.weightKg, unit, { withUnit: true })} for this
          day. Saving replaces it.
        </p>
      ) : null}
      <Button
        fullWidth
        disabled={!canSave}
        onClick={() => {
          void save();
        }}
      >
        {entryForDate ? 'Update' : 'Save'}
      </Button>
    </Card>
  );
}
