import type { Exercise, ExerciseType, Workout, WorkoutSet } from '../../types/domain';
import { CSV_COLUMNS, csvFileName, toCsv } from '../csv';

const BOM = '﻿';
const HEADER = CSV_COLUMNS.join(',');

function exercise(id: string, name: string, type: ExerciseType = 'weight_reps'): Exercise {
  return {
    id,
    userId: 'u',
    updatedAt: 0,
    name,
    muscleGroup: 'chest',
    equipment: 'barbell',
    type,
    isCustom: false,
    archived: false,
    createdAt: 0,
  };
}

function set(order: number, over: Partial<WorkoutSet> = {}): WorkoutSet {
  return { id: `s${order}`, order, type: 'normal', completed: true, ...over };
}

function workout(over: Partial<Workout> & Pick<Workout, 'id'>): Workout {
  return {
    userId: 'u',
    updatedAt: 0,
    name: 'Push',
    startedAt: new Date(2026, 10, 12, 9, 5).getTime(),
    endedAt: new Date(2026, 10, 12, 10, 0).getTime(),
    status: 'completed',
    exercises: [],
    createdAt: 0,
    ...over,
  };
}

function exMap(...list: Exercise[]): Map<string, Exercise> {
  return new Map(list.map((e) => [e.id, e]));
}

function lines(csv: string): string[] {
  return csv.slice(BOM.length).split('\r\n');
}

const bench = exercise('bench', 'Bench Press');

