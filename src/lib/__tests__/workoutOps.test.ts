import { describe, expect, it } from 'vitest';
import { NAME_MAX, NOTES_MAX } from '../exercises';
import {
  addExercises,
  addSet,
  defaultWorkoutName,
  moveExercise,
  removeExercise,
  removeSet,
  rename,
  restoreExercise,
  restoreSet,
  setCompleted,
  setExerciseNotes,
  setNotes,
  setRestSeconds,
  setSetType,
  updateSet,
  type OpsCtx,
} from '../workoutOps';
import { mkEx, mkSet, mkWorkout } from '../calc/__tests__/fixtures';

function ctx(now = 9000): OpsCtx {
  let n = 0;
  return { now, newId: () => `id${++n}` };
}

const base = () =>
  mkWorkout(
    'w',
    [
      mkEx('e1', 'bench', [
        mkSet('s1', { weightKg: 100, reps: 5 }),
        mkSet('s2', { weightKg: 110, reps: 3, durationSec: 7 }),
      ]),
      mkEx('e2', 'squat', [mkSet('s3')], 1),
      mkEx('e3', 'row', [mkSet('s4')], 2),
    ],
    { status: 'in_progress' },
  );
const ids = (w: ReturnType<typeof base>) => w.exercises.map((e) => e.id);

describe('addExercises', () => {
  it('appends blocks each with one empty normal set and sets updatedAt', () => {
    const w = base();
    const out = addExercises(w, ['x', 'y'], ctx());
    expect(out.exercises.map((e) => e.exerciseId)).toEqual(['bench', 'squat', 'row', 'x', 'y']);
    expect(out.exercises.map((e) => e.order)).toEqual([0, 1, 2, 3, 4]);
    const added = out.exercises[3];
    expect(added?.sets).toHaveLength(1);
    expect(added?.sets[0]).toEqual({
      id: expect.any(String),
      order: 0,
      type: 'normal',
      completed: false,
    });
    expect(
      new Set([
        ...out.exercises.map((e) => e.id),
        ...out.exercises.flatMap((e) => e.sets.map((s) => s.id)),
      ]).size,
    ).toBe(out.exercises.length + out.exercises.flatMap((e) => e.sets).length);
    expect(out.updatedAt).toBe(9000);
    expect(w.exercises).toHaveLength(3);
  });
  it('is a no-op for empty ids', () => {
    expect(addExercises(base(), [], ctx()).exercises).toHaveLength(3);
  });
});

describe('removeExercise / restoreExercise', () => {
  it('removes and renumbers', () => {
    const out = removeExercise(base(), 'e2', ctx());
    expect(ids(out)).toEqual(['e1', 'e3']);
    expect(out.exercises.map((e) => e.order)).toEqual([0, 1]);
  });
  it('ignores unknown ids', () => {
    expect(ids(removeExercise(base(), 'nope', ctx()))).toEqual(['e1', 'e2', 'e3']);
  });
  it('restores at the same index', () => {
    const w = base();
    const we = w.exercises[1];
    if (!we) throw new Error('fixture');
    const removed = removeExercise(w, 'e2', ctx());
    const back = restoreExercise(removed, we, 1, ctx());
    expect(ids(back)).toEqual(['e1', 'e2', 'e3']);
    expect(back.exercises.map((e) => e.order)).toEqual([0, 1, 2]);
  });
  it('clamps out-of-range index and avoids duplicates', () => {
    const w = base();
    const we = w.exercises[0];
    if (!we) throw new Error('fixture');
    expect(ids(restoreExercise(w, we, 99, ctx()))).toEqual(['e2', 'e3', 'e1']);
    expect(ids(restoreExercise(w, we, -5, ctx()))).toEqual(['e1', 'e2', 'e3']);
  });
});

describe('moveExercise', () => {
  it('moves up and down', () => {
    expect(ids(moveExercise(base(), 'e2', -1, ctx()))).toEqual(['e2', 'e1', 'e3']);
    expect(ids(moveExercise(base(), 'e2', 1, ctx()))).toEqual(['e1', 'e3', 'e2']);
    expect(moveExercise(base(), 'e2', 1, ctx()).exercises.map((e) => e.order)).toEqual([0, 1, 2]);
  });
  it('is a no-op at either end and for unknown ids', () => {
    const w = base();
    expect(moveExercise(w, 'e1', -1, ctx())).toBe(w);
    expect(moveExercise(w, 'e3', 1, ctx())).toBe(w);
    expect(moveExercise(w, 'zz', 1, ctx())).toBe(w);
  });
});

