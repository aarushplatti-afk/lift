import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  groupByInitial,
  matchesQuery,
  nameKey,
  prGroups,
  selectorSections,
  normalizeName,
  searchKey,
} from '../exercises';
import type { ExerciseRecords } from '../calc/records';
import type { Exercise, MuscleGroup } from '../../types/domain';

function ex(name: string): Exercise {
  return {
    id: name,
    userId: 'u',
    name,
    muscleGroup: 'chest',
    equipment: 'barbell',
    type: 'weight_reps',
    isCustom: true,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('name helpers', () => {
  it('normalizes whitespace', () => {
    expect(normalizeName('  Bench \t  Press  ')).toBe('Bench Press');
    expect(normalizeName('   ')).toBe('');
  });

  it('nameKey lowercases without folding diacritics', () => {
    expect(nameKey('  Bench   PRESS ')).toBe('bench press');
    expect(nameKey('Café')).toBe('café');
  });

  it('searchKey folds diacritics, hyphens, and whitespace', () => {
    expect(searchKey('Café')).toBe('cafe');
    expect(searchKey('Pull-Up')).toBe('pull up');
    expect(searchKey('  Pull   -  Up ')).toBe('pull up');
  });

  it('matchesQuery matches substrings and empty queries', () => {
    expect(matchesQuery('Café Curl', 'cafe')).toBe(true);
    expect(matchesQuery('Pull-Up', 'pull up')).toBe(true);
    expect(matchesQuery('Pull-Up', 'pull-up')).toBe(true);
    expect(matchesQuery('Squat', 'bench')).toBe(false);
    expect(matchesQuery('Squat', '')).toBe(true);
    expect(matchesQuery('Squat', '   ')).toBe(true);
  });
});

describe('groupByInitial', () => {
  it('returns an empty list for empty input', () => {
    expect(groupByInitial([])).toEqual([]);
  });

  it('groups by first letter keeping input order', () => {
    const groups = groupByInitial([ex('Apple'), ex('avocado'), ex('Bench'), ex('Álamo')]);
    expect(groups.map((g) => g.letter)).toEqual(['A', 'B']);
    expect(groups[0]?.items.map((e) => e.name)).toEqual(['Apple', 'avocado', 'Álamo']);
  });

  it('puts non-letters under #', () => {
    const groups = groupByInitial([ex('21s Curl'), ex('Bench'), ex('(Weird)')]);
    expect(groups.map((g) => g.letter)).toEqual(['#', 'B']);
    expect(groups[0]?.items).toHaveLength(2);
  });
});

describe('constants', () => {
  it('have unique values and expected labels', () => {
    expect(new Set(MUSCLE_GROUPS.map((m) => m.value)).size).toBe(14);
    expect(new Set(EQUIPMENT.map((e) => e.value)).size).toBe(8);
    expect(EXERCISE_TYPES.map((t) => t.label)).toEqual([
      'Weight & reps',
      'Reps only',
      'Added weight & reps',
      'Time',
    ]);
  });
});

describe('selectorSections', () => {
  const mk = (id: string, name: string, archived = false): Exercise => ({
    ...ex(name),
    id,
    archived,
  });
  const bench = mk('bench', 'Barbell Bench Press');
  const oldPress = mk('old', 'Bench Press (old)', true);
  const incline = mk('incline', 'Incline Bench Press');
  const dbBench = mk('db', 'Dumbbell Bench Press');
  const squat = mk('squat', 'Squat');
  const hidden = mk('hidden', 'Bench Hidden', true);
  const all = [squat, hidden, incline, bench, dbBench, oldPress];
  const trained = [
    { exerciseId: 'squat', lastStartedAt: 3000, sessionCount: 2 },
    { exerciseId: 'old', lastStartedAt: 2000, sessionCount: 1 },
    { exerciseId: 'bench', lastStartedAt: 1000, sessionCount: 5 },
    { exerciseId: 'gone', lastStartedAt: 500, sessionCount: 1 },
  ];

  it('blank query shows trained only, by recency, archived included', () => {
    const r = selectorSections(all, trained, '  ');
    expect(r.trained.map((e) => e.id)).toEqual(['squat', 'old', 'bench']);
    expect(r.others).toEqual([]);
  });

  it('query lists trained matches then untrained non-archived by collator order', () => {
    const r = selectorSections(all, trained, 'bench press');
    expect(r.trained.map((e) => e.id)).toEqual(['old', 'bench']);
    expect(r.others.map((e) => e.id)).toEqual(['db', 'incline']);
  });

  it('excludes untrained archived exercises and handles no matches', () => {
    expect(selectorSections(all, trained, 'hidden').others).toEqual([]);
    expect(selectorSections(all, trained, 'zzz')).toEqual({ trained: [], others: [] });
  });

  it('handles empty inputs', () => {
    expect(selectorSections([], [], '')).toEqual({ trained: [], others: [] });
  });
});

describe('prGroups', () => {
  const rec: ExerciseRecords = {
    weight: {
      value: 1,
      workoutId: 'w',
      startedAt: 0,
      set: { id: 's', order: 0, type: 'normal', completed: true },
    },
  };
  function build(
    specs: { name: string; muscle?: MuscleGroup; archived?: boolean; empty?: boolean }[],
  ) {
    const exercises = new Map<string, Exercise>();
    const records = new Map<string, ExerciseRecords>();
    for (const sp of specs) {
      exercises.set(sp.name, {
        ...ex(sp.name),
        muscleGroup: sp.muscle ?? 'chest',
        archived: sp.archived ?? false,
      });
      if (sp.empty !== true) records.set(sp.name, rec);
    }
    return { exercises, records };
  }

  it('sorts with the collator (numeric, case-insensitive)', () => {
    const { exercises, records } = build([
      { name: 'Row 10' },
      { name: 'row 2' },
      { name: 'Bench' },
    ]);
    const names = prGroups(exercises, records, '', 'all').map((g) => g.exercise.name);
    expect(names).toEqual(['Bench', 'row 2', 'Row 10']);
  });

  it('filters by query and muscle', () => {
    const { exercises, records } = build([
      { name: 'Bench Press' },
      { name: 'Back Squat', muscle: 'quads' },
      { name: 'Squat Jump', muscle: 'quads' },
    ]);
    expect(prGroups(exercises, records, 'squat', 'all')).toHaveLength(2);
    expect(prGroups(exercises, records, 'squat', 'chest')).toHaveLength(0);
    expect(prGroups(exercises, records, '', 'quads')).toHaveLength(2);
    expect(prGroups(exercises, records, 'BENCH', 'chest')).toHaveLength(1);
  });

  it('includes archived exercises and excludes ones without records', () => {
    const { exercises, records } = build([
      { name: 'Old', archived: true },
      { name: 'Never done', empty: true },
      { name: 'Zero' },
    ]);
    records.set('Zero', {});
    const names = prGroups(exercises, records, '', 'all').map((g) => g.exercise.name);
    expect(names).toEqual(['Old']);
  });

  it('returns empty for empty input', () => {
    expect(prGroups(new Map(), new Map(), '', 'all')).toEqual([]);
  });
});
