const MAX_SECONDS = 86399;

export function parseDurationInput(raw: string): number | undefined {
  const s = raw.trim();
  if (s === '') return undefined;
  let total: number;
  if (/^\d+$/.test(s)) {
    const secPart = Number(s.slice(-2));
    const minPart = s.length > 2 ? Number(s.slice(0, -2)) : 0;
    total = minPart * 60 + secPart;
  } else {
    const m = /^(?:(\d+):)?(\d+):(\d{1,2})$/.exec(s);
    if (!m) return undefined;
    const hasHours = m[1] !== undefined;
    const a = Number(m[2]);
    const sec = Number(m[3]);
    if (sec > 59) return undefined;
    if (hasHours) {
      if (a > 59) return undefined;
      total = Number(m[1]) * 3600 + a * 60 + sec;
    } else {
      total = a * 60 + sec;
    }
  }
  return Number.isFinite(total) && total <= MAX_SECONDS ? total : undefined;
}

export function formatDurationInput(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
