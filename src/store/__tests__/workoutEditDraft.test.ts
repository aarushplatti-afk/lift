import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { setOwner } from '../../db/repos/meta';
import { useToastStore } from '../../components/ui/toastStore';
import { useActiveWorkoutStore } from '../activeWorkout';
import { useRestTimerStore } from '../restTimer';
import { useWorkoutEditStore } from '../workoutEditDraft';
import type { Exercise, Workout } from '../../types/domain';

const store = () => useWorkoutEditStore.getState();

const MIN = 60000;
const START = Date.UTC(2026, 0, 5, 12, 0, 0);

const ex: Exercise = {
  userId: 'u1',
  updatedAt: 1,
  id: 'a',
  name: 'Bench',
  muscleGroup: 'chest',
  equipment: 'barbell',
  type: 'weight_reps',
  isCustom: false,
  archived: false,
  createdAt: 1,
};

function makeWorkout(): Workout {
  return {
    id: 'w1',
    userId: 'u1',
    name: 'Push',
    startedAt: START,
    endedAt: START + 60 * MIN,
    status: 'completed',
    createdAt: START,
    updatedAt: START,
    exercises: [
      {
        id: 'we1',
        exerciseId: 'a',
        order: 0,
        sets: [
          { id: 's1', order: 0, type: 'normal', weightKg: 100, reps: 5, completed: true },
          { id: 's2', order: 1, type: 'normal', completed: false },
        ],
      },
      { id: 'we2', exerciseId: 'a', order: 1, sets: [] },
    ],
  };
}

function draft(): Workout {
  const d = store().draft;
  if (!d) throw new Error('no draft');
  return d;
}

function undo(): void {
  useToastStore.getState().toast?.onAction?.();
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await setOwner('u1', 'a@b.c');
  await db.exercises.put(ex);
  useToastStore.setState({ toast: null });
  useRestTimerStore.getState().skip();
  store().clear();
});

afterEach(() => {
  store().clear();
});