describe('setExerciseNotes', () => {
  it('trims and sets', () => {
    expect(setExerciseNotes(base(), 'e1', '  hi  ', ctx()).exercises[0]?.notes).toBe('hi');
  });
  it('limits to NOTES_MAX', () => {
    const out = setExerciseNotes(base(), 'e1', 'a'.repeat(NOTES_MAX + 50), ctx());
    expect(out.exercises[0]?.notes).toHaveLength(NOTES_MAX);
  });
  it('removes the key when blank', () => {
    const w = setExerciseNotes(base(), 'e1', 'x', ctx());
    const out = setExerciseNotes(w, 'e1', '   ', ctx());
    expect('notes' in (out.exercises[0] ?? {})).toBe(false);
  });
});

describe('addSet', () => {
  it('copies weight, reps and duration from the last set as a normal incomplete set', () => {
    const w = base();
    const last = w.exercises[0]?.sets[1];
    if (!last) throw new Error('fixture');
    const withWarm = updateSet(w, 'e1', 's2', {}, ctx());
    const typed = {
      ...withWarm,
      exercises: withWarm.exercises.map((e) =>
        e.id === 'e1'
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.id === 's2' ? { ...s, type: 'drop' as const, completedAt: 5 } : s,
              ),
            }
          : e,
      ),
    };
    const out = addSet(typed, 'e1', ctx());
    const sets = out.exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(3);
    expect(sets[2]).toEqual({
      id: 'id1',
      order: 2,
      type: 'normal',
      completed: false,
      weightKg: 110,
      reps: 3,
      durationSec: 7,
    });
  });
  it('creates a blank set when the block has none', () => {
    const w = removeSet(base(), 'e2', 's3', ctx());
    const out = addSet(w, 'e2', ctx());
    expect(out.exercises[1]?.sets).toEqual([
      { id: 'id1', order: 0, type: 'normal', completed: false },
    ]);
  });
  it('does not copy keys the last set lacks', () => {
    const out = addSet(base(), 'e2', ctx());
    const added = out.exercises[1]?.sets[1];
    expect('weightKg' in (added ?? {})).toBe(false);
  });
});

describe('updateSet', () => {
  it('sets values', () => {
    const out = updateSet(base(), 'e2', 's3', { weightKg: 50, reps: 8, durationSec: 30 }, ctx());
    expect(out.exercises[1]?.sets[0]).toMatchObject({ weightKg: 50, reps: 8, durationSec: 30 });
  });
  it('null deletes the key, undefined leaves it', () => {
    const out = updateSet(base(), 'e1', 's2', { weightKg: null, reps: undefined }, ctx());
    const s = out.exercises[0]?.sets[1];
    expect('weightKg' in (s ?? {})).toBe(false);
    expect(s?.reps).toBe(3);
    expect(s?.durationSec).toBe(7);
  });
  it('only touches the target set and does not mutate input', () => {
    const w = base();
    const snap = structuredClone(w);
    const out = updateSet(w, 'e1', 's1', { reps: 9 }, ctx());
    expect(out.exercises[0]?.sets[1]).toEqual(w.exercises[0]?.sets[1]);
    expect(w).toEqual(snap);
  });
});

describe('setCompleted', () => {
  it('completes with completedAt', () => {
    const out = setCompleted(base(), 'e2', 's3', true, ctx(1234));
    expect(out.exercises[1]?.sets[0]).toMatchObject({ completed: true, completedAt: 1234 });
  });
  it('uncompletes and removes completedAt', () => {
    const done = setCompleted(base(), 'e2', 's3', true, ctx(1234));
    const out = setCompleted(done, 'e2', 's3', false, ctx(2000));
    const s = out.exercises[1]?.sets[0];
    expect(s?.completed).toBe(false);
    expect('completedAt' in (s ?? {})).toBe(false);
  });
});

describe('removeSet / restoreSet', () => {
  it('removes and renumbers', () => {
    const out = removeSet(base(), 'e1', 's1', ctx());
    expect(out.exercises[0]?.sets.map((s) => [s.id, s.order])).toEqual([['s2', 0]]);
  });
  it('restores at the same index', () => {
    const w = base();
    const s1 = w.exercises[0]?.sets[0];
    if (!s1) throw new Error('fixture');
    const removed = removeSet(w, 'e1', 's1', ctx());
    const back = restoreSet(removed, 'e1', s1, 0, ctx());
    expect(back.exercises[0]?.sets.map((s) => [s.id, s.order])).toEqual([
      ['s1', 0],
      ['s2', 1],
    ]);
  });
  it('clamps index and avoids duplicates', () => {
    const w = base();
    const s1 = w.exercises[0]?.sets[0];
    if (!s1) throw new Error('fixture');
    expect(restoreSet(w, 'e1', s1, 50, ctx()).exercises[0]?.sets.map((s) => s.id)).toEqual([
      's2',
      's1',
    ]);
  });
});

