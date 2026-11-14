import type { Equipment, Exercise, ExerciseType, MuscleGroup } from '../types/domain';

export const NAME_MAX = 60;
export const NOTES_MAX = 500;

export const MUSCLE_GROUPS: readonly { value: MuscleGroup; label: string }[] = [
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'quads', label: 'Quads' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'calves', label: 'Calves' },
  { value: 'core', label: 'Core' },
  { value: 'forearms', label: 'Forearms' },
  { value: 'full_body', label: 'Full body' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'other', label: 'Other' },
];

export const EQUIPMENT: readonly { value: Equipment; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'band', label: 'Band' },
  { value: 'other', label: 'Other' },
];

export const EXERCISE_TYPES: readonly { value: ExerciseType; label: string }[] = [
  { value: 'weight_reps', label: 'Weight & reps' },
  { value: 'bodyweight_reps', label: 'Reps only' },
  { value: 'weighted_bodyweight', label: 'Added weight & reps' },
  { value: 'duration', label: 'Time' },
];

export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export function nameKey(s: string): string {
  return normalizeName(s).toLowerCase();
}

export function searchKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s-]+/g, ' ')
    .trim();
}

export function matchesQuery(name: string, query: string): boolean {
  const q = searchKey(query);
  if (q === '') return true;
  return searchKey(name).includes(q);
}

export function groupByInitial(list: Exercise[]): { letter: string; items: Exercise[] }[] {
  const groups: { letter: string; items: Exercise[] }[] = [];
  const byLetter = new Map<string, Exercise[]>();
  for (const ex of list) {
    const first = searchKey(ex.name).charAt(0).toUpperCase();
    const letter = /^[A-Z]$/.test(first) ? first : '#';
    let items = byLetter.get(letter);
    if (!items) {
      items = [];
      byLetter.set(letter, items);
      groups.push({ letter, items });
    }
    items.push(ex);
  }
  return groups;
}
