import { useNavigate } from 'react-router-dom';
import { useNow } from '../../hooks/useNow';
import { elapsedMs } from '../../lib/calc/duration';
import { formatElapsed } from '../../lib/format';
import { useActiveWorkoutStore } from '../../store/activeWorkout';

export function WorkoutMiniBar() {
  const navigate = useNavigate();
  const startedAt = useActiveWorkoutStore((s) => s.workout?.startedAt);
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
      <span aria-hidden="true">·</span>
      <span>Resume</span>
    </button>
  );
}
