import type { SetType, Workout, WorkoutSet } from '../../types/domain';

export type SetGroup = 'warmup' | 'working';

export function setGroup(t: SetType): SetGroup {
  return t === 'warmup' ? 'warmup' : 'working';
}

export function groupOrdinals(sets: readonly WorkoutSet[]): number[] {
  const counts: Record<SetGroup, number> = { warmup: 0, working: 0 };
  return sets.map((s) => {
    const g = setGroup(s.type);
    const n = counts[g];
    counts[g] = n + 1;
    return n;
  });
}

export function setBadgeLabels(sets: readonly WorkoutSet[]): string[] {
  let normal = 0;
  return sets.map((s) => {
    switch (s.type) {
      case 'warmup':
        return 'W';
      case 'drop':
        return 'D';
      case 'failure':
        return 'F';
      case 'normal':
        normal += 1;
        return String(normal);
    }
  });
}

export function pickPreviousWorkout(
  exerciseId: string,
  beforeStartedAt: number,
  workouts: readonly Workout[],
): Workout | undefined {
  let best: Workout | undefined;
  for (const w of workouts) {
    if (w.status !== 'completed' || w.startedAt >= beforeStartedAt) continue;
    if (!w.exercises.some((we) => we.exerciseId === exerciseId)) continue;
    if (
      best === undefined ||
      w.startedAt > best.startedAt ||
      (w.startedAt === best.startedAt && w.id > best.id)
    ) {
      best = w;
    }
  }
  return best;
}

export function previousSetFor(
  exerciseId: string,
  ordinal: number,
  setType: SetType,
  previous: Workout | undefined,
): WorkoutSet | undefined {
  if (!previous) return undefined;
  const group = setGroup(setType);
  const matches = previous.exercises
    .filter((we) => we.exerciseId === exerciseId)
    .sort((a, b) => a.order - b.order)
    .flatMap((we) => [...we.sets].sort((a, b) => a.order - b.order))
    .filter((s) => s.completed && setGroup(s.type) === group);
  return matches[ordinal];
}
