import { useState } from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { TextArea } from '../ui/TextArea';
import { NOTES_MAX } from '../../lib/exercises';
import { useActiveWorkoutStore } from '../../store/activeWorkout';
import type { Exercise, Unit, WorkoutExercise } from '../../types/domain';
import { SetRow } from './SetRow';
import { WorkoutSetTable } from './WorkoutSetTable';

interface ExerciseCardProps {
  we: WorkoutExercise;
  index: number;
  count: number;
  exercise: Exercise | undefined;
  unit: Unit;
}

const DELETED_NAME = 'Deleted exercise';

export function ExerciseCard({ we, index, count, exercise, unit }: ExerciseCardProps) {
  const addSet = useActiveWorkoutStore((s) => s.addSet);
  const updateSet = useActiveWorkoutStore((s) => s.updateSet);
  const toggleComplete = useActiveWorkoutStore((s) => s.toggleComplete);
  const removeSet = useActiveWorkoutStore((s) => s.removeSet);
  const removeExercise = useActiveWorkoutStore((s) => s.removeExercise);
  const moveExercise = useActiveWorkoutStore((s) => s.moveExercise);
  const setExerciseNotes = useActiveWorkoutStore((s) => s.setExerciseNotes);

  const [menuOpen, setMenuOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [badgeSetId, setBadgeSetId] = useState<string | null>(null);

  const name = exercise?.name ?? DELETED_NAME;
  const type = exercise?.type ?? 'weight_reps';
  const notes = we.notes ?? '';
  const showNote = noteOpen || notes !== '';
  const badgeIndex = we.sets.findIndex((s) => s.id === badgeSetId);

  const commitNote = () => {
    if (noteDraft !== null) setExerciseNotes(we.id, noteDraft);
    setNoteDraft(null);
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
            }}
            onBlur={commitNote}
          />
        </div>
      )}

      <WorkoutSetTable type={type} unit={unit}>
        {we.sets.map((s, i) => (
          <SetRow
            key={s.id}
            set={s}
            index={i}
            type={type}
            unit={unit}
            onChange={(patch) => {
              updateSet(we.id, s.id, patch);
            }}
            onToggle={() => toggleComplete(we.id, s.id, type)}
            onBadge={() => {
              setBadgeSetId(s.id);
            }}
          />
        ))}
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
          <Button
            variant="secondary"
            onClick={() => {
              setNoteOpen(true);
              setMenuOpen(false);
            }}
          >
            {notes === '' ? 'Add note' : 'Edit note'}
          </Button>
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
        title={`Set ${badgeIndex + 1}`}
        onClose={() => {
          setBadgeSetId(null);
        }}
      >
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
    </section>
  );
}
