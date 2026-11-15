const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86400000;

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

interface DateParts {
  y: number;
  m: number;
  d: number;
}

export function todayLocal(now: number = Date.now()): string {
  const d = new Date(now);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

function parts(s: string): DateParts | undefined {
  const match = DATE_RE.exec(s);
  if (!match) return undefined;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1900 || m < 1 || m > 12 || d < 1) return undefined;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return undefined;
  }
  return { y, m, d };
}

export function isLocalDateString(s: string): boolean {
  return parts(s) !== undefined;
}

function requireParts(date: string): DateParts {
  const p = parts(date);
  if (!p) throw new RangeError(`Invalid local date: ${date}`);
  return p;
}

export function parseLocalDate(date: string): number {
  const { y, m, d } = requireParts(date);
  return new Date(y, m - 1, d).getTime();
}

export function daysBetween(from: string, to: string): number {
  const a = requireParts(from);
  const b = requireParts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / MS_PER_DAY);
}
