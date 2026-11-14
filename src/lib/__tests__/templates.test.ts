import { describe, expect, it } from 'vitest';
import {
  compareTemplates,
  draftFromTemplate,
  draftKey,
  draftToInput,
  duplicateName,
  emptyDraft,
  normalizeTemplateExercises,
  templateExercisesFromDraft,
  templateFromWorkout,
  templateSummary,
  validateTemplateInput,
  workoutExercisesFromTemplate,
  workoutInitFromTemplate,
} from '../templates';
import { NAME_MAX } from '../exercises';
import type { OpsCtx } from '../workoutOps';
import type {
  Exercise,
  Template,
  TemplateExercise,
  TemplateSet,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../../types/domain';

function ctx(now = 5000): OpsCtx {
  let n = 0;
  return { now, newId: () => `id${++n}` };
}

const tpl = (over: Partial<Template> = {}): Template => ({
  id: 't1',
  userId: 'u1',
  name: 'Push',
  exercises: [],
  createdAt: 100,
  updatedAt: 100,
  ...over,
});

const te = (
  exerciseId: string,
  order: number,
  over: Partial<TemplateExercise> = {},
): TemplateExercise => ({
  exerciseId,
  order,
  sets: [{ type: 'normal', targetWeightKg: 50, targetReps: 5 }],
  ...over,
});

const names = (...ids: string[]): Map<string, Exercise> =>
  new Map(
    ids.map((id) => [
      id,
      {
        id,
        userId: 'u1',
        updatedAt: 1,
        name: `Name ${id}`,
        muscleGroup: 'chest',
        equipment: 'barbell',
        type: 'weight_reps',
        isCustom: false,
        archived: false,
        createdAt: 1,
      },
    ]),
  );

let seq = 0;
const ws = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: `s${++seq}`,
  order: 0,
  type: 'normal',
  completed: true,
  ...over,
});
const we = (
  exerciseId: string,
  order: number,
  sets: WorkoutSet[],
  over: Partial<WorkoutExercise> = {},
): WorkoutExercise => ({
  id: `we-${exerciseId}`,
  exerciseId,
  order,
  sets: sets.map((s, i) => ({ ...s, order: i })),
  ...over,
});
const workout = (name: string, exercises: WorkoutExercise[]): Workout => ({
  id: 'w',
  userId: 'u1',
  name,
  startedAt: 1,
  status: 'completed',
  exercises,
  createdAt: 1,
  updatedAt: 1,
});

describe('validateTemplateInput', () => {
  it('requires a name, a bounded length and an exercise', () => {
    expect(validateTemplateInput({ name: '  ', exercises: [te('a', 0)] })).toEqual({
      field: 'name',
      code: 'required',
    });
    expect(
      validateTemplateInput({ name: 'x'.repeat(NAME_MAX + 1), exercises: [te('a', 0)] }),
    ).toEqual({ field: 'name', code: 'too_long' });
    expect(validateTemplateInput({ name: 'x'.repeat(NAME_MAX), exercises: [] })).toEqual({
      field: 'exercises',
      code: 'required',
    });
    expect(validateTemplateInput({ name: ' Push  Day ', exercises: [te('a', 0)] })).toBeUndefined();
  });
});

