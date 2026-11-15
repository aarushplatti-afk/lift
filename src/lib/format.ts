import type { ValueKind } from './calc/series';
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

export function formatShortDate(ms: number, now: number): string {
  const d = new Date(ms);
  const text = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.getFullYear() === new Date(now).getFullYear() ? text : `${text}, ${d.getFullYear()}`;
}

export function formatRelativeDay(at: number, now: number): string {
  const days = Math.max(0, dayNumber(now) - dayNumber(at));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 35) {
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  return formatShortDate(at, now);
}

export function formatLastUsed(at: number | undefined, now: number): string {
  if (at === undefined) return 'Never used';
  const text = formatRelativeDay(at, now);
  return `Used ${text === 'Today' || text === 'Yesterday' ? text.toLowerCase() : text}`;
}

export function formatWorkoutDate(ms: number, now?: number): string {
  const d = new Date(ms);
  const text = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return now !== undefined && d.getFullYear() !== new Date(now).getFullYear()
    ? `${text}, ${d.getFullYear()}`
    : text;
}

export function formatWorkoutDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

export function formatVolume(kg: number, unit: Unit): string {
  return `${Math.round(toDisplay(kg, unit)).toLocaleString('en-US')} ${unit}`;
}

export function formatSetDetail(set: WorkoutSet, type: ExerciseType, unit: Unit): string {
  if (type === 'duration') return formatDurationInput(set.durationSec ?? 0);
  if (type === 'bodyweight_reps') return `${set.reps ?? 0} reps`;
  const prefix = type === 'weighted_bodyweight' ? '+' : '';
  return `${prefix}${formatWeight(set.weightKg ?? 0, unit, { withUnit: true })} × ${set.reps ?? 0}`;
}

export function formatMetricValue(value: number, kind: ValueKind, unit: Unit): string {
  switch (kind) {
    case 'kg':
      return formatWeight(value, unit, { withUnit: true });
    case 'count':
      return `${value} reps`;
    case 'seconds':
      return formatDurationInput(value);
  }
}

const MINUS = '−';

function signed(n: number, text: string): string {
  if (n > 0) return `+${text}`;
  if (n < 0) return `${MINUS}${text}`;
  return text;
}

export function formatChange(
  first: number,
  last: number,
  kind: ValueKind,
  unit: Unit,
  options: { grouped?: boolean } = {},
): { abs: string; pct: string } {
  const a = kind === 'kg' ? toDisplay(first, unit) : first;
  const b = kind === 'kg' ? toDisplay(last, unit) : last;
  const grouped = kind === 'kg' && options.grouped === true;
  const diff = grouped ? Math.round(b - a) : Math.round((b - a) * 10) / 10;
  const mag = Math.abs(diff);
  let body: string;
  if (grouped) body = `${mag.toLocaleString('en-US')} ${unit}`;
  else if (kind === 'kg') body = `${String(mag)} ${unit}`;
  else if (kind === 'count') body = `${String(mag)} reps`;
  else body = formatDurationInput(mag);
  const abs = signed(diff, body);
  if (a === 0) return { abs, pct: '—' };
  const raw = ((b - a) / Math.abs(a)) * 100;
  const pctMag = Math.round(Math.abs(raw));
  return { abs, pct: signed(pctMag === 0 ? 0 : Math.sign(raw), `${pctMag}%`) };
}
