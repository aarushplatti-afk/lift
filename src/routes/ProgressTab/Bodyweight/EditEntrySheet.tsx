import { useState } from 'react';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { Button } from '../../../components/ui/Button';
import { NumberInput } from '../../../components/ui/NumberInput';
import { TextInput } from '../../../components/ui/TextInput';
import { useToastStore } from '../../../components/ui/toastStore';
import { upsertForDate } from '../../../db/repos/bodyweight';
import { BW_NOTE_MAX, validateBodyweightKg } from '../../../lib/calc/bodyweight';
import { parseLocalDate } from '../../../lib/dates';
import { formatWeight, formatWorkoutDate } from '../../../lib/format';
import { fromDisplayInput } from '../../../lib/units';
import type { BodyweightEntry, Unit } from '../../../types/domain';
import { weightErrorMessage } from './weightError';

interface EditEntrySheetProps {
  entry: BodyweightEntry;
  unit: Unit;
  now: number;
  onClose: () => void;
  onDelete: (entry: BodyweightEntry) => void;
}

export function EditEntrySheet({ entry, unit, now, onClose, onDelete }: EditEntrySheetProps) {
  const [weightKg, setWeightKg] = useState<number | undefined>(entry.weightKg);
  const [note, setNote] = useState(entry.note ?? '');
  const [saving, setSaving] = useState(false);

  const error = validateBodyweightKg(weightKg);
  const message = weightErrorMessage(error, unit);

  const save = async () => {
    if (weightKg === undefined || error !== undefined) return;
    setSaving(true);
    const saved = await upsertForDate(entry.date, weightKg, note).then(
      (r) => r.ok,
      () => false,
    );
    if (saved) {
      onClose();
      return;
    }
    setSaving(false);
    useToastStore.getState().show({ message: 'Couldn’t save weigh-in' });
  };

  return (
    <BottomSheet
      open
      title={`Edit weigh-in · ${formatWorkoutDate(parseLocalDate(entry.date), now)}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => {
              onDelete(entry);
              onClose();
            }}
          >
            Delete
          </Button>
          <Button
            className="flex-1"
            disabled={error !== undefined || saving}
            onClick={() => {
              void save();
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <NumberInput
              mode="decimal"
              value={weightKg}
              onCommit={setWeightKg}
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
          label="Note (optional)"
          value={note}
          maxLength={BW_NOTE_MAX}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </div>
    </BottomSheet>
  );
}
