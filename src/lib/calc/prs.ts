import type { ExerciseType, Workout, WorkoutSet } from '../../types/domain';
import { setE1rm } from './e1rm';
import { canCompleteSet } from './validation';
import type { ExerciseTypes } from './volume';

type Category = 'weight' | 'e1rm' | 'reps' | 'duration';

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

function categoriesFor(type: ExerciseType): readonly Category[] {
  switch (type) {
    case 'weight_reps':
    case 'weighted_bodyweight':
      return ['weight', 'e1rm'];
    case 'bodyweight_reps':
      return ['reps'];
    case 'duration':
      return ['duration'];
  }
}

function isEligible(set: WorkoutSet, type: ExerciseType): boolean {
  return set.completed && set.type !== 'warmup' && canCompleteSet(set, type).ok;
}

function valueOf(set: WorkoutSet, type: ExerciseType, cat: Category): number | undefined {
  switch (cat) {
    case 'weight': {
      const w = set.weightKg;
      return w !== undefined && w > 0 ? w : undefined;
    }
    case 'e1rm':
      return setE1rm(set, type);
    case 'reps':
      return set.reps;
    case 'duration':
      return set.durationSec;
  }
}

function compareChronology(a: Workout, b: Workout): number {
  if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function bestKey(exerciseId: string, cat: Category): string {
  return `${exerciseId}|${cat}`;
}

interface Candidate {
  setId: string;
  value: number;
}

function winnersFor(
  workout: Workout,
  exerciseIds: ReadonlySet<string>,
  types: ExerciseTypes,
): Map<string, Candidate> {
  const winners = new Map<string, Candidate>();
  const blocks = [...workout.exercises].sort((a, b) => a.order - b.order);
  for (const we of blocks) {
    if (!exerciseIds.has(we.exerciseId)) continue;
    const type = types.get(we.exerciseId);
    if (type === undefined) continue;
    const sets = [...we.sets].sort((a, b) => a.order - b.order);
    for (const s of sets) {
      if (!isEligible(s, type)) continue;
      for (const cat of categoriesFor(type)) {
        const v = valueOf(s, type, cat);
        if (v === undefined) continue;
        const r = round4(v);
        const k = bestKey(we.exerciseId, cat);
        const cur = winners.get(k);
        if (cur === undefined || r > cur.value) winners.set(k, { setId: s.id, value: r });
      }
    }
  }
  return winners;
}

function applyFlags(
  workout: Workout,
  exerciseIds: ReadonlySet<string>,
  flagged: ReadonlySet<string>,
): Workout | undefined {
  let changed = false;
  const exercises = workout.exercises.map((we) => {
    if (!exerciseIds.has(we.exerciseId)) return we;
    return {
      ...we,
      sets: we.sets.map((s) => {
        const want = flagged.has(s.id);
        if (Boolean(s.isPR) !== want) changed = true;
        const next: WorkoutSet = { ...s };
        delete next.isPR;
        if (want) next.isPR = true;
        return next;
      }),
    };
  });
  return changed ? { ...workout, exercises } : undefined;
}

export function recomputePRsForExercises(
  exerciseIds: ReadonlySet<string>,
  workouts: readonly Workout[],
  types: ExerciseTypes,
): Map<string, Workout> {
  const result = new Map<string, Workout>();
  const completed = workouts.filter((w) => w.status === 'completed').sort(compareChronology);
  const best = new Map<string, number>();

  let i = 0;
  while (i < completed.length) {
    let j = i;
    const startedAt = completed[i]?.startedAt;
    while (j < completed.length && completed[j]?.startedAt === startedAt) j += 1;
    const group = completed.slice(i, j);
    i = j;

    const groupMax = new Map<string, number>();
    for (const workout of group) {
      const winners = winnersFor(workout, exerciseIds, types);
      const flagged = new Set<string>();
      for (const [k, w] of winners) {
        const prior = best.get(k);
        if (prior !== undefined && w.value > prior) flagged.add(w.setId);
        const gm = groupMax.get(k);
        if (gm === undefined || w.value > gm) groupMax.set(k, w.value);
      }
      const next = applyFlags(workout, exerciseIds, flagged);
      if (next) result.set(workout.id, next);
    }
    for (const [k, v] of groupMax) {
      const cur = best.get(k);
      if (cur === undefined || v > cur) best.set(k, v);
    }
  }
  return result;
}
