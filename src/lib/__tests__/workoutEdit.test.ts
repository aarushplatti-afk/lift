import { describe, expect, it } from 'vitest';
import {
  durationParts,
  fromDateTimeInputs,
  toDateInputValue,
  toTimeInputValue,
  validateWorkoutEdit,
  workoutEditKey,
} from '../workoutEdit';
import type { Workout, WorkoutExercise, WorkoutSet } from '../../types/domain';

const set = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: 's1',
  order: 0,
  type: 'normal',
  weightKg: 100,
  reps: 5,
  completed: true,
  ...over,
});

const ex = (over: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  id: 'we1',
  exerciseId: 'bench',
  order: 0,
  sets: [set()],
  ...over,
});

const base = (over: Partial<Workout> = {}): Workout => ({
  id: 'w1',
  userId: 'u1',
  name: 'Push',
  startedAt: 1_000_000,
  endedAt: 1_000_000 + 3_600_000,
  status: 'completed',
  exercises: [ex()],
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('validateWorkoutEdit', () => {
  const now = 2_000_000_000;
  it('accepts a valid workout', () => {
    expect(validateWorkoutEdit(base(), now)).toBeUndefined();
  });
  it('requires a non-blank name', () => {
    expect(validateWorkoutEdit(base({ name: '   ' }), now)).toEqual({
      field: 'name',
      code: 'required',
    });
  });
  it('rejects non-integer or non-finite start', () => {
    expect(validateWorkoutEdit(base({ startedAt: Number.NaN }), now)).toEqual({
      field: 'startedAt',
      code: 'invalid',
    });
    expect(validateWorkoutEdit(base({ startedAt: 1.5 }), now)?.field).toBe('startedAt');
    expect(validateWorkoutEdit(base({ startedAt: Infinity }), now)?.field).toBe('startedAt');
  });
  it('allows start === now and rejects the future', () => {
    expect(validateWorkoutEdit(base({ startedAt: now, endedAt: now }), now)).toBeUndefined();
    expect(validateWorkoutEdit(base({ startedAt: now + 1, endedAt: now + 5 }), now)).toEqual({
      field: 'startedAt',
      code: 'future',
    });
  });
  it('requires a defined, finite endedAt not before start', () => {
    const noEnd = base();
    delete noEnd.endedAt;
    expect(validateWorkoutEdit(noEnd, now)).toEqual({ field: 'duration', code: 'invalid' });
    expect(validateWorkoutEdit(base({ endedAt: Number.NaN }), now)?.field).toBe('duration');
    expect(validateWorkoutEdit(base({ endedAt: 999_999 }), now)?.field).toBe('duration');
  });
  it('allows endedAt === startedAt and endedAt beyond now', () => {
    expect(validateWorkoutEdit(base({ endedAt: 1_000_000 }), now)).toBeUndefined();
    expect(validateWorkoutEdit(base({ endedAt: now + 10_000 }), now)).toBeUndefined();
  });
});

describe('workoutEditKey', () => {
  const key = (w: Workout): string => workoutEditKey(w);
  it('ignores ids, isPR, completedAt, updatedAt and userId', () => {
    const b = base({
      id: 'other',
      updatedAt: 99,
      userId: 'u2',
      exercises: [ex({ id: 'x', sets: [set({ id: 'y', isPR: true, completedAt: 123 })] })],
    });
    expect(key(b)).toBe(key(base()));
  });
  it('ignores object key order and trims the name', () => {
    const a = base();
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as unknown as Workout;
    expect(key({ ...reordered, name: ' Push ' })).toBe(key(a));
  });
  it('treats missing and empty notes alike', () => {
    expect(key(base({ notes: '' }))).toBe(key(base()));
  });
  it('detects value changes', () => {
    const a = key(base());
    expect(key(base({ exercises: [ex({ sets: [set({ weightKg: 100.0001 })] })] }))).not.toBe(a);
    expect(key(base({ exercises: [ex({ sets: [set({ type: 'warmup' })] })] }))).not.toBe(a);
    expect(key(base({ exercises: [ex({ sets: [set({ completed: false })] })] }))).not.toBe(a);
    expect(key(base({ notes: 'x' }))).not.toBe(a);
    expect(key(base({ startedAt: 1_000_001 }))).not.toBe(a);
    expect(key(base({ endedAt: 1_000_001 }))).not.toBe(a);
    expect(key(base({ exercises: [ex({ notes: 'n' })] }))).not.toBe(a);
    expect(key(base({ exercises: [ex({ restSeconds: 60 })] }))).not.toBe(a);
  });
  it('detects exercise reorder', () => {
    const e1 = ex({ id: 'a', exerciseId: 'bench', order: 0 });
    const e2 = ex({ id: 'b', exerciseId: 'squat', order: 1 });
    const before = key(base({ exercises: [e1, e2] }));
    const after = key(
      base({
        exercises: [
          { ...e1, order: 1 },
          { ...e2, order: 0 },
        ],
      }),
    );
    expect(after).not.toBe(before);
  });
  it('is stable for empty exercises', () => {
    expect(key(base({ exercises: [] }))).toBe(key(base({ exercises: [] })));
  });
});

describe('date and time inputs', () => {
  it('round trips to the minute', () => {
    const x = new Date(2026, 10, 12, 18, 5, 37, 123).getTime();
    const floored = new Date(2026, 10, 12, 18, 5).getTime();
    expect(fromDateTimeInputs(toDateInputValue(x), toTimeInputValue(x))).toBe(floored);
  });
  it('formats local values with padding', () => {
    const x = new Date(2026, 0, 2, 3, 4).getTime();
    expect(toDateInputValue(x)).toBe('2026-01-02');
    expect(toTimeInputValue(x)).toBe('03:04');
    expect(toTimeInputValue(new Date(2026, 0, 2, 0, 0).getTime())).toBe('00:00');
    expect(toTimeInputValue(new Date(2026, 0, 2, 23, 59).getTime())).toBe('23:59');
  });
  it('returns undefined for malformed input', () => {
    expect(fromDateTimeInputs('', '10:00')).toBeUndefined();
    expect(fromDateTimeInputs('2026-11-12', '')).toBeUndefined();
    expect(fromDateTimeInputs('2026-13-01', '10:00')).toBeUndefined();
    expect(fromDateTimeInputs('2026-02-30', '10:00')).toBeUndefined();
    expect(fromDateTimeInputs('2026-11-12', '24:00')).toBeUndefined();
    expect(fromDateTimeInputs('2026-11-12', '10:60')).toBeUndefined();
    expect(fromDateTimeInputs('nope', 'nope')).toBeUndefined();
  });
  it('normalises a DST-gap time forward (America/New_York)', () => {
    const ms = fromDateTimeInputs('2026-03-08', '02:30');
    expect(ms).toBe(Date.UTC(2026, 2, 8, 7, 30));
    expect(ms).toBe(new Date(2026, 2, 8, 3, 30).getTime());
  });
});

describe('durationParts', () => {
  const t = 1_000_000;
  it('floors to minutes', () => {
    expect(durationParts(t, t)).toEqual({ hours: 0, minutes: 0 });
    expect(durationParts(t, t + 59_000)).toEqual({ hours: 0, minutes: 0 });
    expect(durationParts(t, t + 61 * 60_000)).toEqual({ hours: 1, minutes: 1 });
    expect(durationParts(t, t + 25 * 3_600_000)).toEqual({ hours: 25, minutes: 0 });
  });
  it('clamps negative spans to zero', () => {
    expect(durationParts(t, t - 5000)).toEqual({ hours: 0, minutes: 0 });
  });
});
