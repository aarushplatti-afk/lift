import { useEffect, useRef, useState } from 'react';
import { NumberInput } from '../ui/NumberInput';
import { formatWeight } from '../../lib/format';
import { fromDisplayInput } from '../../lib/units';
import { formatDurationInput, parseDurationInput } from '../../lib/duration';
import {
  REPS_SOFT_CAP,
  WEIGHT_SOFT_CAP,
  softWarnings,
  type CompleteResult,
  type InvalidField,
} from '../../lib/calc/validation';
import type { SetPatch } from '../../lib/workoutOps';
import type { ExerciseType, SetType, Unit, WorkoutSet } from '../../types/domain';
import { SET_COL, SET_ROW_LAYOUT } from './setColumns';

interface SetRowProps {
  set: WorkoutSet;
  index: number;
  type: ExerciseType;
  unit: Unit;
  onChange: (patch: SetPatch) => void;
  onToggle: () => CompleteResult;
  onBadge: () => void;
  badge: string;
  previousText: string;
  onFillPrevious?: () => void;
}

const TYPE_SUFFIX: Record<SetType, string> = {
  normal: '',
  warmup: ', warm-up',
  drop: ', drop set',
  failure: ', failure',
};

const INVALID_MESSAGE: Record<InvalidField, string> = {
  weight: 'Enter a weight',
  reps: 'Enter reps',
  duration: 'Enter a time',
};

const SHAKE_MS = 400;
const ANNOUNCE_MS = 3000;

function parseReps(raw: string): number | undefined {
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function SetRow({
  set,
  index,
  type,
  unit,
  onChange,
  onToggle,
  onBadge,
  badge,
  previousText,
  onFillPrevious,
}: SetRowProps) {
  const n = index + 1;
  const weightRef = useRef<HTMLInputElement>(null);
  const repsRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const [shaking, setShaking] = useState(false);
  const [invalidField, setInvalidField] = useState<InvalidField | null>(null);
  const [message, setMessage] = useState('');
  const shakeTimer = useRef<number>();
  const announceTimer = useRef<number>();

  useEffect(
    () => () => {
      window.clearTimeout(shakeTimer.current);
      window.clearTimeout(announceTimer.current);
    },
    [],
  );

  const usesWeight = type === 'weight_reps' || type === 'weighted_bodyweight';
  const usesReps = type !== 'duration';
  const weightLabel = type === 'weighted_bodyweight' ? 'Added weight' : 'Weight';

  const change = (patch: SetPatch) => {
    setInvalidField(null);
    onChange(patch);
  };

  const handleToggle = () => {
    const result = onToggle();
    if (result.ok) {
      setInvalidField(null);
      return;
    }
    setInvalidField(result.field);
    setShaking(true);
    window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => {
      setShaking(false);
    }, SHAKE_MS);
    setMessage(INVALID_MESSAGE[result.field]);
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => {
      setMessage('');
    }, ANNOUNCE_MS);
    const target =
      result.field === 'weight' ? weightRef : result.field === 'reps' ? repsRef : timeRef;
    target.current?.focus();
  };

  const warnings = softWarnings(set, type, unit);
  const done = set.completed;

  return (
    <div
      role="group"
      aria-label={`Set ${n}`}
      className={`rounded-control px-1 ${done ? 'bg-accent-tint' : ''} ${
        shaking
          ? 'motion-safe:animate-shake motion-reduce:outline motion-reduce:outline-2 motion-reduce:outline-danger'
          : ''
      }`}
    >
      <div className={`${SET_ROW_LAYOUT} min-h-[52px]`}>
        <button
          type="button"
          aria-label={`Set ${n} options${TYPE_SUFFIX[set.type]}`}
          onClick={onBadge}
          className="-mx-1.5 flex h-11 w-11 shrink-0 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-body-sm font-semibold tabular-nums text-primary">
            {badge}
          </span>
        </button>
        {onFillPrevious ? (
          <button
            type="button"
            aria-label={`Use previous: ${previousText}`}
            onClick={onFillPrevious}
            className={`${SET_COL.previous} min-h-tap truncate rounded-control text-center text-body-sm tabular-nums text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
          >
            {previousText}
          </button>
        ) : (
          <span
            className={`${SET_COL.previous} truncate text-center text-body-sm tabular-nums text-secondary`}
          >
            {previousText}
          </span>
        )}
        {usesWeight && (
          <NumberInput
            ref={weightRef}
            aria-label={`${weightLabel} (${unit}) set ${n}`}
            mode="decimal"
            value={set.weightKg}
            format={(kg) => formatWeight(kg, unit)}
            parse={(raw) => fromDisplayInput(raw, unit)}
            onCommit={(v) => {
              change({ weightKg: v ?? null });
            }}
            invalid={invalidField === 'weight'}
            maxLength={7}
            className={`${SET_COL.weight} ${done ? 'opacity-70' : ''}`}
          />
        )}
        {usesReps && (
          <NumberInput
            ref={repsRef}
            aria-label={`Reps set ${n}`}
            mode="integer"
            value={set.reps}
            format={String}
            parse={parseReps}
            onCommit={(v) => {
              change({ reps: v ?? null });
            }}
            invalid={invalidField === 'reps'}
            maxLength={4}
            className={`${SET_COL.reps} ${done ? 'opacity-70' : ''}`}
          />
        )}
        {type === 'duration' && (
          <NumberInput
            ref={timeRef}
            aria-label={`Time set ${n}`}
            mode="duration"
            value={set.durationSec}
            format={formatDurationInput}
            parse={parseDurationInput}
            onCommit={(v) => {
              change({ durationSec: v ?? null });
            }}
            invalid={invalidField === 'duration'}
            maxLength={8}
            placeholder="0:00"
            className={`${SET_COL.time} ${done ? 'opacity-70' : ''}`}
          />
        )}
        <button
          type="button"
          aria-label={`Complete set ${n}`}
          aria-pressed={done}
          onClick={handleToggle}
          className={`${SET_COL.check} flex h-11 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
        >
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
              done ? 'border-accent bg-accent text-on-accent' : 'border-border text-secondary'
            }`}
          >
            <CheckIcon />
          </span>
        </button>
      </div>
      {warnings.includes('weight_high') && (
        <p className="pb-1 text-caption text-warning">
          Over {WEIGHT_SOFT_CAP} {unit}. Check for a typo.
        </p>
      )}
      {warnings.includes('reps_high') && (
        <p className="pb-1 text-caption text-warning">
          Over {REPS_SOFT_CAP} reps. Check for a typo.
        </p>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </div>
  );
}
