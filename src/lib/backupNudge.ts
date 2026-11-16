export const BACKUP_NUDGE_INTERVAL_MS = 30 * 86_400_000;

export function shouldNudgeBackup(i: {
  now: number;
  lastBackupAt?: number;
  dismissedAt?: number;
  trackingSince?: number;
  workouts: number;
  workoutActive: boolean;
}): boolean {
  if (i.workouts < 1 || i.workoutActive) return false;
  const stamps = [i.lastBackupAt, i.dismissedAt, i.trackingSince].filter(
    (v): v is number => v !== undefined,
  );
  if (stamps.length === 0) return false;
  return i.now - Math.max(...stamps) >= BACKUP_NUDGE_INTERVAL_MS;
}
