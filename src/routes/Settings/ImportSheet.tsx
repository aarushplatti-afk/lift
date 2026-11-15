import { useState } from 'react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import type { BackupSummary } from '../../lib/backup';

interface ImportSheetProps {
  summary: BackupSummary | null;
  offline: boolean;
  busy: boolean;
  onReplace: () => void;
  onClose: () => void;
}

const EXPORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function describe(s: BackupSummary): string {
  const custom = s.customExercises > 0 ? ` (${String(s.customExercises)} custom)` : '';
  return [
    plural(s.workouts, 'workout', 'workouts'),
    `${plural(s.exercises, 'exercise', 'exercises')}${custom}`,
    plural(s.templates, 'template', 'templates'),
    plural(s.bodyweight, 'weigh-in', 'weigh-ins'),
    'settings',
  ].join(' · ');
}

export function ImportSheet({ summary, offline, busy, onReplace, onClose }: ImportSheetProps) {
  const [confirming, setConfirming] = useState(false);
  const exported = summary ? new Date(summary.exportedAt) : null;

  const close = () => {
    if (busy) return;
    setConfirming(false);
    onClose();
  };

  return (
    <>
      <BottomSheet
        open={summary !== null && !confirming}
        title="Import backup"
        onClose={close}
        footer={
          <div className="flex flex-col gap-2 pb-3">
            <Button
              variant="danger"
              fullWidth
              disabled={offline || busy}
              onClick={() => {
                setConfirming(true);
              }}
            >
              Replace all data
            </Button>
            {offline && (
              <p className="text-center text-body-sm text-secondary">
                Connect to the internet to import.
              </p>
            )}
            <Button variant="secondary" fullWidth disabled={busy} onClick={close}>
              Cancel
            </Button>
          </div>
        }
      >
        {summary && (
          <div className="flex flex-col gap-2">
            <p className="text-body tabular-nums">{describe(summary)}</p>
            {exported && !Number.isNaN(exported.getTime()) && (
              <p className="text-body-sm text-secondary tabular-nums">
                Exported {EXPORT_DATE.format(exported)}
              </p>
            )}
            {summary.fromOtherAccount && (
              <p className="text-body-sm font-medium text-warning">From a different account</p>
            )}
          </div>
        )}
      </BottomSheet>
      <Dialog open={summary !== null && confirming} title="Replace all data?" onClose={close}>
        <p className="mb-4 text-body">
          Everything in this account is replaced by the backup, on all your devices.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" fullWidth disabled={offline || busy} onClick={onReplace}>
            {busy ? 'Working…' : 'Replace all data'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
