import type { ExerciseType, Workout, WorkoutSet } from '../../types/domain';
import { setE1rm } from './e1rm';
import { isWorkingSet, round4, setVolume } from './volume';

export interface RecordEntry {
  value: number;
  workoutId: string;
  startedAt: number;
  set: WorkoutSet;
}

export interface ExerciseRecords {
  weight?: RecordEntry;
  e1rm?: RecordEntry;
  setVolume?: RecordEntry;
  reps?: RecordEntry;
  duration?: RecordEntry;
}

export interface TrainedExercise {
  exerciseId: string;
  lastStartedAt: number;
  sessionCount: number;
}

function compareWorkouts(a: Workout, b: Workout): number {
  if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function exerciseRecords(
  exerciseId: string,
  workouts: readonly Workout[],
  type: ExerciseType,
): ExerciseRecords {
  const records: ExerciseRecords = {};
  const offer = (
    key: keyof ExerciseRecords,
    raw: number | undefined,
    w: Workout,
    set: WorkoutSet,
  ): void => {
    if (raw === undefined) return;
    const value = round4(raw);
    if (value <= 0) return;
    const current = records[key];
    if (current === undefined || value > current.value) {
      records[key] = { value, workoutId: w.id, startedAt: w.startedAt, set };
    }
  };
  const kgType = type === 'weight_reps' || type === 'weighted_bodyweight';
  const completed = workouts.filter((w) => w.status === 'completed').sort(compareWorkouts);
  for (const w of completed) {
    const blocks = w.exercises
      .filter((we) => we.exerciseId === exerciseId)
      .sort((a, b) => a.order - b.order);
    for (const we of blocks) {
      const sets = [...we.sets].sort((a, b) => a.order - b.order);
      for (const s of sets) {
        if (!isWorkingSet(s, type)) continue;
        if (kgType) {
          offer('weight', s.weightKg, w, s);
          offer('e1rm', setE1rm(s, type), w, s);
          offer('setVolume', setVolume(s, type), w, s);
          if (type === 'weighted_bodyweight') offer('reps', s.reps, w, s);
        } else if (type === 'bodyweight_reps') {
          offer('reps', s.reps, w, s);
        } else {
          offer('duration', s.durationSec, w, s);
        }
      }
    }
  }
  return records;
}

function isBetter(a: WorkoutSet, b: WorkoutSet, type: ExerciseType): boolean {
  switch (type) {
    case 'weight_reps':
    case 'weighted_bodyweight': {
      const wa = round4(a.weightKg ?? 0);
      const wb = round4(b.weightKg ?? 0);
      if (wa !== wb) return wa > wb;
      return (a.reps ?? 0) > (b.reps ?? 0);
    }
    case 'bodyweight_reps':
      return (a.reps ?? 0) > (b.reps ?? 0);
    case 'duration':
      return (a.durationSec ?? 0) > (b.durationSec ?? 0);
  }
}

export function topSet(sets: readonly WorkoutSet[], type: ExerciseType): WorkoutSet | undefined {
  const ordered = sets.filter((s) => isWorkingSet(s, type)).sort((a, b) => a.order - b.order);
  let best: WorkoutSet | undefined;
  for (const s of ordered) {
    if (best === undefined || isBetter(s, best, type)) best = s;
  }
  return best;
}

export function trainedExercises(workouts: readonly Workout[]): TrainedExercise[] {
  const byId = new Map<string, TrainedExercise>();
  for (const w of workouts) {
    if (w.status !== 'completed') continue;
    const seen = new Set<string>();
    for (const we of w.exercises) {
      if (seen.has(we.exerciseId)) continue;
      if (!we.sets.some((s) => s.completed)) continue;
      seen.add(we.exerciseId);
      const cur = byId.get(we.exerciseId);
      if (cur === undefined) {
        byId.set(we.exerciseId, {
          exerciseId: we.exerciseId,
          lastStartedAt: w.startedAt,
          sessionCount: 1,
        });
      } else {
        cur.sessionCount += 1;
        if (w.startedAt > cur.lastStartedAt) cur.lastStartedAt = w.startedAt;
      }
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.lastStartedAt !== b.lastStartedAt) return b.lastStartedAt - a.lastStartedAt;
    return a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0;
  });
}
