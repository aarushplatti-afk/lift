import type { Unit } from '../types/domain';
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
