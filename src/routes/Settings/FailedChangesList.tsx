import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToastStore } from '../../components/ui/toastStore';
import { useFailedChanges } from '../../hooks/useFailedChanges';
import { useOnline } from '../../hooks/useOnline';
import { isLocalDateString, parseLocalDate } from '../../lib/dates';
import { useSyncStore } from '../../store/sync';
import type { FailedChange } from '../../db/repos/outbox';
import type { SyncTable } from '../../types/sync';

const KIND: Record<SyncTable, string> = {
  workouts: 'Workout',
  templates: 'Template',
  exercises: 'Exercise',
  bodyweight_entries: 'Weigh-in',
  user_settings: 'Settings',
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function formatDate(date: number | string): string {
  if (typeof date === 'string' && !isLocalDateString(date)) return '';
  const ms = typeof date === 'number' ? date : parseLocalDate(date);
  return Number.isNaN(ms) ? '' : DATE_FORMAT.format(ms);
}

function labelOf(c: FailedChange): string {
  const parts = [KIND[c.table]];
  if (c.recordName) parts.push(c.recordName);
  if (c.recordDate !== undefined) {
    const d = formatDate(c.recordDate);
    if (d) parts.push(d);
  }
  return parts.join(' · ');
}

export function FailedChangesList() {
  const changes = useFailedChanges();
  const online = useOnline();
  const retryFailed = useSyncStore((s) => s.retryFailed);
  const discardFailed = useSyncStore((s) => s.discardFailed);
  const discardAllFailed = useSyncStore((s) => s.discardAllFailed);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'one' | 'all' | null>(null);
  const [target, setTarget] = useState<FailedChange | null>(null);

  if (changes.length === 0) return null;

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true);
    try {
      const ok = await fn();
      if (ok === false) {
        useToastStore.getState().show({ message: "Couldn't discard. Try again when online." });
      }
    } finally {
      setBusy(false);
      setConfirm(null);
      setTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3" aria-label="Failed changes">
        {changes.map((c) => (
          <li
            key={`${c.table}:${c.recordId}`}
            className="flex flex-col gap-2 rounded-control border border-border p-3"
          >
            <p className="text-body font-medium break-words">{labelOf(c)}</p>
            <p className="text-body-sm text-danger break-words">
              <span aria-hidden="true">✕ </span>
              {c.lastError}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                disabled={busy}
                aria-label={`Retry ${labelOf(c)}`}
                onClick={() => {
                  void run(() => retryFailed(c.table, c.recordId));
                }}
              >
                Retry
              </Button>
              <Button
                variant="secondary"
                fullWidth
                disabled={busy || !online}
                aria-label={`Discard ${labelOf(c)}`}
                onClick={() => {
                  setTarget(c);
                  setConfirm('one');
                }}
              >
                Discard
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {!online && (
        <p className="text-body-sm text-secondary">Connect to the internet to discard changes.</p>
      )}
      {changes.length > 1 && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            onClick={() => {
              void run(() => retryFailed());
            }}
          >
            Retry all
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={busy || !online}
            onClick={() => {
              setConfirm('all');
            }}
          >
            Discard all
          </Button>
        </div>
      )}
      <Dialog
        open={confirm !== null}
        title="Discard changes?"
        onClose={() => {
          if (busy) return;
          setConfirm(null);
          setTarget(null);
        }}
      >
        <p className="mb-4 text-body">
          {confirm === 'all' ? 'Discard all rejected changes?' : 'Discard this change?'} The version
          on the server will be kept.
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            onClick={() => {
              setConfirm(null);
              setTarget(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={busy}
            onClick={() => {
              if (confirm === 'all') {
                void run(() => discardAllFailed());
              } else if (target !== null) {
                void run(() => discardFailed(target.table, target.recordId));
              }
            }}
          >
            {busy ? 'Working…' : 'Discard'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
