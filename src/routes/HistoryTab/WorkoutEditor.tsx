import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Header } from '../../components/ui/Header';
import { NumberInput } from '../../components/ui/NumberInput';
import { TextArea } from '../../components/ui/TextArea';
import { TextInput } from '../../components/ui/TextInput';
import { useToastStore } from '../../components/ui/toastStore';
import { ExerciseCard } from '../../components/workout/ExerciseCard';
import { ExercisePicker } from '../../components/workout/ExercisePicker';
import { deleteWorkout, getLastCompletedWithExercises, getWorkout } from '../../db/repos/workouts';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { prepareFinish } from '../../lib/calc/finish';
import type { ExerciseTypes } from '../../lib/calc/volume';
import { NAME_MAX } from '../../lib/exercises';
import {
  durationParts,
  fromDateTimeInputs,
  toDateInputValue,
  toTimeInputValue,
  type WorkoutEditError,
} from '../../lib/workoutEdit';
import { useSettingsStore } from '../../store/settings';
import { useWorkoutEditStore } from '../../store/workoutEditDraft';
import type { Workout } from '../../types/domain';
import { toExerciseTypes, useExerciseMap } from '../WorkoutTab/useExerciseMap';

const SAVE_FAILED = 'Couldn’t save. Storage may be full.';
const BAD_DATE_TIME = 'Enter a valid date and time';
const EMPTY_PREVIOUS: Map<string, Workout> = new Map();

type Stage = { kind: 'closed' } | { kind: 'incomplete'; count: number } | { kind: 'empty' };

const CLOSED: Stage = { kind: 'closed' };

interface DateTimeFields {
  date: string;
  time: string;
  forStartedAt: number;
}

function errorMessage(error: WorkoutEditError): string {
  if (error.field === 'name') return 'Enter a name';
  if (error.field === 'startedAt') {
    return error.code === 'future' ? 'Start time can’t be in the future' : BAD_DATE_TIME;
  }
  return 'Enter a valid duration';
}

function parseWhole(max: number) {
  return (raw: string): number | undefined => {
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : Math.min(max, n);
  };
}

const parseHours = parseWhole(999);
const parseMinutes = parseWhole(59);
const formatWhole = (v: number): string => String(v);

