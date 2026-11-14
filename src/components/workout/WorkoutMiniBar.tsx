import { useNavigate } from 'react-router-dom';
import { useNow } from '../../hooks/useNow';
import { elapsedMs } from '../../lib/calc/duration';
import { formatDurationInput } from '../../lib/duration';
import { formatElapsed } from '../../lib/format';
import { useActiveWorkoutStore } from '../../store/activeWorkout';
import { remainingMs, useRestTimerStore } from '../../store/restTimer';

export function WorkoutMiniBar() {
  const navigate = useNavigate();
  const startedAt = useActiveWorkoutStore((s) => s.workout?.startedAt);
  const phase = useRestTimerStore((s) => s.phase);
  const endsAt = useRestTimerStore((s) => s.endsAt);
  const durationSec = useRestTimerStore((s) => s.durationSec);
  const now = useNow();
  if (startedAt === undefined) return null;
  return (
    <button
      type="button"
      onClick={() => {
        navigate('/workout/active');
      }}
      className="pl-safe pr-safe fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 flex h-12 items-center justify-center gap-2 border-t border-border bg-accent text-body-sm font-semibold text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
    >
      <span>Workout in progress</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{formatElapsed(elapsedMs(startedAt, now))}</span>
      {phase === 'running' && (
        <>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            Rest {formatDurationInput(Math.ceil(remainingMs({ endsAt, durationSec }, now) / 1000))}
          </span>
        </>
      )}
      {phase === 'done' && (
        <>
          <span aria-hidden="true">·</span>
          <span>Rest complete</span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span>Resume</span>
    </button>
  );
}
