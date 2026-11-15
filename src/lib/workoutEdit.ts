import type { Workout } from '../types/domain';
import { normalizeName } from './exercises';

export type WorkoutEditError =
  | { field: 'name'; code: 'required' }
  | { field: 'startedAt'; code: 'invalid' | 'future' }
  | { field: 'duration'; code: 'invalid' };

export function validateWorkoutEdit(w: Workout, now: number): WorkoutEditError | undefined {
  if (normalizeName(w.name) === '') return { field: 'name', code: 'required' };
  if (!Number.isInteger(w.startedAt)) return { field: 'startedAt', code: 'invalid' };
  if (w.startedAt > now) return { field: 'startedAt', code: 'future' };
  if (w.endedAt === undefined || !Number.isFinite(w.endedAt) || w.endedAt < w.startedAt) {
    return { field: 'duration', code: 'invalid' };
  }
  return undefined;
}

function byOrder<T extends { order: number }>(list: readonly T[]): T[] {
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.order - b.item.order || a.index - b.index)
    .map((x) => x.item);
}

export function workoutEditKey(w: Workout): string {
  return JSON.stringify([
    w.name.trim(),
    w.notes ?? '',
    w.startedAt,
    w.endedAt ?? null,
    byOrder(w.exercises).map((we) => [
      we.exerciseId,
      we.notes ?? '',
      we.restSeconds ?? null,
      byOrder(we.sets).map((s) => [
        s.type,
        s.weightKg ?? null,
        s.reps ?? null,
        s.durationSec ?? null,
        s.completed,
      ]),
    ]),
  ]);
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getFullYear()).padStart(4, '0')}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function toTimeInputValue(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fromDateTimeInputs(date: string, time: string): number | undefined {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return undefined;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return undefined;
  const probe = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) {
    return undefined;
  }
  const ms = probe.getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

export function durationParts(
  startedAt: number,
  endedAt: number,
): { hours: number; minutes: number } {
  const totalMin = Math.floor(Math.max(0, endedAt - startedAt) / 60000);
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
}
