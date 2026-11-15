import type { ExerciseType, Workout, WorkoutSet } from '../../types/domain';
import { setE1rm } from './e1rm';
import { isWorkingSet, round4, setVolume } from './volume';

export type Metric = 'weight' | 'e1rm' | 'volume' | 'reps' | 'duration';
export type ValueKind = 'kg' | 'count' | 'seconds';

export interface Point {
  t: number;
  value: number;
  workoutId: string;
  set?: WorkoutSet;
  setCount: number;
}

export function metricsFor(type: ExerciseType): readonly Metric[] {
  switch (type) {
    case 'weight_reps':
    case 'weighted_bodyweight':
      return ['weight', 'e1rm', 'volume', 'reps'];
    case 'bodyweight_reps':
      return ['reps', 'volume'];
    case 'duration':
      return ['duration'];
  }
}

export function metricKind(metric: Metric, type: ExerciseType): ValueKind {
  switch (metric) {
    case 'weight':
    case 'e1rm':
      return 'kg';
    case 'reps':
      return 'count';
    case 'duration':
      return 'seconds';
    case 'volume':
      return type === 'bodyweight_reps' ? 'count' : 'kg';
  }
}

export function isZeroBased(metric: Metric): boolean {
  return metric !== 'weight' && metric !== 'e1rm';
}

function compareWorkouts(a: Workout, b: Workout): number {
  if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function candidateValue(set: WorkoutSet, metric: Metric, type: ExerciseType): number | undefined {
  switch (metric) {
    case 'weight':
      return set.weightKg !== undefined && set.weightKg > 0 ? set.weightKg : undefined;
    case 'e1rm':
      return setE1rm(set, type);
    case 'reps':
      return set.reps;
    case 'duration':
      return set.durationSec;
    case 'volume':
      return undefined;
  }
}

function pickSet(
  sets: readonly WorkoutSet[],
  metric: Metric,
  type: ExerciseType,
): { set: WorkoutSet; value: number } | undefined {
  let best: { set: WorkoutSet; value: number } | undefined;
  for (const s of sets) {
    const v = candidateValue(s, metric, type);
    if (v === undefined) continue;
    const r = round4(v);
    if (best === undefined || r > best.value) {
      best = { set: s, value: r };
    } else if (
      metric === 'reps' &&
      r === best.value &&
      (s.weightKg ?? 0) > (best.set.weightKg ?? 0)
    ) {
      best = { set: s, value: r };
    }
  }
  return best;
}

export function exerciseSeries(
  exerciseId: string,
  workouts: readonly Workout[],
  metric: Metric,
  exerciseType: ExerciseType,
): Point[] {
  if (!metricsFor(exerciseType).includes(metric)) return [];
  const points: Point[] = [];
  const completed = workouts.filter((w) => w.status === 'completed').sort(compareWorkouts);
  for (const w of completed) {
    const blocks = w.exercises
      .filter((we) => we.exerciseId === exerciseId)
      .sort((a, b) => a.order - b.order);
    if (blocks.length === 0) continue;
    const sets: WorkoutSet[] = [];
    for (const we of blocks) {
      const ordered = [...we.sets].sort((a, b) => a.order - b.order);
      for (const s of ordered) {
        if (isWorkingSet(s, exerciseType)) sets.push(s);
      }
    }
    if (sets.length === 0) continue;

    if (metric === 'volume') {
      let total = 0;
      for (const s of sets) {
        total += exerciseType === 'bodyweight_reps' ? (s.reps ?? 0) : setVolume(s, exerciseType);
      }
      total = round4(total);
      if (total > 0) {
        points.push({ t: w.startedAt, value: total, workoutId: w.id, setCount: sets.length });
      }
      continue;
    }
    const win = pickSet(sets, metric, exerciseType);
    if (win === undefined) continue;
    points.push({
      t: w.startedAt,
      value: win.value,
      workoutId: w.id,
      set: win.set,
      setCount: sets.length,
    });
  }
  return points;
}

export function downsample<T extends { t: number; value: number }>(
  points: readonly T[],
  max = 500,
): readonly T[] {
  if (max < 4) throw new RangeError('downsample max must be at least 4');
  const n = points.length;
  if (n <= max) return points;
  const keep = new Set<number>([0, n - 1]);
  const interior = n - 2;
  const buckets = Math.floor((max - 2) / 2);
  for (let b = 0; b < buckets; b += 1) {
    const from = 1 + Math.floor((b * interior) / buckets);
    const to = 1 + Math.floor(((b + 1) * interior) / buckets);
    if (from >= to) continue;
    let minI = from;
    let maxI = from;
    for (let i = from + 1; i < to; i += 1) {
      const v = (points[i] as T).value;
      if (v < (points[minI] as T).value) minI = i;
      if (v > (points[maxI] as T).value) maxI = i;
    }
    keep.add(minI);
    keep.add(maxI);
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i] as T);
}
