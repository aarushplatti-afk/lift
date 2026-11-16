import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SyncIndicator } from '../../components/SyncIndicator';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Header } from '../../components/ui/Header';
import { IconButton } from '../../components/ui/IconButton';
import { useToastStore } from '../../components/ui/toastStore';
import { ensureBackupTracking } from '../../db/repos/meta';
import { discardWorkout, observeOtherInProgress } from '../../db/repos/workouts';
import { useNow } from '../../hooks/useNow';
import { elapsedMs } from '../../lib/calc/duration';
import { formatElapsed } from '../../lib/format';
import { useActiveWorkoutStore } from '../../store/activeWorkout';
import type { Workout } from '../../types/domain';
import { BackupNudgeCard } from './BackupNudgeCard';
import { TemplateList } from './Templates/TemplateList';

function ActiveWorkoutBanner({ startedAt }: { startedAt: number }) {
  const navigate = useNavigate();
  const now = useNow();
  return (
    <button
      type="button"
      onClick={() => {
        navigate('/workout/active');
      }}
      className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-card bg-accent px-4 text-body font-semibold text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span>Workout in progress</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{formatElapsed(elapsedMs(startedAt, now))}</span>
      <span aria-hidden="true">·</span>
      <span>Resume</span>
    </button>
  );
}

function useOtherInProgress(): Workout[] {
  const [rows, setRows] = useState<Workout[]>([]);
  useEffect(() => {
    const sub = observeOtherInProgress().subscribe({ next: setRows, error: () => undefined });
    return () => {
      sub.unsubscribe();
    };
  }, []);
  return rows;
}

function startedLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function RemoteWorkoutRow({ workout, onDiscard }: { workout: Workout; onDiscard: () => void }) {
  return (
    <div className="flex min-h-[56px] items-center gap-3 rounded-card border border-border bg-surface px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium">In progress on another device</p>
        <p className="truncate text-body-sm text-secondary">
          {`${workout.name} · started ${startedLabel(workout.startedAt)}`}
        </p>
      </div>
      <Button variant="secondary" aria-label={`Discard ${workout.name}`} onClick={onDiscard}>
        Discard
      </Button>
    </div>
  );
}

export function WorkoutHome() {
  const navigate = useNavigate();
  const status = useActiveWorkoutStore((s) => s.status);
  const workout = useActiveWorkoutStore((s) => s.workout);
  const start = useActiveWorkoutStore((s) => s.start);
  const others = useOtherInProgress();
  const [starting, setStarting] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState<Workout | null>(null);

  useEffect(() => {
    ensureBackupTracking(Date.now()).catch(() => undefined);
  }, []);

  const handleStart = async () => {
    setStarting(true);
    try {
      await start();
      navigate('/workout/active');
    } catch {
      useToastStore.getState().show({ message: 'Couldn’t start the workout. Try again.' });
    } finally {
      setStarting(false);
    }
  };

  const confirmDiscard = async () => {
    const target = pendingDiscard;
    setPendingDiscard(null);
    if (!target) return;
    try {
      await discardWorkout(target.id);
    } catch {
      useToastStore.getState().show({ message: 'Couldn’t discard the workout. Try again.' });
    }
  };

  return (
    <>
      <Header
        title="Workout"
        right={
          <div className="flex items-center">
            <SyncIndicator />
            <IconButton
              aria-label="Settings"
              onClick={() => {
                navigate('/settings');
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
              </svg>
            </IconButton>
          </div>
        }
      />
      <main className="flex flex-col gap-3 px-4 py-4">
        {workout ? (
          <ActiveWorkoutBanner startedAt={workout.startedAt} />
        ) : (
          <Button
            size="lg"
            fullWidth
            disabled={starting || status === 'loading'}
            onClick={() => {
              void handleStart();
            }}
          >
            Start Empty Workout
          </Button>
        )}
        {others.map((w) => (
          <RemoteWorkoutRow
            key={w.id}
            workout={w}
            onDiscard={() => {
              setPendingDiscard(w);
            }}
          />
        ))}
        <BackupNudgeCard />
        <TemplateList />
      </main>
      <Dialog
        open={pendingDiscard !== null}
        title="Discard this workout?"
        onClose={() => {
          setPendingDiscard(null);
        }}
      >
        <p className="mb-4 text-body-sm text-secondary">
          {
            "It will be deleted on all your devices. If it's still open on the other device, it will come back the next time that device saves."
          }
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              void confirmDiscard();
            }}
          >
            Discard workout
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setPendingDiscard(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </Dialog>
    </>
  );
}
