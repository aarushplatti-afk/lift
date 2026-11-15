import { describe, expect, it } from 'vitest';
import type { ExerciseRecords, RecordEntry } from '../calc/records';
import { recordCards } from '../recordCards';

function entry(value: number): RecordEntry {
  return {
    value,
    workoutId: 'w',
    startedAt: 0,
    set: { id: 's', order: 0, type: 'normal', completed: true },
  };
}

describe('recordCards', () => {
  it('returns nothing for empty records', () => {
    expect(recordCards({}, 'weight_reps', 'kg')).toEqual([]);
  });

  it('labels weight_reps cards in order', () => {
    const records: ExerciseRecords = {
      weight: entry(100),
      e1rm: entry(120),
      setVolume: entry(500),
    };
    const cards = recordCards(records, 'weight_reps', 'kg');
    expect(cards.map((c) => c.label)).toEqual(['Best weight', 'Best est. 1RM', 'Best set volume']);
    expect(cards.map((c) => c.key)).toEqual(['weight', 'e1rm', 'setVolume']);
    expect(cards[0]?.value).toBe('100 kg');
  });

  it('converts to pounds', () => {
    const cards = recordCards({ weight: entry(100) }, 'weight_reps', 'lb');
    expect(cards[0]?.value).toMatch(/220\.5 lb/);
  });

  it('prefixes added weight with + and adds Most reps', () => {
    const cards = recordCards({ weight: entry(10), reps: entry(12) }, 'weighted_bodyweight', 'kg');
    expect(cards.map((c) => c.label)).toEqual(['Best weight', 'Most reps']);
    expect(cards[0]?.value).toBe('+10 kg');
    expect(cards[1]?.value).toBe('12 reps');
  });

  it('labels reps-only and duration cards', () => {
    expect(recordCards({ reps: entry(20) }, 'bodyweight_reps', 'kg')[0]).toMatchObject({
      label: 'Most reps',
      value: '20 reps',
    });
    expect(recordCards({ duration: entry(90) }, 'duration', 'kg')[0]).toMatchObject({
      label: 'Longest set',
      value: '1:30',
    });
  });
});
