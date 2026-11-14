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

export function computePRFlags(
  workout: Workout,
  priorWorkouts: readonly Workout[],
  types: ExerciseTypes,
): Workout {
  const best = new Map<string, number>();
  const key = (exerciseId: string, cat: Category): string => `${exerciseId}|${cat}`;

  for (const prior of priorWorkouts) {
    if (prior.status !== 'completed' || prior.id === workout.id) continue;
    if (!(prior.startedAt < workout.startedAt)) continue;
    for (const we of prior.exercises) {
      const type = types.get(we.exerciseId);
      if (type === undefined) continue;
      for (const s of we.sets) {
        if (!isEligible(s, type)) continue;
        for (const cat of categoriesFor(type)) {
          const v = valueOf(s, type, cat);
          if (v === undefined) continue;
          const k = key(we.exerciseId, cat);
          const r = round4(v);
          const cur = best.get(k);
          if (cur === undefined || r > cur) best.set(k, r);
        }
      }
    }
  }

  const winners = new Map<string, { id: string; value: number }>();
  const blocks = [...workout.exercises].sort((a, b) => a.order - b.order);
  for (const we of blocks) {
    const type = types.get(we.exerciseId);
    if (type === undefined) continue;
    const sets = [...we.sets].sort((a, b) => a.order - b.order);
    for (const s of sets) {
      if (!isEligible(s, type)) continue;
      for (const cat of categoriesFor(type)) {
        const v = valueOf(s, type, cat);
        if (v === undefined) continue;
        const r = round4(v);
        const k = key(we.exerciseId, cat);
        const cur = winners.get(k);
        if (cur === undefined || r > cur.value) winners.set(k, { id: s.id, value: r });
      }
    }
  }

  const flagged = new Set<string>();
  for (const [k, w] of winners) {
    const prior = best.get(k);
    if (prior !== undefined && w.value > prior) flagged.add(w.id);
  }

  return {
    ...workout,
    exercises: workout.exercises.map((we) => ({
      ...we,
      sets: we.sets.map((s) => {
        const next: WorkoutSet = { ...s };
        delete next.isPR;
        if (flagged.has(s.id)) next.isPR = true;
        return next;
      }),
    })),
  };
}
