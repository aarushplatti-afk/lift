import type { Workout, WorkoutSet } from '../../types/domain';
import { completedSetCount, workoutVolume, type ExerciseTypes } from './volume';

export interface MonthGroup {
  key: string;
  label: string;
  workouts: Workout[];
}

export interface WorkoutStats {
  durationMs: number | undefined;
  volumeKg: number;
  exerciseCount: number;
  setCount: number;
  prCount: number;
}

export interface ExerciseSession {
  workoutId: string;
  workoutName: string;
  startedAt: number;
  sets: WorkoutSet[];
  hasPR: boolean;
}

export function compareWorkoutsDesc(a: Workout, b: Workout): number {
  if (a.startedAt !== b.startedAt) return b.startedAt - a.startedAt;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function groupByMonth(workouts: readonly Workout[]): MonthGroup[] {
  const sorted = workouts.filter((w) => w.status === 'completed').sort(compareWorkoutsDesc);
  const groups: MonthGroup[] = [];
  for (const w of sorted) {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.workouts.push(w);
    } else {
      groups.push({
        key,
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        workouts: [w],
      });
    }
  }
  return groups;
}

export function workoutStats(w: Workout, types: ExerciseTypes): WorkoutStats {
  let prCount = 0;
  for (const we of w.exercises) {
    for (const s of we.sets) if (s.isPR) prCount += 1;
  }
  return {
    durationMs: w.endedAt === undefined ? undefined : Math.max(0, w.endedAt - w.startedAt),
    volumeKg: workoutVolume(w, types),
    exerciseCount: w.exercises.length,
    setCount: completedSetCount(w, types),
    prCount,
  };
}

export function exerciseHistory(
  exerciseId: string,
  workouts: readonly Workout[],
): ExerciseSession[] {
  const sessions: ExerciseSession[] = [];
  const sorted = workouts.filter((w) => w.status === 'completed').sort(compareWorkoutsDesc);
  for (const w of sorted) {
    const sets: WorkoutSet[] = [];
    const blocks = w.exercises
      .filter((we) => we.exerciseId === exerciseId)
      .sort((a, b) => a.order - b.order);
    for (const we of blocks) {
      const ordered = [...we.sets].sort((a, b) => a.order - b.order);
      for (const s of ordered) if (s.completed) sets.push(s);
    }
    if (sets.length === 0) continue;
    sessions.push({
      workoutId: w.id,
      workoutName: w.name,
      startedAt: w.startedAt,
      sets,
      hasPR: sets.some((s) => s.isPR === true),
    });
  }
  return sessions;
}