describe('toCsv', () => {
  it('writes only the header for empty input, with BOM and CRLF', () => {
    const csv = toCsv([], new Map(), 'lb');
    expect(csv).toBe(`${BOM}${HEADER}\r\n`);
  });

  it('uses the PRD columns in order', () => {
    expect(HEADER).toBe(
      'date,workout,exercise,set_order,set_type,weight,reps,notes,unit,duration_sec',
    );
  });

  it('formats one row with local date, display weight and unit', () => {
    const w = workout({
      id: 'w1',
      exercises: [
        {
          id: 'b1',
          exerciseId: 'bench',
          order: 0,
          notes: 'Felt good',
          sets: [set(0, { weightKg: 61.2349, reps: 8 })],
        },
      ],
    });
    const rows = lines(toCsv([w], exMap(bench), 'lb'));
    expect(rows[1]).toBe('2026-11-12 09:05,Push,Bench Press,1,normal,135,8,Felt good,lb,');
  });

  it('shows kg values and the kg unit', () => {
    const w = workout({
      id: 'w1',
      exercises: [
        { id: 'b1', exerciseId: 'bench', order: 0, sets: [set(0, { weightKg: 62.5, reps: 5 })] },
      ],
    });
    expect(lines(toCsv([w], exMap(bench), 'kg'))[1]).toBe(
      '2026-11-12 09:05,Push,Bench Press,1,normal,62.5,5,,kg,',
    );
  });

  it('skips incomplete sets and in-progress workouts, numbering by block position', () => {
    const done = workout({
      id: 'w1',
      exercises: [
        {
          id: 'b1',
          exerciseId: 'bench',
          order: 0,
          sets: [
            set(0, { weightKg: 20, reps: 5, type: 'warmup' }),
            set(1, { weightKg: 40, reps: 5, completed: false }),
            set(2, { weightKg: 60, reps: 5, type: 'failure' }),
          ],
        },
      ],
    });
    const active = workout({
      id: 'w2',
      status: 'in_progress',
      exercises: [
        { id: 'b2', exerciseId: 'bench', order: 0, sets: [set(0, { weightKg: 99, reps: 1 })] },
      ],
    });
    const rows = lines(toCsv([done, active], exMap(bench), 'kg'));
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain(',1,warmup,20,5,');
    expect(rows[2]).toContain(',3,failure,60,5,');
  });

  it('orders workouts chronologically, then blocks, then sets', () => {
    const squat = exercise('squat', 'Squat');
    const later = workout({
      id: 'later',
      name: 'Later',
      startedAt: new Date(2026, 10, 13, 8, 0).getTime(),
      exercises: [
        { id: 'b', exerciseId: 'bench', order: 0, sets: [set(0, { weightKg: 1, reps: 1 })] },
      ],
    });
    const earlier = workout({
      id: 'earlier',
      name: 'Earlier',
      exercises: [
        { id: 'b2', exerciseId: 'squat', order: 1, sets: [set(0, { weightKg: 1, reps: 1 })] },
        {
          id: 'b1',
          exerciseId: 'bench',
          order: 0,
          sets: [set(1, { weightKg: 1, reps: 2 }), set(0, { weightKg: 1, reps: 1 })],
        },
      ],
    });
    const rows = lines(toCsv([later, earlier], exMap(bench, squat), 'kg')).slice(1, 5);
    expect(rows.map((r) => r.split(',').slice(1, 4).join('|'))).toEqual([
      'Earlier|Bench Press|1',
      'Earlier|Bench Press|2',
      'Earlier|Squat|1',
      'Later|Bench Press|1',
    ]);
  });

  it('breaks start-time ties by id and does not mutate its input', () => {
    const exs = [
      { id: 'b', exerciseId: 'bench', order: 0, sets: [set(0, { weightKg: 1, reps: 1 })] },
    ];
    const b = workout({ id: 'b', name: 'B', exercises: exs });
    const a = workout({ id: 'a', name: 'A', exercises: exs });
    const input = [b, a];
    const rows = lines(toCsv(input, exMap(bench), 'kg'));
    expect(rows[1]).toContain(',A,');
    expect(input[0]).toBe(b);
  });

  it('leaves weight blank for bodyweight_reps and keeps added weight for weighted_bodyweight', () => {
    const pull = exercise('pull', 'Pull-up', 'bodyweight_reps');
    const dip = exercise('dip', 'Dip', 'weighted_bodyweight');
    const w = workout({
      id: 'w1',
      exercises: [
        { id: 'b1', exerciseId: 'pull', order: 0, sets: [set(0, { weightKg: 0, reps: 10 })] },
        { id: 'b2', exerciseId: 'dip', order: 1, sets: [set(0, { weightKg: 10, reps: 8 })] },
      ],
    });
    const rows = lines(toCsv([w], exMap(pull, dip), 'kg'));
    expect(rows[1]).toBe('2026-11-12 09:05,Push,Pull-up,1,normal,,10,,kg,');
    expect(rows[2]).toBe('2026-11-12 09:05,Push,Dip,1,normal,10,8,,kg,');
  });

  it('writes duration and blank reps for timed sets', () => {
    const plank = exercise('plank', 'Plank', 'duration');
    const w = workout({
      id: 'w1',
      exercises: [{ id: 'b1', exerciseId: 'plank', order: 0, sets: [set(0, { durationSec: 90 })] }],
    });
    expect(lines(toCsv([w], exMap(plank), 'kg'))[1]).toBe(
      '2026-11-12 09:05,Push,Plank,1,normal,,,,kg,90',
    );
  });

  it('labels missing exercises as Unknown exercise', () => {
    const w = workout({
      id: 'w1',
      exercises: [
        { id: 'b1', exerciseId: 'gone', order: 0, sets: [set(0, { weightKg: 5, reps: 5 })] },
      ],
    });
    expect(lines(toCsv([w], new Map(), 'kg'))[1]).toContain(',Unknown exercise,');
  });

  it('repeats block notes on every row', () => {
    const w = workout({
      id: 'w1',
      exercises: [
        {
          id: 'b1',
          exerciseId: 'bench',
          order: 0,
          notes: 'tempo',
          sets: [set(0, { weightKg: 1, reps: 1 }), set(1, { weightKg: 1, reps: 1 })],
        },
      ],
    });
    const rows = lines(toCsv([w], exMap(bench), 'kg'));
    expect(rows[1]).toContain(',tempo,');
    expect(rows[2]).toContain(',tempo,');
  });

  it('quotes cells with commas, quotes and newlines per RFC 4180', () => {
    const w = workout({
      id: 'w1',
      name: 'Legs, "heavy"',
      exercises: [
        {
          id: 'b1',
          exerciseId: 'bench',
          order: 0,
          notes: 'line1\nline2',
          sets: [set(0, { weightKg: 1, reps: 1 })],
        },
      ],
    });
    const csv = toCsv([w], exMap(bench), 'kg');
    expect(csv).toContain('"Legs, ""heavy"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx', '\rx'])('guards formula start %j', (text) => {
    const w = workout({
      id: 'w1',
      name: text,
      exercises: [
        { id: 'b1', exerciseId: 'bench', order: 0, sets: [set(0, { weightKg: 1, reps: 1 })] },
      ],
    });
    const csv = toCsv([w], exMap(bench), 'kg');
    expect(csv).toContain(`'${text.replace(/"/g, '""')}`);
    expect(csv).not.toMatch(/(^|,)[=+\-@]/m);
  });

  it('does not prefix numbers or ordinary text', () => {
    const w = workout({
      id: 'w1',
      name: 'Push = pull',
      exercises: [
        { id: 'b1', exerciseId: 'bench', order: 0, sets: [set(0, { weightKg: 1, reps: 1 })] },
      ],
    });
    expect(lines(toCsv([w], exMap(bench), 'kg'))[1]).toBe(
      '2026-11-12 09:05,Push = pull,Bench Press,1,normal,1,1,,kg,',
    );
  });
});

describe('csvFileName', () => {
  it('uses the local date', () => {
    expect(csvFileName(new Date(2026, 0, 2, 23, 30).getTime())).toBe(
      'lift-workouts-2026-01-02.csv',
    );
  });
});
