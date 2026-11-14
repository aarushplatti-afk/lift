import { describe, expect, it } from 'vitest';
import {
  groupOrdinals,
  pickPreviousWorkout,
  previousSetFor,
  setBadgeLabels,
  setGroup,
} from '../previous';
import { mkEx, mkSet, mkWorkout } from './fixtures';
import type { SetType } from '../../../types/domain';

const typed = (types: SetType[]) => types.map((t, i) => mkSet(`s${i}`, { type: t }));

describe('setGroup / groupOrdinals / setBadgeLabels', () => {
  it('groups warmups apart from working sets', () => {
    expect(setGroup('warmup')).toBe('warmup');
    expect(setGroup('normal')).toBe('working');
    expect(setGroup('drop')).toBe('working');
    expect(setGroup('failure')).toBe('working');
  });
  it('counts ordinals per group', () => {
    const sets = typed(['warmup', 'warmup', 'normal', 'normal', 'drop', 'normal', 'failure']);
    expect(groupOrdinals(sets)).toEqual([0, 1, 0, 1, 2, 3, 4]);
  });
  it('labels W,W,1,2,D,3,F', () => {
    const sets = typed(['warmup', 'warmup', 'normal', 'normal', 'drop', 'normal', 'failure']);
    expect(setBadgeLabels(sets)).toEqual(['W', 'W', '1', '2', 'D', '3', 'F']);
  });
  it('handles empty input', () => {
    expect(groupOrdinals([])).toEqual([]);
    expect(setBadgeLabels([])).toEqual([]);
  });
});

const bench = (id: string, startedAt: number, sets = [mkSet('a', { reps: 5 })], over = {}) =>
  mkWorkout(id, [mkEx(`e-${id}`, 'bench', sets)], { startedAt, ...over });

describe('pickPreviousWorkout', () => {
  it('returns the most recent completed workout before the cutoff', () => {
    const ws = [bench('a', 100), bench('b', 300), bench('c', 200)];
    expect(pickPreviousWorkout('bench', 1000, ws)?.id).toBe('b');
  });
  it('ignores in-progress, same-start, later, and unrelated workouts', () => {
    const ws = [
      bench('ip', 900, undefined, { status: 'in_progress' }),
      bench('same', 1000),
      bench('later', 2000),
      mkWorkout('other', [mkEx('x', 'squat', [mkSet('s')])], { startedAt: 800 }),
      bench('ok', 100),
    ];
    expect(pickPreviousWorkout('bench', 1000, ws)?.id).toBe('ok');
  });
  it('breaks startedAt ties by higher id, regardless of input order', () => {
    const a = bench('a', 500);
    const b = bench('b', 500);
    expect(pickPreviousWorkout('bench', 1000, [a, b])?.id).toBe('b');
    expect(pickPreviousWorkout('bench', 1000, [b, a])?.id).toBe('b');
  });
  it('returns undefined for empty input or unknown exercise', () => {
    expect(pickPreviousWorkout('bench', 1000, [])).toBeUndefined();
    expect(pickPreviousWorkout('nope', 1000, [bench('a', 100)])).toBeUndefined();
  });
});

describe('previousSetFor', () => {
  it('matches warmups only with warmups', () => {
    const prev = bench('p', 1, [mkSet('w', { type: 'warmup', reps: 10 }), mkSet('n', { reps: 5 })]);
    expect(previousSetFor('bench', 0, 'warmup', prev)?.id).toBe('w');
    expect(previousSetFor('bench', 1, 'warmup', prev)).toBeUndefined();
  });
  it('skips prior warmups for working sets', () => {
    const prev = bench('p', 1, [mkSet('w', { type: 'warmup' }), mkSet('n1'), mkSet('n2')]);
    expect(previousSetFor('bench', 0, 'normal', prev)?.id).toBe('n1');
    expect(previousSetFor('bench', 1, 'normal', prev)?.id).toBe('n2');
  });
  it('treats drop and failure as working sets on both sides', () => {
    const prev = bench('p', 1, [
      mkSet('n'),
      mkSet('d', { type: 'drop' }),
      mkSet('f', { type: 'failure' }),
    ]);
    expect(previousSetFor('bench', 1, 'failure', prev)?.id).toBe('d');
    expect(previousSetFor('bench', 2, 'drop', prev)?.id).toBe('f');
  });
  it('returns undefined when the prior has fewer sets or no workout', () => {
    const prev = bench('p', 1, [mkSet('n')]);
    expect(previousSetFor('bench', 1, 'normal', prev)).toBeUndefined();
    expect(previousSetFor('bench', 0, 'normal', undefined)).toBeUndefined();
  });
  it('skips incomplete prior sets', () => {
    const prev = bench('p', 1, [mkSet('x', { completed: false }), mkSet('n2')]);
    expect(previousSetFor('bench', 0, 'normal', prev)?.id).toBe('n2');
  });
  it('joins duplicate blocks in block order', () => {
    const prev = mkWorkout('p', [
      mkEx('b2', 'bench', [mkSet('c')], 1),
      mkEx('b1', 'bench', [mkSet('a'), mkSet('b')], 0),
      mkEx('o', 'squat', [mkSet('z')], 2),
    ]);
    expect(previousSetFor('bench', 0, 'normal', prev)?.id).toBe('a');
    expect(previousSetFor('bench', 2, 'normal', prev)?.id).toBe('c');
    expect(previousSetFor('bench', 3, 'normal', prev)).toBeUndefined();
  });
  it('returns undefined for an unknown exercise', () => {
    expect(previousSetFor('nope', 0, 'normal', bench('p', 1))).toBeUndefined();
  });
});