describe('workoutEditDraft store', () => {
  it('load deep-clones and starts clean', () => {
    const w = makeWorkout();
    store().load(w);
    expect(store().isDirty()).toBe(false);
    store().updateSet('we1', 's1', { weightKg: 200 });
    expect(w.exercises[0]?.sets[0]?.weightKg).toBe(100);
  });

  it('change then revert is clean', () => {
    store().load(makeWorkout());
    store().updateSet('we1', 's1', { weightKg: 105 });
    expect(store().isDirty()).toBe(true);
    store().updateSet('we1', 's1', { weightKg: 100 });
    expect(store().isDirty()).toBe(false);
    store().setName('Pull');
    expect(store().isDirty()).toBe(true);
    store().setName('Push');
    expect(store().isDirty()).toBe(false);
  });

  it('setNotes and setExerciseNotes mark dirty and clearing reverts', () => {
    store().load(makeWorkout());
    store().setNotes('felt good');
    store().setExerciseNotes('we1', 'slow');
    expect(store().isDirty()).toBe(true);
    store().setNotes('');
    store().setExerciseNotes('we1', '');
    expect(store().isDirty()).toBe(false);
  });

  it('setStartedAt keeps the duration', () => {
    store().load(makeWorkout());
    store().setStartedAt(START + 5 * MIN);
    expect(draft().startedAt).toBe(START + 5 * MIN);
    expect(draft().endedAt).toBe(START + 65 * MIN);
    expect(store().isDirty()).toBe(true);
  });

  it('setStartedAt without endedAt only moves the start', () => {
    const w = makeWorkout();
    delete w.endedAt;
    store().load(w);
    store().setStartedAt(START + MIN);
    expect(draft().startedAt).toBe(START + MIN);
    expect(draft().endedAt).toBeUndefined();
  });

  it('setDurationMinutes moves only endedAt', () => {
    store().load(makeWorkout());
    store().setDurationMinutes(90);
    expect(draft().startedAt).toBe(START);
    expect(draft().endedAt).toBe(START + 90 * MIN);
    store().setDurationMinutes(0);
    expect(draft().endedAt).toBe(START);
  });

  it('undoes a set removal and an exercise removal', () => {
    store().load(makeWorkout());
    store().removeSet('we1', 's1');
    expect(useToastStore.getState().toast?.message).toBe('Set deleted');
    expect(draft().exercises[0]?.sets).toHaveLength(1);
    undo();
    expect(draft().exercises[0]?.sets.map((s) => s.id)).toEqual(['s1', 's2']);
    store().removeExercise('we1', 'Bench');
    expect(useToastStore.getState().toast?.message).toBe('Removed Bench');
    expect(draft().exercises).toHaveLength(1);
    undo();
    expect(draft().exercises.map((e) => e.id)).toEqual(['we1', 'we2']);
    expect(store().isDirty()).toBe(false);
  });

  it('removeExercise without a name uses the generic toast', () => {
    store().load(makeWorkout());
    store().removeExercise('we2');
    expect(useToastStore.getState().toast?.message).toBe('Exercise removed');
  });

  it('ignores a stale Undo after a new load', () => {
    store().load(makeWorkout());
    store().removeExercise('we1', 'Bench');
    store().load(makeWorkout());
    undo();
    expect(draft().exercises).toHaveLength(2);
    store().removeSet('we1', 's1');
    store().clear();
    undo();
    expect(store().draft).toBeNull();
  });

  it('toggleComplete returns the failing field and leaves state unchanged', () => {
    store().load(makeWorkout());
    const before = draft();
    const res = store().toggleComplete('we1', 's2', 'weight_reps');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(['weight', 'reps']).toContain(res.field);
    expect(draft()).toBe(before);
    expect(store().isDirty()).toBe(false);
  });

  it('toggleComplete completes a valid set and uncompletes it again', () => {
    store().load(makeWorkout());
    store().updateSet('we1', 's2', { weightKg: 50, reps: 8 });
    expect(store().toggleComplete('we1', 's2', 'weight_reps')).toEqual({
      ok: true,
      completed: true,
    });
    expect(draft().exercises[0]?.sets[1]?.completed).toBe(true);
    expect(draft().exercises[0]?.sets[1]?.completedAt).toBeTypeOf('number');
    expect(store().toggleComplete('we1', 's2', 'weight_reps')).toEqual({
      ok: true,
      completed: false,
    });
    expect(draft().exercises[0]?.sets[1]?.completedAt).toBeUndefined();
  });

  it('toggleComplete on an unknown set is a no-op', () => {
    store().load(makeWorkout());
    expect(store().toggleComplete('we1', 'nope', 'weight_reps')).toEqual({
      ok: true,
      completed: false,
    });
    expect(store().isDirty()).toBe(false);
  });

  it('mutations without a draft are no-ops', () => {
    store().setName('x');
    store().addSet('we1');
    expect(store().draft).toBeNull();
    expect(store().isDirty()).toBe(false);
  });

  it('moves exercises, adds sets, changes set type and rest', () => {
    store().load(makeWorkout());
    store().moveExercise('we2', -1);
    expect(draft().exercises.map((e) => e.id)).toEqual(['we2', 'we1']);
    store().addExercises(['b']);
    expect(draft().exercises).toHaveLength(3);
    store().addSet('we1');
    expect(draft().exercises[1]?.sets).toHaveLength(3);
    store().setSetType('we1', 's1', 'warmup');
    expect(draft().exercises[1]?.sets[0]?.type).toBe('warmup');
    store().setRestSeconds('we1', 90);
    expect(draft().exercises[1]?.restSeconds).toBe(90);
  });

  it('save re-baselines on saved', async () => {
    await db.workouts.put(makeWorkout());
    store().load(makeWorkout());
    store().updateSet('we1', 's1', { weightKg: 110 });
    const outcome = await store().save({ markIncomplete: false });
    expect(outcome.status).toBe('saved');
    expect(store().isDirty()).toBe(false);
    expect(draft().exercises[0]?.sets[0]?.weightKg).toBe(110);
    expect((await db.workouts.get('w1'))?.exercises[0]?.sets[0]?.weightKg).toBe(110);
    store().setName('Other');
    expect(store().isDirty()).toBe(true);
  });

  it('save replaces the draft with the stored row after cleaning', async () => {
    await db.workouts.put(makeWorkout());
    store().load(makeWorkout());
    store().updateSet('we1', 's1', { weightKg: 110 });
    const outcome = await store().save({ markIncomplete: false });
    expect(outcome.status).toBe('saved');
    expect(draft().exercises).toHaveLength(1);
    expect(draft().exercises[0]?.sets).toHaveLength(1);
  });

  it('not_found leaves the draft dirty', async () => {
    store().load(makeWorkout());
    store().setName('Edited');
    const outcome = await store().save({ markIncomplete: false });
    expect(outcome.status).toBe('not_found');
    expect(store().isDirty()).toBe(true);
    expect(draft().name).toBe('Edited');
    expect(await db.workouts.count()).toBe(0);
  });

  it('invalid leaves the draft dirty', async () => {
    await db.workouts.put(makeWorkout());
    store().load(makeWorkout());
    store().setName('   ');
    const outcome = await store().save({ markIncomplete: false });
    expect(outcome.status).toBe('invalid');
    expect(store().isDirty()).toBe(true);
  });

  it('save without a draft rejects', async () => {
    await expect(store().save({ markIncomplete: false })).rejects.toThrow();
  });

  it('never touches the rest timer or the active workout store', () => {
    const activeBefore = useActiveWorkoutStore.getState().workout;
    store().load(makeWorkout());
    store().updateSet('we1', 's2', { weightKg: 50, reps: 8 });
    store().toggleComplete('we1', 's2', 'weight_reps');
    store().setRestSeconds('we1', 60);
    const timer = useRestTimerStore.getState();
    expect(timer.phase).toBe('idle');
    expect(timer.endsAt).toBeNull();
    expect(useActiveWorkoutStore.getState().workout).toBe(activeBefore);
  });
});
