export const REST_MIN_SEC = 15;
export const REST_MAX_SEC = 600;
export const REST_STEP_SEC = 15;
const REST_FALLBACK_SEC = 90;

export function clampRestSeconds(sec: number): number {
  if (!Number.isFinite(sec)) return REST_FALLBACK_SEC;
  const stepped = Math.round(sec / REST_STEP_SEC) * REST_STEP_SEC;
  return Math.min(REST_MAX_SEC, Math.max(REST_MIN_SEC, stepped));
}