describe('normalizeTemplateExercises', () => {
  it('returns empty for empty input', () => {
    expect(normalizeTemplateExercises([])).toEqual([]);
  });

  it('renumbers order from 0, clamps rest and omits undefined keys', () => {
    const out = normalizeTemplateExercises([
      te('b', 7, { restSeconds: 1000 }),
      te('a', 3, { sets: [{ type: 'warmup', targetReps: undefined }] }),
    ]);
    expect(out.map((e) => [e.exerciseId, e.order])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(out[1]?.restSeconds).toBe(600);
    expect('restSeconds' in (out[0] ?? {})).toBe(false);
    expect(Object.keys(out[0]?.sets[0] ?? {})).toEqual(['type']);
  });

  it('keeps zero targets and throws RangeError on bad numbers', () => {
    const zero = normalizeTemplateExercises([
      te('a', 0, { sets: [{ type: 'normal', targetWeightKg: 0, targetReps: 0 }] }),
    ]);
    expect(zero[0]?.sets[0]).toEqual({ type: 'normal', targetWeightKg: 0, targetReps: 0 });
    const bad = (set: TemplateSet): TemplateExercise[] => [te('a', 0, { sets: [set] })];
    expect(() => normalizeTemplateExercises(bad({ type: 'normal', targetReps: 1.5 }))).toThrow(
      RangeError,
    );
    expect(() => normalizeTemplateExercises(bad({ type: 'normal', targetReps: -1 }))).toThrow(
      RangeError,
    );
    expect(() => normalizeTemplateExercises(bad({ type: 'normal', targetWeightKg: NaN }))).toThrow(
      RangeError,
    );
    expect(() =>
      normalizeTemplateExercises(bad({ type: 'normal', targetWeightKg: Infinity })),
    ).toThrow(RangeError);
    expect(() =>
      normalizeTemplateExercises(bad({ type: 'normal', targetDurationSec: -5 })),
    ).toThrow(RangeError);
  });
});

describe('draft round trip', () => {
  const exercises: TemplateExercise[] = [
    te('a', 0, {
      restSeconds: 120,
      sets: [
        { type: 'warmup', targetWeightKg: 45.359237, targetReps: 10 },
        { type: 'normal', targetWeightKg: 0.1 + 0.2, targetReps: 5 },
        { type: 'drop', targetWeightKg: 0, targetReps: 0 },
        { type: 'failure', targetReps: 3 },
      ],
    }),
    te('b', 1, { sets: [{ type: 'normal', targetDurationSec: 90 }] }),
  ];

  it('preserves kg exactly, set types, rest and durations', () => {
    const draft = draftFromTemplate(tpl({ name: 'P', exercises }), ctx());
    expect(draft.id).toBe('t1');
    expect(draft.exercises.every((e) => e.sets.every((s) => !s.completed))).toBe(true);
    const back = draftToInput(draft);
    expect(back.exercises).toEqual(exercises);
    expect(back.exercises[0]?.sets[1]?.targetWeightKg).toBe(0.1 + 0.2);
    expect(back.exercises[0]?.sets[0]?.targetWeightKg).toBe(45.359237);
    expect(back.exercises[0]?.sets.map((s) => s.type)).toEqual([
      'warmup',
      'normal',
      'drop',
      'failure',
    ]);
    expect('restSeconds' in (back.exercises[1] ?? {})).toBe(false);
  });

  it('keeps rest as typed in the draft and clamps only through normalize', () => {
    const drafted = templateExercisesFromDraft(
      workoutExercisesFromTemplate([te('a', 0, { restSeconds: 7 })], ctx()),
    );
    expect(drafted[0]?.restSeconds).toBe(7);
    expect(normalizeTemplateExercises(drafted)[0]?.restSeconds).toBe(15);
  });

  it('emptyDraft and draftKey', () => {
    const d = emptyDraft(42);
    expect(d).toEqual({ id: null, name: '', exercises: [], updatedAt: 42 });
    expect(draftKey({ ...d, name: ' A ' })).toBe(draftKey({ ...d, name: 'A' }));
    expect(draftKey({ ...d, name: 'A' })).not.toBe(draftKey({ ...d, name: 'B' }));
    const a = draftFromTemplate(tpl({ exercises }), ctx());
    const b = draftFromTemplate(tpl({ exercises }), ctx(9));
    expect(draftKey(a)).toBe(draftKey(b));
  });
});

describe('templateFromWorkout', () => {
  it('copies completed sets only and strips ids, PR flags, timestamps and notes', () => {
    const w = workout('Legs', [
      we(
        'e1',
        0,
        [
          ws({ type: 'warmup', weightKg: 20, reps: 10, completedAt: 5, isPR: true }),
          ws({ weightKg: 100, reps: 5, completed: false }),
          ws({ weightKg: 60.5, reps: 8, completedAt: 6 }),
        ],
        { notes: 'secret', restSeconds: 120 },
      ),
      we('e2', 1, [ws({ weightKg: 1, reps: 1, completed: false })]),
      we('gone', 2, [ws({ durationSec: 30 })]),
    ]);
    const input = templateFromWorkout(w);
    expect(input.name).toBe('Legs');
    expect(input.exercises).toEqual([
      {
        exerciseId: 'e1',
        order: 0,
        restSeconds: 120,
        sets: [
          { type: 'warmup', targetWeightKg: 20, targetReps: 10 },
          { type: 'normal', targetWeightKg: 60.5, targetReps: 8 },
        ],
      },
      { exerciseId: 'gone', order: 1, sets: [{ type: 'normal', targetDurationSec: 30 }] },
    ]);
    expect(JSON.stringify(input)).not.toMatch(/isPR|completedAt|secret|"id"/);
  });

  it('returns no exercises when nothing completed or the workout is empty', () => {
    expect(
      templateFromWorkout(workout('x', [we('e1', 0, [ws({ completed: false })])])).exercises,
    ).toEqual([]);
    expect(templateFromWorkout(workout('x', [])).exercises).toEqual([]);
  });
});

describe('workoutInitFromTemplate', () => {
  it('builds fresh unique ids, uncompleted sets and carries targets', () => {
    const t = tpl({
      exercises: [
        te('a', 0, {
          restSeconds: 60,
          sets: [
            { type: 'warmup', targetWeightKg: 20, targetReps: 10 },
            { type: 'normal', targetDurationSec: 45 },
          ],
        }),
        te('b', 1, { sets: [] }),
      ],
    });
    const init = workoutInitFromTemplate(t, ctx());
    expect(init.name).toBe('Push');
    expect(init.templateId).toBe('t1');
    const [a, b] = init.exercises ?? [];
    expect(a?.restSeconds).toBe(60);
    expect(a?.sets[0]).toMatchObject({ type: 'warmup', weightKg: 20, reps: 10, completed: false });
    expect(a?.sets[1]).toMatchObject({
      type: 'normal',
      durationSec: 45,
      completed: false,
      order: 1,
    });
    expect(a?.sets[1]?.weightKg).toBeUndefined();
    expect(b?.sets).toHaveLength(1);
    expect(b?.sets[0]).toMatchObject({ type: 'normal', completed: false, order: 0 });
    const ids = [
      a?.id,
      b?.id,
      ...(a?.sets ?? []).map((s) => s.id),
      ...(b?.sets ?? []).map((s) => s.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('handles an empty template', () => {
    expect(workoutInitFromTemplate(tpl(), ctx()).exercises).toEqual([]);
  });
});

describe('templateSummary', () => {
  const n = names('a', 'b', 'c', 'd', 'e');
  const mk = (ids: string[]): Template => tpl({ exercises: ids.map((id, i) => te(id, i)) });

  it('summarises 0, 1, 2, 3 and 5 exercises', () => {
    expect(templateSummary(mk([]), n)).toBe('No exercises');
    expect(templateSummary(mk(['a']), n)).toBe('Name a');
    expect(templateSummary(mk(['a', 'b']), n)).toBe('Name a, Name b');
    expect(templateSummary(mk(['a', 'b', 'c']), n)).toBe('Name a, Name b, +1');
    expect(templateSummary(mk(['a', 'b', 'c', 'd', 'e']), n)).toBe('Name a, Name b, +3');
  });

  it('uses order and labels unknown ids', () => {
    const t = tpl({ exercises: [te('b', 1), te('zzz', 0)] });
    expect(templateSummary(t, n)).toBe('Deleted exercise, Name b');
  });
});

describe('compareTemplates', () => {
  it('sorts by last used or created descending, then name, then id', () => {
    const list = [
      tpl({ id: '3', name: 'b', createdAt: 10 }),
      tpl({ id: '2', name: 'a', createdAt: 10 }),
      tpl({ id: '1', name: 'a', createdAt: 10 }),
      tpl({ id: '4', name: 'z', createdAt: 1, lastUsedAt: 50 }),
      tpl({ id: '5', name: 'old', createdAt: 5 }),
    ];
    expect([...list].sort(compareTemplates).map((t) => t.id)).toEqual(['4', '1', '2', '3', '5']);
    const first = list[0];
    if (first) expect(compareTemplates(first, first)).toBe(0);
  });
});

describe('duplicateName', () => {
  it('prefixes and truncates at the name limit', () => {
    expect(duplicateName('Push')).toBe('Copy of Push');
    const out = duplicateName('x'.repeat(NAME_MAX));
    expect(out).toHaveLength(NAME_MAX);
    expect(out.startsWith('Copy of x')).toBe(true);
  });

  it('trims trailing whitespace left by truncation', () => {
    const head = 'a'.repeat(NAME_MAX - 'Copy of '.length - 1);
    expect(duplicateName(`${head} b`)).toBe(`Copy of ${head}`);
  });
});

describe('generic workoutOps on a TemplateDraft', () => {
  it('keeps the container type and extra fields', async () => {
    const { addExercises, addSet } = await import('../workoutOps');
    const c = ctx(77);
    const d = { ...emptyDraft(1), name: 'Keep' };
    const withEx = addExercises(d, ['a'], c);
    expect(withEx).toMatchObject({ id: null, name: 'Keep', updatedAt: 77 });
    const weId = withEx.exercises[0]?.id ?? '';
    expect(addSet(withEx, weId, c).exercises[0]?.sets).toHaveLength(2);
  });
});
