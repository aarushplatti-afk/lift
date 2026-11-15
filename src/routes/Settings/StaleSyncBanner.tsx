import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../components/ui/Button';
import { useBackupExport } from '../../hooks/useBackupExport';
import { useNow } from '../../hooks/useNow';
import { isOutboxStale } from '../../lib/syncStatus';
import { useSyncStatus } from '../../store/sync';

export function StaleSyncBanner() {
  const { oldestPendingAt } = useSyncStatus();
  const now = useNow(60_000);
  const { exporting, exportBackup } = useBackupExport();
  if (oldestPendingAt === undefined || !isOutboxStale(oldestPendingAt, now)) return null;
  return (
    <div
      role="status"
      aria-label="Changes have not synced for over 24 hours"
      className="flex flex-col gap-2 rounded-control border border-warning bg-surface-2 p-3"
    >
      <p className="text-body-sm">
        <span aria-hidden="true">⚠ </span>
        Some changes haven't synced for {formatDistanceToNow(oldestPendingAt)}. Stay online with the
        app open, or export a backup.
      </p>
      <Button
        variant="secondary"
        fullWidth
        disabled={exporting}
        onClick={() => {
          void exportBackup();
        }}
      >
        {exporting ? 'Working…' : 'Export backup'}
      </Button>
    </div>
  );
}
