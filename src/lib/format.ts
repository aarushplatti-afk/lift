import type { ExerciseType, Unit, WorkoutSet } from '../types/domain';
import { formatDurationInput } from './duration';
import { toDisplay } from './units';

export function formatWeight(
  kg: number | undefined,
  unit: Unit,
  opts?: { withUnit?: boolean },
): string {
  if (kg === undefined) return '—';
  const text = toDisplay(kg, unit).toFixed(1).replace(/\.0$/, '');
  return opts?.withUnit ? `${text} ${unit}` : text;
}

export function formatPreviousSet(
  set: WorkoutSet | undefined,
  type: ExerciseType,
  unit: Unit,
): string {
  if (!set) return '—';
  const reps = set.reps === undefined ? '—' : String(set.reps);
  switch (type) {
    case 'weight_reps':
      return `${formatWeight(set.weightKg, unit)} × ${reps}`;
    case 'bodyweight_reps':
      return `BW × ${reps}`;
    case 'weighted_bodyweight':
      return set.weightKg !== undefined && set.weightKg > 0
        ? `+${formatWeight(set.weightKg, unit)} × ${reps}`
        : `BW × ${reps}`;
    case 'duration':
      return set.durationSec === undefined ? '—' : formatDurationInput(set.durationSec);
  }
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

export function formatDurationShort(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60000);
  if (totalMin < 1) return '<1m';
  if (totalMin < 60) return `${totalMin}m`;
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

function dayNumber(ms: number): number {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function formatLastUsed(at: number | undefined, now: number): string {
  if (at === undefined) return 'Never used';
  const days = Math.max(0, dayNumber(now) - dayNumber(at));
  if (days === 0) return 'Used today';
  if (days === 1) return 'Used yesterday';
  if (days < 7) return `Used ${days} days ago`;
  if (days < 35) {
    const weeks = Math.floor(days / 7);
    return `Used ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  const date = new Date(at);
  const text = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return date.getFullYear() === new Date(now).getFullYear()
    ? `Used ${text}`
    : `Used ${text}, ${date.getFullYear()}`;
}