describe('rename / setNotes', () => {
  it('trims and limits name', () => {
    expect(rename(base(), '  Push  ', ctx()).name).toBe('Push');
    expect(rename(base(), 'x'.repeat(NAME_MAX + 10), ctx()).name).toHaveLength(NAME_MAX);
  });
  it('keeps the old name when empty', () => {
    const w = base();
    expect(rename(w, '   ', ctx()).name).toBe('W');
  });
  it('sets, trims, limits and clears workout notes', () => {
    const w = setNotes(base(), '  felt good ', ctx());
    expect(w.notes).toBe('felt good');
    expect(setNotes(w, 'n'.repeat(NOTES_MAX + 1), ctx()).notes).toHaveLength(NOTES_MAX);
    expect('notes' in setNotes(w, ' ', ctx())).toBe(false);
  });
});

describe('purity', () => {
  it('no transform mutates its input', () => {
    const w = base();
    const snap = structuredClone(w);
    const c = ctx();
    addExercises(w, ['a'], c);
    removeExercise(w, 'e1', c);
    moveExercise(w, 'e1', 1, c);
    setExerciseNotes(w, 'e1', 'n', c);
    addSet(w, 'e1', c);
    removeSet(w, 'e1', 's1', c);
    setCompleted(w, 'e1', 's1', true, c);
    rename(w, 'n', c);
    setNotes(w, 'n', c);
    expect(w).toEqual(snap);
  });
});

describe('defaultWorkoutName', () => {
  const at = (h: number) => new Date(2026, 0, 5, h, 30).getTime();
  it('maps local hours to names', () => {
    expect(defaultWorkoutName(at(5))).toBe('Morning Workout');
    expect(defaultWorkoutName(at(11))).toBe('Morning Workout');
    expect(defaultWorkoutName(at(12))).toBe('Afternoon Workout');
    expect(defaultWorkoutName(at(16))).toBe('Afternoon Workout');
    expect(defaultWorkoutName(at(17))).toBe('Evening Workout');
    expect(defaultWorkoutName(at(21))).toBe('Evening Workout');
    expect(defaultWorkoutName(at(22))).toBe('Night Workout');
    expect(defaultWorkoutName(at(0))).toBe('Night Workout');
    expect(defaultWorkoutName(at(4))).toBe('Night Workout');
  });
});

describe('unmatched targets', () => {
  it('return the same workout when the block or set is not found', () => {
    const w = base();
    expect(updateSet(w, 'nope', 's1', { reps: 1 }, ctx())).toBe(w);
    expect(updateSet(w, 'e1', 'nope', { reps: 1 }, ctx())).toBe(w);
    expect(setCompleted(w, 'e1', 'nope', true, ctx())).toBe(w);
    expect(removeSet(w, 'nope', 's1', ctx())).toBe(w);
    expect(addSet(w, 'nope', ctx())).toBe(w);
    expect(setExerciseNotes(w, 'nope', 'x', ctx())).toBe(w);
  });
});

describe('setSetType', () => {
  it('changes the type and bumps updatedAt', () => {
    const out = setSetType(base(), 'e1', 's1', 'warmup', ctx());
    expect(out.exercises[0]?.sets[0]?.type).toBe('warmup');
    expect(out.updatedAt).toBe(9000);
    expect(out.exercises[0]?.sets[0]?.order).toBe(0);
    expect(out.exercises[0]?.sets[1]?.order).toBe(1);
  });
  it('returns the same workout when unchanged or unknown', () => {
    const w = base();
    expect(setSetType(w, 'e1', 's1', 'normal', ctx())).toBe(w);
    expect(setSetType(w, 'e1', 'nope', 'drop', ctx())).toBe(w);
    expect(setSetType(w, 'nope', 's1', 'drop', ctx())).toBe(w);
  });
});

describe('setRestSeconds', () => {
  it('sets a clamped override', () => {
    expect(setRestSeconds(base(), 'e1', 100, ctx()).exercises[0]?.restSeconds).toBe(105);
    expect(setRestSeconds(base(), 'e1', 5, ctx()).exercises[0]?.restSeconds).toBe(15);
    expect(setRestSeconds(base(), 'e1', 9999, ctx()).exercises[0]?.restSeconds).toBe(600);
  });
  it('null deletes the override', () => {
    const w = setRestSeconds(base(), 'e1', 120, ctx());
    const out = setRestSeconds(w, 'e1', null, ctx());
    expect(out.exercises[0] && 'restSeconds' in out.exercises[0]).toBe(false);
  });
  it('returns the same workout when nothing changes', () => {
    const w = base();
    expect(setRestSeconds(w, 'e1', null, ctx())).toBe(w);
    expect(setRestSeconds(w, 'nope', 90, ctx())).toBe(w);
    const w2 = setRestSeconds(w, 'e1', 90, ctx());
    expect(setRestSeconds(w2, 'e1', 92, ctx())).toBe(w2);
  });
});
