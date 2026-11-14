import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { TextArea } from '../ui/TextArea';
import { TextInput } from '../ui/TextInput';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { isNameTaken } from '../../db/repos/exercises';
import type {
  ExerciseFieldError,
  ExerciseInput,
  ExerciseWriteResult,
} from '../../db/repos/exercises';
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  NAME_MAX,
  NOTES_MAX,
  normalizeName,
} from '../../lib/exercises';
import type { Equipment, ExerciseType, MuscleGroup } from '../../types/domain';

interface ExerciseFormProps {
  initial?: Partial<ExerciseInput>;
  locked?: { name?: boolean; type?: boolean };
  lockReason?: string;
  submitLabel: string;
  onSubmit: (input: ExerciseInput) => Promise<ExerciseWriteResult | undefined>;
  onCancel: () => void;
  excludeId?: string;
  formId?: string;
  showSubmit?: boolean;
}

type FieldKey = ExerciseFieldError['field'];
type Errors = Partial<Record<FieldKey, string>>;

const MSG_NAME_REQUIRED = 'Enter a name.';
const MSG_NAME_TOO_LONG = `Name must be ${NAME_MAX} characters or fewer.`;
const MSG_MUSCLE = 'Choose a muscle group.';
const MSG_EQUIPMENT = 'Choose equipment.';
const MSG_NOTES_TOO_LONG = `Notes must be ${NOTES_MAX} characters or fewer.`;
const DEFAULT_LOCK_REASON = 'This field can’t be changed.';

function duplicateMessage(name: string): string {
  return `You already have an exercise named “${name}”.`;
}

function validate(name: string, muscle: string, equipment: string, notes: string): Errors {
  const errors: Errors = {};
  const n = normalizeName(name);
  if (n === '') errors.name = MSG_NAME_REQUIRED;
  else if (n.length > NAME_MAX) errors.name = MSG_NAME_TOO_LONG;
  if (muscle === '') errors.muscleGroup = MSG_MUSCLE;
  if (equipment === '') errors.equipment = MSG_EQUIPMENT;
  if (notes.length > NOTES_MAX) errors.notes = MSG_NOTES_TOO_LONG;
  return errors;
}

export function ExerciseForm({
  initial,
  locked,
  lockReason = DEFAULT_LOCK_REASON,
  submitLabel,
  onSubmit,
  onCancel,
  excludeId,
  formId,
  showSubmit = true,
}: ExerciseFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [muscle, setMuscle] = useState<MuscleGroup | ''>(initial?.muscleGroup ?? '');
  const [equipment, setEquipment] = useState<Equipment | ''>(initial?.equipment ?? '');
  const [type, setType] = useState<ExerciseType>(initial?.type ?? 'weight_reps');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const normalized = normalizeName(name);
  const taken = useLiveQuery(
    () => (normalized === '' ? Promise.resolve(false) : isNameTaken(normalized, excludeId)),
    [normalized, excludeId],
    false,
  );

  const clientErrors = validate(name, muscle, equipment, notes);
  if (clientErrors.name === undefined && taken && !locked?.name) {
    clientErrors.name = duplicateMessage(normalized);
  }

  const shown = (field: FieldKey): string | undefined =>
    serverErrors[field] ?? (touched[field] === true ? clientErrors[field] : undefined);

  const touch = (field: FieldKey) => {
    setTouched((t) => ({ ...t, [field]: true }));
  };

  const clearServer = (field: FieldKey) => {
    setServerErrors((e) => {
      if (e[field] === undefined) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  };

  const messageFor = (error: ExerciseFieldError): string => {
    switch (error.code) {
      case 'duplicate':
        return duplicateMessage(normalized);
      case 'locked':
        return lockReason;
      case 'too_long':
        return error.field === 'notes' ? MSG_NOTES_TOO_LONG : MSG_NAME_TOO_LONG;
      case 'required':
        if (error.field === 'muscleGroup') return MSG_MUSCLE;
        if (error.field === 'equipment') return MSG_EQUIPMENT;
        return MSG_NAME_REQUIRED;
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setTouched({ name: true, muscleGroup: true, equipment: true, notes: true });
    if (Object.keys(clientErrors).length > 0 || muscle === '' || equipment === '') return;
    const input: ExerciseInput = {
      name: normalized,
      muscleGroup: muscle,
      equipment,
      type,
    };
    if (notes.trim() !== '') input.notes = notes;
    setSubmitting(true);
    try {
      const result = await onSubmit(input);
      if (result?.ok === false) {
        const { error } = result;
        setServerErrors({ [error.field]: messageFor(error) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const anyLocked = locked?.name === true || locked?.type === true;

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="flex flex-col gap-4"
    >
      <TextInput
        label="Name"
        value={name}
        maxLength={NAME_MAX}
        autoCapitalize="words"
        autoComplete="off"
        disabled={locked?.name === true}
        error={shown('name')}
        onChange={(e) => {
          setName(e.target.value);
          clearServer('name');
        }}
        onBlur={() => {
          touch('name');
        }}
      />
      <Select
        label="Muscle group"
        value={muscle}
        error={shown('muscleGroup')}
        onChange={(e) => {
          setMuscle(e.target.value as MuscleGroup | '');
          clearServer('muscleGroup');
        }}
        onBlur={() => {
          touch('muscleGroup');
        }}
      >
        <option value="">Choose…</option>
        {MUSCLE_GROUPS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
      <Select
        label="Equipment"
        value={equipment}
        error={shown('equipment')}
        onChange={(e) => {
          setEquipment(e.target.value as Equipment | '');
          clearServer('equipment');
        }}
        onBlur={() => {
          touch('equipment');
        }}
      >
        <option value="">Choose…</option>
        {EQUIPMENT.map((q) => (
          <option key={q.value} value={q.value}>
            {q.label}
          </option>
        ))}
      </Select>
      <Select
        label="Type"
        value={type}
        disabled={locked?.type === true}
        error={shown('type')}
        onChange={(e) => {
          setType(e.target.value as ExerciseType);
          clearServer('type');
        }}
      >
        {EXERCISE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      {anyLocked && <p className="text-body-sm text-secondary">{lockReason}</p>}
      <TextArea
        label="Notes (optional)"
        value={notes}
        maxLength={NOTES_MAX}
        error={shown('notes')}
        onChange={(e) => {
          setNotes(e.target.value);
          clearServer('notes');
        }}
        onBlur={() => {
          touch('notes');
        }}
      />
      {showSubmit && (
        <div className="flex gap-2 pb-[env(safe-area-inset-bottom)]">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" fullWidth disabled={submitting}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
