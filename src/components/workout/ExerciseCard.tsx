import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Stepper } from '../ui/Stepper';
import { SwipeRow } from '../ui/SwipeRow';
import { TextArea } from '../ui/TextArea';
import { groupOrdinals, previousSetFor, setBadgeLabels } from '../../lib/calc/previous';
import { REST_MAX_SEC, REST_MIN_SEC, REST_STEP_SEC } from '../../lib/calc/rest';
import type { CompleteResult } from '../../lib/calc/validation';
import { formatDurationInput } from '../../lib/duration';
import { NOTES_MAX } from '../../lib/exercises';
import { formatPreviousSet } from '../../lib/format';
import { unlockChime } from '../../lib/platform/chime';
import { HAPTIC_TAP, vibrate } from '../../lib/platform/haptics';
import type { SetPatch } from '../../lib/workoutOps';
import { useActiveWorkoutStore } from '../../store/activeWorkout';
import { useRestTimerStore } from '../../store/restTimer';
import { useTemplateDraftStore } from '../../store/templateDraft';
import { useSettingsStore } from '../../store/settings';
import { useWorkoutEditStore } from '../../store/workoutEditDraft';
import type {
  Exercise,
  ExerciseType,
  SetType,
  Unit,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../../types/domain';
import { SetRow } from './SetRow';
import { WorkoutSetTable } from './WorkoutSetTable';

interface ExerciseCardProps {
  we: WorkoutExercise;
  index: number;
  count: number;
  exercise: Exercise | undefined;
  unit: Unit;
  previous: Workout | undefined;
  mode?: CardMode;
}

type CardMode = 'workout' | 'template' | 'edit';

const DELETED_NAME = 'Deleted exercise';

const SET_TYPE_OPTIONS: readonly { value: SetType; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'drop', label: 'Drop set' },
  { value: 'failure', label: 'Failure' },
];

function fillPatch(prev: WorkoutSet, type: ExerciseType): SetPatch {
  const patch: SetPatch = {};
  if ((type === 'weight_reps' || type === 'weighted_bodyweight') && prev.weightKg !== undefined) {
    patch.weightKg = prev.weightKg;
  }
  if (type !== 'duration' && prev.reps !== undefined) patch.reps = prev.reps;
  if (type === 'duration' && prev.durationSec !== undefined) patch.durationSec = prev.durationSec;
  return patch;
}

interface CardActions {
  addSet: (weId: string) => void;
  updateSet: (weId: string, setId: string, patch: SetPatch) => void;
  removeSet: (weId: string, setId: string) => void;
  removeExercise: (weId: string, name?: string) => void;
  moveExercise: (weId: string, dir: -1 | 1) => void;
  setSetType: (weId: string, setId: string, type: SetType) => void;
  setRestSeconds: (weId: string, sec: number | null) => void;
  toggleComplete: (weId: string, setId: string, type: ExerciseType) => CompleteResult;
  setExerciseNotes: (weId: string, notes: string) => void;
}

const templateNoops = {
  toggleComplete: (): CompleteResult => ({ ok: true, completed: false }),
  setExerciseNotes: (): void => undefined,
};

function useCardActions(mode: CardMode): CardActions {
  const w = useActiveWorkoutStore(
    useShallow((s) => ({
      addSet: s.addSet,
      updateSet: s.updateSet,
      removeSet: s.removeSet,
      removeExercise: s.removeExercise,
      moveExercise: s.moveExercise,
      setSetType: s.setSetType,
      setRestSeconds: s.setRestSeconds,
      toggleComplete: s.toggleComplete,
      setExerciseNotes: s.setExerciseNotes,
    })),
  );
  const t = useTemplateDraftStore(
    useShallow((s) => ({
      addSet: s.addSet,
      updateSet: s.updateSet,
      removeSet: s.removeSet,
      removeExercise: s.removeExercise,
      moveExercise: s.moveExercise,
      setSetType: s.setSetType,
      setRestSeconds: s.setRestSeconds,
      ...templateNoops,
    })),
  );
  const e = useWorkoutEditStore(
    useShallow((s) => ({
      addSet: s.addSet,
      updateSet: s.updateSet,
      removeSet: s.removeSet,
      removeExercise: s.removeExercise,
      moveExercise: s.moveExercise,
      setSetType: s.setSetType,
      setRestSeconds: s.setRestSeconds,
      toggleComplete: s.toggleComplete,
      setExerciseNotes: s.setExerciseNotes,
    })),
  );
  if (mode === 'template') return t;
  return mode === 'edit' ? e : w;
}

