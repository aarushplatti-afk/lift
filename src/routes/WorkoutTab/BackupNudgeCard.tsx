import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useToastStore } from '../../components/ui/toastStore';
import {
  dismissBackupNudge,
  observeBackupNudgeMeta,
  type BackupNudgeMeta,
} from '../../db/repos/meta';
import { observeOnboardingCounts } from '../../db/repos/onboarding';
import { useBackupExport } from '../../hooks/useBackupExport';
import { shouldNudgeBackup } from '../../lib/backupNudge';
import { useActiveWorkoutStore } from '../../store/activeWorkout';

export function BackupNudgeCard() {
  const workoutActive = useActiveWorkoutStore((s) => s.workout !== null);
  const { exporting, exportBackup } = useBackupExport();
  const [meta, setMeta] = useState<BackupNudgeMeta | null>(null);
  const [workouts, setWorkouts] = useState(0);
  const [now] = useState(() => Date.now());
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const metaSub = observeBackupNudgeMeta().subscribe({ next: setMeta, error: () => undefined });
    const countSub = observeOnboardingCounts().subscribe({
      next: (c) => {
        setWorkouts(c.workouts);
      },
      error: () => undefined,
    });
    return () => {
      metaSub.unsubscribe();
      countSub.unsubscribe();
    };
  }, []);

  if (hidden || meta === null) return null;
  const show = shouldNudgeBackup({
    now,
    lastBackupAt: meta.lastBackupAt,
    dismissedAt: meta.dismissedAt,
    trackingSince: meta.trackingSince,
    workouts,
    workoutActive,
  });
  if (!show) return null;

  const handleExport = async () => {
    await exportBackup();
    setHidden(true);
  };

  const handleDismiss = () => {
    setHidden(true);
    dismissBackupNudge(Date.now()).catch(() => {
      useToastStore.getState().show({ message: 'Couldn’t save. Try again.' });
    });
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <section aria-label="Backup reminder" className="flex flex-col gap-3">
        <p className="text-body">It’s been 30 days since your last backup.</p>
        <div className="flex gap-2">
          <Button
            disabled={exporting}
            onClick={() => {
              void handleExport();
            }}
          >
            Export backup
          </Button>
          <Button variant="secondary" onClick={handleDismiss}>
            Not now
          </Button>
        </div>
      </section>
    </Card>
  );
}
