import { describe, expect, it } from 'vitest';
import type { ExerciseType } from '../../../types/domain';
import { prepareFinish } from '../finish';
import { mkEx, mkSet, mkWorkout } from './fixtures';

const types = new Map<string, ExerciseType>([
  ['bench', 'weight_reps'],
  ['plank', 'duration'],
]);
const NOW = 5000;
const plan = (w: ReturnType<typeof mkWorkout>, markIncomplete = false) =>
  prepareFinish(w, types, { markIncomplete, now: NOW });

describe('prepareFinish', () => {
  it('drops empty sets silently', () => {
    const w = mkWorkout('w', [
      mkEx('e', 'bench', [
        mkSet('a', { weightKg: 100, reps: 5 }),
        mkSet('b', { completed: false }),
      ]),
    ]);
    const p = plan(w);
    expect(p.incompleteCount).toBe(0);
    expect(p.cleaned.exercises[0]?.sets.map((s) => s.id)).toEqual(['a']);
  });

  it('counts then drops incomplete sets', () => {
    const w = mkWorkout('w', [
      mkEx('e', 'bench', [
        mkSet('a', { weightKg: 100, reps: 5 }),
        mkSet('b', { weightKg: 100, reps: 5, completed: false }),
        mkSet('c', { weightKg: 100, completed: false }),
      ]),
    ]);
    const p = plan(w);
    expect(p.incompleteCount).toBe(2);
    expect(p.cleaned.exercises[0]?.sets.map((s) => s.id)).toEqual(['a']);
  });

  it('markIncomplete completes valid sets with completedAt', () => {
    const w = mkWorkout('w', [
      mkEx('e', 'bench', [
        mkSet('a', { weightKg: 100, reps: 5 }),
        mkSet('b', { weightKg: 90, reps: 5, completed: false }),
      ]),
    ]);
    const p = plan(w, true);
    expect(p.incompleteCount).toBe(1);
    const b = p.cleaned.exercises[0]?.sets[1];
    expect(b?.completed).toBe(true);
    expect(b?.completedAt).toBe(NOW);
  });

  it('markIncomplete still drops sets that remain invalid', () => {
    const w = mkWorkout('w', [
      mkEx('e', 'bench', [
        mkSet('a', { weightKg: 100, reps: 5 }),
        mkSet('b', { weightKg: 90, completed: false }),
      ]),
    ]);
    const p = plan(w, true);
    expect(p.incompleteCount).toBe(1);
    expect(p.cleaned.exercises[0]?.sets.map((s) => s.id)).toEqual(['a']);
  });

  it('removes exercises with no sets left', () => {
    const w = mkWorkout('w', [
      mkEx('e1', 'bench', [mkSet('a', { completed: false })]),
      mkEx('e2', 'plank', [mkSet('b', { durationSec: 30 })], 1),
    ]);
    const p = plan(w);
    expect(p.cleaned.exercises.map((e) => e.id)).toEqual(['e2']);
    expect(p.isEmpty).toBe(false);
  });

  it('is empty when nothing remains', () => {
    expect(plan(mkWorkout('w', [])).isEmpty).toBe(true);
    const w = mkWorkout('w', [mkEx('e', 'bench', [mkSet('a', { weightKg: 5, completed: false })])]);
    const p = plan(w);
    expect(p.isEmpty).toBe(true);
    expect(p.incompleteCount).toBe(1);
  });

  it('is not empty with markIncomplete salvaging a set', () => {
    const w = mkWorkout('w', [
      mkEx('e', 'bench', [mkSet('a', { weightKg: 5, reps: 5, completed: false })]),
    ]);
    expect(plan(w, true).isEmpty).toBe(false);
  });

  it('renumbers exercises and sets', () => {
    const w = mkWorkout('w', [
      mkEx('e1', 'bench', [mkSet('x', { completed: false })], 0),
      mkEx(
        'e2',
        'bench',
        [
          mkSet('a', { completed: false }),
          mkSet('b', { weightKg: 10, reps: 1 }),
          mkSet('c', { weightKg: 10, reps: 2 }),
        ],
        1,
      ),
      mkEx('e3', 'bench', [mkSet('d', { weightKg: 10, reps: 3 })], 2),
    ]);
    const p = plan(w);
    expect(p.cleaned.exercises.map((e) => [e.id, e.order])).toEqual([
      ['e2', 0],
      ['e3', 1],
    ]);
    expect(p.cleaned.exercises[0]?.sets.map((s) => [s.id, s.order])).toEqual([
      ['b', 0],
      ['c', 1],
    ]);
  });

  it('treats a completed set whose data was cleared as empty (W7)', () => {
    const w = mkWorkout('w', [
      mkEx('e', 'bench', [mkSet('a', { weightKg: 100, reps: 5 }), mkSet('b')]),
    ]);
    const p = plan(w);
    expect(p.incompleteCount).toBe(0);
    expect(p.cleaned.exercises[0]?.sets.map((s) => s.id)).toEqual(['a']);
  });

  it('treats a completed set that became invalid as incomplete (W7)', () => {
    const w = mkWorkout('w', [
      mkEx('e', 'bench', [mkSet('a', { weightKg: 100, reps: 5 }), mkSet('b', { weightKg: 100 })]),
    ]);
    const p = plan(w);
    expect(p.incompleteCount).toBe(1);
    expect(p.cleaned.exercises[0]?.sets.map((s) => s.id)).toEqual(['a']);
  });

  it('uses weight_reps for unknown exercises and does not mutate input', () => {
    const w = mkWorkout('w', [mkEx('e', 'gone', [mkSet('a', { weightKg: 10, reps: 5 })])]);
    const snapshot = structuredClone(w);
    const p = plan(w);
    expect(p.isEmpty).toBe(false);
    expect(w).toEqual(snapshot);
  });
});
