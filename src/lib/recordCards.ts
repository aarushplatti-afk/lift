import type { ExerciseRecords, RecordEntry } from './calc/records';
import { formatDurationInput } from './duration';
import { formatVolume, formatWeight } from './format';
import type { ExerciseType, Unit } from '../types/domain';

export interface RecordCard {
  key: keyof ExerciseRecords;
  label: string;
  value: string;
  entry: RecordEntry;
}

export function recordCards(
  records: ExerciseRecords,
  type: ExerciseType,
  unit: Unit,
): RecordCard[] {
  const plus = type === 'weighted_bodyweight' ? '+' : '';
  const cards: RecordCard[] = [];
  if (records.weight) {
    const value = `${plus}${formatWeight(records.weight.value, unit, { withUnit: true })}`;
    cards.push({ key: 'weight', label: 'Best weight', entry: records.weight, value });
  }
  if (records.e1rm) {
    const value = formatWeight(records.e1rm.value, unit, { withUnit: true });
    cards.push({ key: 'e1rm', label: 'Best est. 1RM', entry: records.e1rm, value });
  }
  if (records.setVolume) {
    const value = formatVolume(records.setVolume.value, unit);
    cards.push({ key: 'setVolume', label: 'Best set volume', entry: records.setVolume, value });
  }
  if (records.reps) {
    const value = `${records.reps.value} reps`;
    cards.push({ key: 'reps', label: 'Most reps', entry: records.reps, value });
  }
  if (records.duration) {
    const value = formatDurationInput(records.duration.value);
    cards.push({ key: 'duration', label: 'Longest set', entry: records.duration, value });
  }
  return cards;
}