export function WorkoutEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const unit = useSettingsStore((s) => s.settings.unit);
  const draft = useWorkoutEditStore((s) => s.draft);
  const exerciseMap = useExerciseMap();
  const [missingId, setMissingId] = useState<string | null>(null);
  const [error, setError] = useState<WorkoutEditError | null>(null);
  const [fields, setFields] = useState<DateTimeFields | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [stage, setStage] = useState<Stage>(CLOSED);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const startedAt = draft?.startedAt ?? 0;
  const idsKey = [...new Set(draft?.exercises.map((we) => we.exerciseId) ?? [])].sort().join('|');
  const previousMap = useLiveQuery(
    () => getLastCompletedWithExercises(idsKey === '' ? [] : idsKey.split('|'), startedAt),
    [idsKey, startedAt],
    EMPTY_PREVIOUS,
  );

  useEffect(() => {
    let cancelled = false;
    if (id !== undefined) {
      void getWorkout(id).then((w) => {
        if (cancelled) return;
        if (w && w.status === 'completed') useWorkoutEditStore.getState().load(w);
        else setMissingId(id);
      });
    }
    return () => {
      cancelled = true;
      useWorkoutEditStore.getState().clear();
    };
  }, [id]);

  const goDetail = () => {
    navigate(`/history/${id ?? ''}`, { replace: true });
  };
  const goList = () => {
    navigate('/history', { replace: true });
  };

  if (id === undefined || missingId === id) {
    return (
      <>
        <Header title="Edit Workout" />
        <main className="px-4 pt-6">
          <EmptyState
            title="Workout not found"
            description="It may have been deleted."
            action={<Button onClick={goList}>Back to history</Button>}
          />
        </main>
      </>
    );
  }

  if (!draft || draft.id !== id) return null;

  const types: ExerciseTypes = exerciseMap ? toExerciseTypes(exerciseMap) : new Map();
  const shown: DateTimeFields =
    fields && fields.forStartedAt === draft.startedAt
      ? fields
      : {
          date: toDateInputValue(draft.startedAt),
          time: toTimeInputValue(draft.startedAt),
          forStartedAt: draft.startedAt,
        };
  const parsedStart = fromDateTimeInputs(shown.date, shown.time);
  const dateMalformed = parsedStart === undefined;
  const parts = durationParts(draft.startedAt, draft.endedAt ?? draft.startedAt);

  const nameError = error?.field === 'name' ? errorMessage(error) : undefined;
  const dateError = dateMalformed
    ? BAD_DATE_TIME
    : error?.field === 'startedAt'
      ? errorMessage(error)
      : undefined;
  const durationError = error?.field === 'duration' ? errorMessage(error) : undefined;

  const changeDateTime = (date: string, time: string) => {
    if (error?.field === 'startedAt') setError(null);
    const ms = fromDateTimeInputs(date, time);
    if (ms === undefined) {
      setFields({ date, time, forStartedAt: draft.startedAt });
      return;
    }
    setFields(null);
    useWorkoutEditStore.getState().setStartedAt(ms);
  };

  const changeDuration = (hours: number, minutes: number) => {
    if (error?.field === 'duration') setError(null);
    useWorkoutEditStore.getState().setDurationMinutes(hours * 60 + minutes);
  };

  const cancel = () => {
    if (useWorkoutEditStore.getState().isDirty()) setDiscardOpen(true);
    else goDetail();
  };

  const run = async (markIncomplete: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStage(CLOSED);
    setBusy(true);
    try {
      const outcome = await useWorkoutEditStore.getState().save({ markIncomplete });
      switch (outcome.status) {
        case 'saved':
          useToastStore.getState().show({ message: 'Workout updated' });
          goDetail();
          return;
        case 'invalid':
          setError(outcome.error);
          break;
        case 'empty':
          setStage({ kind: 'empty' });
          break;
        case 'not_found':
          useToastStore.getState().show({ message: 'This workout was deleted on another device.' });
          goList();
          return;
      }
    } catch {
      useToastStore.getState().show({ message: SAVE_FAILED });
    }
    inFlight.current = false;
    setBusy(false);
  };

  const begin = () => {
    if (inFlight.current) return;
    const current = useWorkoutEditStore.getState();
    if (!current.draft) return;
    if (dateMalformed) return;
    if (!current.isDirty()) {
      goDetail();
      return;
    }
    const plan = prepareFinish(current.draft, types, { markIncomplete: false, now: Date.now() });
    if (plan.isEmpty) setStage({ kind: 'empty' });
    else if (plan.incompleteCount > 0)
      setStage({ kind: 'incomplete', count: plan.incompleteCount });
    else void run(false);
  };

  const remove = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStage(CLOSED);
    setBusy(true);
    try {
      await deleteWorkout(id);
      useToastStore.getState().show({ message: 'Workout deleted' });
      goList();
    } catch {
      useToastStore.getState().show({ message: SAVE_FAILED });
      inFlight.current = false;
      setBusy(false);
    }
  };

  const closeStage = () => {
    setStage(CLOSED);
  };

  return (
    <>
      <Header
        title="Edit Workout"
        left={
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        }
        right={
          <Button disabled={busy || exerciseMap === null || dateMalformed} onClick={begin}>
            Save
          </Button>
        }
      />
      <main className="flex flex-col gap-3 px-4 pb-6 pt-3">
        <TextInput
          label="Workout name"
          maxLength={NAME_MAX}
          value={draft.name}
          error={nameError}
          onChange={(e) => {
            if (error?.field === 'name') setError(null);
            useWorkoutEditStore.getState().setName(e.target.value);
          }}
        />
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="Date"
              type="date"
              value={shown.date}
              aria-invalid={dateError !== undefined}
              onChange={(e) => {
                changeDateTime(e.target.value, shown.time);
              }}
            />
            <TextInput
              label="Start time"
              type="time"
              value={shown.time}
              aria-invalid={dateError !== undefined}
              onChange={(e) => {
                changeDateTime(shown.date, e.target.value);
              }}
            />
          </div>
          {dateError !== undefined && (
            <p role="alert" className="text-body-sm text-danger">
              {dateError}
            </p>
          )}
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-body-sm font-medium text-secondary">Duration</legend>
          <div className="flex items-center gap-2">
            <NumberInput
              mode="integer"
              aria-label="Duration hours"
              value={parts.hours}
              format={formatWhole}
              parse={parseHours}
              maxLength={3}
              invalid={durationError !== undefined}
              className="w-16"
              onCommit={(v) => {
                changeDuration(v ?? 0, parts.minutes);
              }}
            />
            <span className="text-body-sm text-secondary">h</span>
            <NumberInput
              mode="integer"
              aria-label="Duration minutes"
              value={parts.minutes}
              format={formatWhole}
              parse={parseMinutes}
              maxLength={2}
              invalid={durationError !== undefined}
              className="w-16"
              onCommit={(v) => {
                changeDuration(parts.hours, v ?? 0);
              }}
            />
            <span className="text-body-sm text-secondary">m</span>
          </div>
          {durationError !== undefined && (
            <p role="alert" className="text-body-sm text-danger">
              {durationError}
            </p>
          )}
        </fieldset>
        <TextArea
          label="Workout notes"
          value={draft.notes ?? ''}
          onChange={(e) => {
            useWorkoutEditStore.getState().setNotes(e.target.value);
          }}
        />
        {exerciseMap !== null &&
          draft.exercises.map((we, i) => (
            <ExerciseCard
              key={we.id}
              mode="edit"
              we={we}
              index={i}
              count={draft.exercises.length}
              exercise={exerciseMap.get(we.exerciseId)}
              unit={unit}
              previous={previousMap.get(we.exerciseId)}
            />
          ))}
        {draft.exercises.length === 0 && (
          <EmptyState title="No exercises" description="Add an exercise to this workout." />
        )}
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setPickerOpen(true);
          }}
        >
          + Add Exercise
        </Button>
      </main>

      <ExercisePicker
        open={pickerOpen}
        title="Add exercises"
        onClose={() => {
          setPickerOpen(false);
        }}
        onAdd={(ids) => {
          useWorkoutEditStore.getState().addExercises(ids);
        }}
      />
      <Dialog
        open={discardOpen}
        title="Discard changes?"
        onClose={() => {
          setDiscardOpen(false);
        }}
      >
        <p className="mb-4 text-body-sm text-secondary">
          Your changes to this workout won’t be saved.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="danger" fullWidth onClick={goDetail}>
            Discard changes
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setDiscardOpen(false);
            }}
          >
            Keep editing
          </Button>
        </div>
      </Dialog>
      <Dialog open={stage.kind === 'incomplete'} title="Save changes?" onClose={closeStage}>
        <p className="mb-4 text-body-sm text-secondary">
          {stage.kind === 'incomplete'
            ? `You have ${stage.count} incomplete set${stage.count === 1 ? '' : 's'}. Save anyway?`
            : ''}
        </p>
        <div className="flex flex-col gap-2">
          <Button
            fullWidth
            onClick={() => {
              void run(true);
            }}
          >
            Mark complete &amp; save
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              void run(false);
            }}
          >
            Discard incomplete sets &amp; save
          </Button>
          <Button variant="ghost" fullWidth onClick={closeStage}>
            Cancel
          </Button>
        </div>
      </Dialog>
      <Dialog open={stage.kind === 'empty'} title="Nothing left to save" onClose={closeStage}>
        <p className="mb-4 text-body-sm text-secondary">
          This workout has no completed sets. Delete it?
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              void remove();
            }}
          >
            Delete workout
          </Button>
          <Button variant="secondary" fullWidth onClick={closeStage}>
            Keep editing
          </Button>
        </div>
      </Dialog>
    </>
  );
}
