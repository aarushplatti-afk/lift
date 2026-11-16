import { describe, expect, it } from 'vitest';
import { BACKUP_NUDGE_INTERVAL_MS as D, shouldNudgeBackup } from '../backupNudge';

const T = 1_000_000_000_000;
const base = { now: T, workouts: 1, workoutActive: false, trackingSince: T - D };

describe('shouldNudgeBackup', () => {
  it('is false without workouts or during an active workout', () => {
    expect(shouldNudgeBackup({ ...base, workouts: 0 })).toBe(false);
    expect(shouldNudgeBackup({ ...base, workoutActive: true })).toBe(false);
  });
  it('is false with no timestamps at all', () => {
    expect(shouldNudgeBackup({ now: T, workouts: 1, workoutActive: false })).toBe(false);
  });
  it('triggers at exactly 30 days and not 1 ms before', () => {
    expect(shouldNudgeBackup(base)).toBe(true);
    expect(shouldNudgeBackup({ ...base, trackingSince: T - D + 1 })).toBe(false);
  });
  it('uses the latest of the three timestamps', () => {
    expect(shouldNudgeBackup({ ...base, lastBackupAt: T - 1000 })).toBe(false);
    expect(shouldNudgeBackup({ ...base, dismissedAt: T - 1000 })).toBe(false);
    expect(shouldNudgeBackup({ ...base, trackingSince: T - 2 * D, lastBackupAt: T - D })).toBe(
      true,
    );
  });
  it('snoozes for 30 days after Not now', () => {
    const dismissedAt = T;
    expect(shouldNudgeBackup({ ...base, dismissedAt, now: T + D - 1 })).toBe(false);
    expect(shouldNudgeBackup({ ...base, dismissedAt, now: T + D })).toBe(true);
  });
});
