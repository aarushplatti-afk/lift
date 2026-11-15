import type { Exercise, Unit, Workout, WorkoutExercise, WorkoutSet } from '../types/domain';
import { todayLocal } from './dates';
import { formatWeight } from './format';

export const CSV_COLUMNS = [
  'date',
  'workout',
  'exercise',
  'set_order',
  'set_type',
  'weight',
  'reps',
  'notes',
  'unit',
  'duration_sec',
] as const;

const BOM = '﻿';
const EOL = '\r\n';
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function guardText(s: string): string {
  return FORMULA_START.test(s) ? `'${s}` : s;
}

function cell(s: string): string {
  return NEEDS_QUOTES.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function textCell(s: string | undefined): string {
  return cell(guardText(s ?? ''));
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${todayLocal(ms)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function weightCell(set: WorkoutSet, exercise: Exercise | undefined, unit: Unit): string {
  if (set.weightKg === undefined || exercise?.type === 'bodyweight_reps') return '';
  return formatWeight(set.weightKg, unit);
}

function numberCell(n: number | undefined): string {
  return n === undefined ? '' : String(n);
}

function blockRows(
  workout: Workout,
  block: WorkoutExercise,
  exercises: ReadonlyMap<string, Exercise>,
  unit: Unit,
): string[] {
  const exercise = exercises.get(block.exerciseId);
  const sets = [...block.sets].sort((a, b) => a.order - b.order);
  const rows: string[] = [];
  sets.forEach((set, index) => {
    if (!set.completed) return;
    rows.push(
      [
        formatDateTime(workout.startedAt),
        textCell(workout.name),
        textCell(exercise?.name ?? 'Unknown exercise'),
        String(index + 1),
        set.type,
        weightCell(set, exercise, unit),
        numberCell(set.reps),
        textCell(block.notes),
        unit,
        numberCell(set.durationSec),
      ].join(','),
    );
  });
  return rows;
}

export function toCsv(
  workouts: readonly Workout[],
  exercises: ReadonlyMap<string, Exercise>,
  unit: Unit,
): string {
  const lines: string[] = [CSV_COLUMNS.join(',')];
  const ordered = workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const workout of ordered) {
    const blocks = [...workout.exercises].sort((a, b) => a.order - b.order);
    for (const block of blocks) lines.push(...blockRows(workout, block, exercises, unit));
  }
  return BOM + lines.join(EOL) + EOL;
}

export function csvFileName(now: number): string {
  return `lift-workouts-${todayLocal(now)}.csv`;
}
