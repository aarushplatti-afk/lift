import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  groupByInitial,
  matchesQuery,
  nameKey,
  normalizeName,
  searchKey,
} from '../exercises';
import type { Exercise } from '../../types/domain';

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
