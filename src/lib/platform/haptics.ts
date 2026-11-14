export const HAPTIC_TAP = 10;
export const HAPTIC_REST_DONE: readonly number[] = [200, 100, 200];

export function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrate(pattern: number | readonly number[]): void {
  if (!isVibrationSupported()) return;
  try {
    navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    return;
  }
}
