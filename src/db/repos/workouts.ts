import { liveQuery, type Observable } from 'dexie';
import { db } from '../schema';
import { enqueue } from './outbox';
import { requireUserId } from './meta';
import { markTemplateUsed } from './templates';
import { newId } from '../../lib/ids';
import { defaultWorkoutName, type WorkoutInit } from '../../lib/workoutOps';
import { prepareFinish } from '../../lib/calc/finish';
import { computePRFlags } from '../../lib/calc/prs';
import type { ExerciseTypes } from '../../lib/calc/volume';
import type { Workout } from '../../types/domain';

export type FinishOutcome = { status: 'finished'; workout: Workout } | { status: 'empty' };

async function readActiveId(): Promise<string | undefined> {
  const row = await db.meta.get('activeWorkoutId');
  return row?.key === 'activeWorkoutId' ? row.value : undefined;
}

async function readActive(): Promise<Workout | undefined> {
  const id = await readActiveId();
  if (id === undefined) return undefined;
  const row = await db.workouts.get(id);
  return row?.status === 'in_progress' ? row : undefined;
}

export async function getActiveWorkout(): Promise<Workout | undefined> {
  const active = await readActive();
  if (active) return active;
  if ((await readActiveId()) === undefined) return undefined;
  return db.transaction('rw', [db.workouts, db.meta], async () => {
    const again = await readActive();
    if (!again) await db.meta.delete('activeWorkoutId');
    return again;
  });
}

export async function startWorkout(init: WorkoutInit = {}): Promise<Workout> {
  const userId = await requireUserId();
  return db.transaction('rw', [db.workouts, db.meta, db.templates, db.syncQueue], async () => {
    const existing = await readActive();
    if (existing) return existing;
    const now = Date.now();
    const workout: Workout = {
      id: newId(),
      userId,
      name: init.name ?? defaultWorkoutName(now),
      startedAt: now,
      status: 'in_progress',
      exercises: init.exercises ?? [],
      createdAt: now,
      updatedAt: now,
    };
    if (init.templateId !== undefined) workout.templateId = init.templateId;
    await db.workouts.put(workout);
    await db.meta.put({ key: 'activeWorkoutId', value: workout.id });
    if (init.templateId !== undefined) await markTemplateUsed(init.templateId, now);
    return workout;
  });
}

export function observeActiveWorkoutId(): Observable<string | undefined> {
  return liveQuery(readActiveId);
}

export function observeOtherInProgress(): Observable<Workout[]> {
  return liveQuery(async () => {
    const activeId = await readActiveId();
    const rows = await db.workouts.where('status').equals('in_progress').toArray();
    return rows.filter((w) => w.id !== activeId).sort((a, b) => b.startedAt - a.startedAt);
  });
}

export async function saveActiveWorkout(w: Workout): Promise<boolean> {
  return db.transaction('rw', [db.workouts, db.meta], async () => {
    if ((await readActiveId()) !== w.id) return false;
    const row = await db.workouts.get(w.id);
    if (row?.status !== 'in_progress') return false;
    await db.workouts.put({ ...w, updatedAt: Date.now() });
    return true;
  });
}

export async function enqueueActiveWorkout(id: string): Promise<void> {
  await db.transaction('rw', [db.workouts, db.syncQueue, db.meta], async () => {
    if ((await readActiveId()) !== id) return;
    const row = await db.workouts.get(id);
    if (row?.status !== 'in_progress') return;
    await enqueue('workouts', id, 'upsert', row);
  });
}

export async function finishWorkout(
  w: Workout,
  opts: { markIncomplete: boolean },
): Promise<FinishOutcome> {
  return db.transaction(
    'rw',
    [db.workouts, db.syncQueue, db.meta, db.exercises],
    async (): Promise<FinishOutcome> => {
      const exercises = await db.exercises.toArray();
      const types: ExerciseTypes = new Map(exercises.map((e) => [e.id, e.type]));
      const prior = await db.workouts.where('status').equals('completed').toArray();
      const now = Date.now();
      const plan = prepareFinish(w, types, { markIncomplete: opts.markIncomplete, now });
      if (plan.isEmpty) return { status: 'empty' };
      const flagged = computePRFlags(plan.cleaned, prior, types);
      const workout: Workout = {
        ...flagged,
        status: 'completed',
        endedAt: Math.max(now, w.startedAt),
        updatedAt: now,
      };
      await db.workouts.put(workout);
      await enqueue('workouts', workout.id, 'upsert', workout);
      if ((await readActiveId()) === workout.id) await db.meta.delete('activeWorkoutId');
      return { status: 'finished', workout };
    },
  );
}

export async function discardWorkout(id: string): Promise<void> {
  await db.transaction('rw', [db.workouts, db.syncQueue, db.meta], async () => {
    await db.workouts.delete(id);
    await enqueue('workouts', id, 'delete');
    if ((await readActiveId()) === id) await db.meta.delete('activeWorkoutId');
  });
}

export async function listCompletedWorkouts(): Promise<Workout[]> {
  const rows = await db.workouts.where('status').equals('completed').toArray();
  return rows.sort((a, b) => b.startedAt - a.startedAt);
}

export async function getLastCompletedWithExercises(
  exerciseIds: readonly string[],
  beforeStartedAt: number,
): Promise<Map<string, Workout>> {
  const found = new Map<string, Workout>();
  const wanted = new Set(exerciseIds);
  if (wanted.size === 0) return found;
  await db.workouts
    .where('startedAt')
    .below(beforeStartedAt)
    .reverse()
    .until(() => found.size >= wanted.size)
    .each((w) => {
      if (w.status !== 'completed') return;
      for (const we of w.exercises) {
        if (wanted.has(we.exerciseId) && !found.has(we.exerciseId)) found.set(we.exerciseId, w);
      }
    });
  return found;
}

export function getWorkout(id: string): Promise<Workout | undefined> {
  return db.workouts.get(id);
}