export function ExerciseCard({
  we,
  index,
  count,
  exercise,
  unit,
  previous,
  mode = 'workout',
}: ExerciseCardProps) {
  const template = mode === 'template';
  const edit = mode === 'edit';
  const {
    addSet,
    updateSet,
    removeSet,
    removeExercise,
    moveExercise,
    setSetType,
    setRestSeconds,
    toggleComplete,
    setExerciseNotes,
  } = useCardActions(mode);
  const workoutId = useActiveWorkoutStore((s) => s.workout?.id);
  const settings = useSettingsStore((s) => s.settings);
  const startRest = useRestTimerStore((s) => s.start);

  const [menuOpen, setMenuOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [badgeSetId, setBadgeSetId] = useState<string | null>(null);
  const [restOpen, setRestOpen] = useState(false);
  const [restDraft, setRestDraft] = useState(settings.defaultRestSeconds);

  const name = exercise?.name ?? DELETED_NAME;
  const type = exercise?.type ?? 'weight_reps';
  const notes = we.notes ?? '';
  const showNote = !template && (noteOpen || notes !== '');
  const badgeIndex = we.sets.findIndex((s) => s.id === badgeSetId);
  const ordinals = groupOrdinals(we.sets);
  const badges = setBadgeLabels(we.sets);
  const restLabel =
    we.restSeconds === undefined
      ? `Default (${formatDurationInput(settings.defaultRestSeconds)})`
      : formatDurationInput(we.restSeconds);

  const commitNote = () => {
    setNoteDraft(null);
  };

  const handleToggle = (setId: string): CompleteResult => {
    const result = toggleComplete(we.id, setId, type);
    if (!edit && result.ok && result.completed) {
      unlockChime();
      if (settings.hapticsEnabled) vibrate(HAPTIC_TAP);
      if (settings.restTimerAutoStart && workoutId !== undefined) {
        startRest(we.restSeconds ?? settings.defaultRestSeconds, workoutId);
      }
    }
    return result;
  };

  return (
    <section aria-label={name} className="rounded-card border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 flex-1 truncate text-title-sm font-semibold">{name}</h2>
        <IconButton
          aria-label={`${name} options`}
          onClick={() => {
            setMenuOpen(true);
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </IconButton>
      </div>

      {showNote && (
        <div className="pb-2">
          <TextArea
            label="Exercise note"
            placeholder="Add a note"
            maxLength={NOTES_MAX}
            value={noteDraft ?? notes}
            onChange={(e) => {
              setNoteDraft(e.target.value);
              setExerciseNotes(we.id, e.target.value);
            }}
            onBlur={commitNote}
          />
        </div>
      )}

      <WorkoutSetTable type={type} unit={unit} mode={template ? 'template' : 'workout'}>
        {we.sets.map((s, i) => {
          const prev = template
            ? undefined
            : previousSetFor(we.exerciseId, ordinals[i] ?? 0, s.type, previous);
          const canFill = prev !== undefined && !s.completed;
          return (
            <SwipeRow
              key={s.id}
              deleteLabel={`Delete set ${String(i + 1)}`}
              onDelete={() => {
                removeSet(we.id, s.id);
              }}
            >
              {template ? (
                <SetRow
                  mode="template"
                  set={s}
                  index={i}
                  type={type}
                  unit={unit}
                  badge={badges[i] ?? String(i + 1)}
                  onChange={(patch) => {
                    updateSet(we.id, s.id, patch);
                  }}
                  onBadge={() => {
                    setBadgeSetId(s.id);
                  }}
                />
              ) : (
                <SetRow
                  set={s}
                  index={i}
                  type={type}
                  unit={unit}
                  badge={badges[i] ?? String(i + 1)}
                  previousText={formatPreviousSet(prev, type, unit)}
                  onFillPrevious={
                    canFill
                      ? () => {
                          updateSet(we.id, s.id, fillPatch(prev, type));
                        }
                      : undefined
                  }
                  onChange={(patch) => {
                    updateSet(we.id, s.id, patch);
                  }}
                  onToggle={() => handleToggle(s.id)}
                  onBadge={() => {
                    setBadgeSetId(s.id);
                  }}
                />
              )}
            </SwipeRow>
          );
        })}
      </WorkoutSetTable>

      <Button
        variant="ghost"
        fullWidth
        className="mt-2"
        onClick={() => {
          addSet(we.id);
        }}
      >
        + Add Set
      </Button>

      <BottomSheet
        open={menuOpen}
        title={name}
        onClose={() => {
          setMenuOpen(false);
        }}
      >
        <div className="flex flex-col gap-2">
          {!template && (
            <Button
              variant="secondary"
              onClick={() => {
                setNoteOpen(true);
                setMenuOpen(false);
              }}
            >
              {notes === '' ? 'Add note' : 'Edit note'}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={index === 0}
            onClick={() => {
              moveExercise(we.id, -1);
              setMenuOpen(false);
            }}
          >
            Move up
          </Button>
          <Button
            variant="secondary"
            disabled={index === count - 1}
            onClick={() => {
              moveExercise(we.id, 1);
              setMenuOpen(false);
            }}
          >
            Move down
          </Button>
          {!edit && (
            <Button
              variant="secondary"
              onClick={() => {
                setRestDraft(we.restSeconds ?? settings.defaultRestSeconds);
                setRestOpen(true);
                setMenuOpen(false);
              }}
            >
              Rest timer: {restLabel}
            </Button>
          )}
          <Button
            variant="secondary"
            className="text-danger"
            onClick={() => {
              setMenuOpen(false);
              removeExercise(we.id, exercise?.name);
            }}
          >
            Remove exercise
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={badgeSetId !== null && badgeIndex >= 0}
        title={`Set ${String(badgeIndex + 1)}`}
        onClose={() => {
          setBadgeSetId(null);
        }}
      >
        <div role="radiogroup" aria-label="Set type" className="mb-3 flex flex-col gap-2">
          {SET_TYPE_OPTIONS.map((o) => {
            const selected = we.sets[badgeIndex]?.type === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  if (badgeSetId !== null) setSetType(we.id, badgeSetId, o.value);
                  setBadgeSetId(null);
                }}
                className={`flex min-h-tap items-center justify-between rounded-control border px-4 text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  selected
                    ? 'border-accent bg-accent-tint font-semibold'
                    : 'border-border bg-surface-2'
                }`}
              >
                <span>{o.label}</span>
                {selected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
        <Button
          variant="secondary"
          fullWidth
          className="text-danger"
          onClick={() => {
            if (badgeSetId !== null) removeSet(we.id, badgeSetId);
            setBadgeSetId(null);
          }}
        >
          Delete set
        </Button>
      </BottomSheet>

      <BottomSheet
        open={restOpen}
        title="Rest timer"
        onClose={() => {
          setRestOpen(false);
        }}
      >
        <div className="flex flex-col gap-4">
          <Stepper
            label="Rest time"
            value={restDraft}
            min={REST_MIN_SEC}
            max={REST_MAX_SEC}
            step={REST_STEP_SEC}
            format={formatDurationInput}
            onChange={setRestDraft}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setRestSeconds(we.id, null);
                setRestOpen(false);
              }}
            >
              Use default
            </Button>
            <Button
              fullWidth
              onClick={() => {
                setRestSeconds(we.id, restDraft);
                setRestOpen(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </BottomSheet>
    </section>
  );
}
