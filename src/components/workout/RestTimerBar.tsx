import { useEffect, useState } from 'react';
import { useNow } from '../../hooks/useNow';
import { formatDurationInput } from '../../lib/duration';
import { remainingMs, useRestTimerStore } from '../../store/restTimer';

const BAR_BTN =
  'inline-flex min-h-tap min-w-tap items-center justify-center rounded-control border border-border bg-surface-2 px-3 text-body-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

export function RestTimerBar() {
  const phase = useRestTimerStore((s) => s.phase);
  const durationSec = useRestTimerStore((s) => s.durationSec);
  const [announcement, setAnnouncement] = useState('');
  const [seenPhase, setSeenPhase] = useState(phase);

  if (phase !== seenPhase) {
    setSeenPhase(phase);
    if (phase === 'done') setAnnouncement('Rest complete');
    else if (phase === 'running') {
      setAnnouncement(`Rest started, ${formatDurationInput(durationSec)}`);
    } else setAnnouncement('');
  }

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {phase === 'idle' ? null : <RestTimerPanel phase={phase} />}
    </>
  );
}

function RestTimerPanel({ phase }: { phase: 'running' | 'done' }) {
  const endsAt = useRestTimerStore((s) => s.endsAt);
  const durationSec = useRestTimerStore((s) => s.durationSec);
  const adjust = useRestTimerStore((s) => s.adjust);
  const skip = useRestTimerStore((s) => s.skip);
  const now = useNow(250);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setEntered(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  const remainingSec = Math.ceil(remainingMs({ endsAt, durationSec }, now) / 1000);
  const fraction = durationSec > 0 ? Math.min(1, Math.max(0, remainingSec / durationSec)) : 0;

  return (
    <div
      data-testid="rest-timer-bar"
      className={`pl-safe pr-safe pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface shadow-lg motion-safe:transition-transform motion-safe:duration-200 ${
        entered ? 'translate-y-0' : 'motion-safe:translate-y-full'
      }`}
    >
      <div className="flex h-16 items-center gap-2 px-4">
        {phase === 'done' ? (
          <span className="flex-1 text-body font-semibold text-primary">Rest complete</span>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-body-sm text-secondary">Rest</span>
                <span className="text-title-sm font-semibold tabular-nums text-primary">
                  {formatDurationInput(remainingSec)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Rest remaining"
                aria-valuemin={0}
                aria-valuemax={durationSec}
                aria-valuenow={remainingSec}
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className="h-full bg-accent"
                  style={{ width: `${String(Math.round(fraction * 100))}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              aria-label="Subtract 15 seconds"
              className={BAR_BTN}
              onClick={() => {
                adjust(-15);
              }}
            >
              −15s
            </button>
            <button
              type="button"
              aria-label="Add 15 seconds"
              className={BAR_BTN}
              onClick={() => {
                adjust(15);
              }}
            >
              +15s
            </button>
            <button type="button" aria-label="Skip rest" className={BAR_BTN} onClick={skip}>
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
