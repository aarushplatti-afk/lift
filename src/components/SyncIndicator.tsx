import { useNavigate } from 'react-router-dom';
import { useSyncStatus } from '../store/sync';
import type { SyncStatus } from '../types/sync';

const LABELS: Record<SyncStatus['state'], string> = {
  synced: 'Synced',
  syncing: 'Syncing',
  offline: 'Offline',
  error: 'Sync error',
};

const DOT: Record<SyncStatus['state'], string> = {
  synced: 'bg-success',
  syncing: 'bg-accent animate-pulse',
  offline: 'bg-secondary',
  error: 'bg-danger',
};

export function SyncIndicator() {
  const navigate = useNavigate();
  const { state, pendingCount } = useSyncStatus();
  const label = LABELS[state];
  const aria =
    pendingCount > 0
      ? `Sync status: ${label}, ${pendingCount} pending changes`
      : `Sync status: ${label}`;
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={() => {
        navigate('/settings');
      }}
      className="inline-flex min-h-tap min-w-tap items-center justify-center gap-1.5 rounded-control px-2 text-caption text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${DOT[state]}`} />
      <span aria-hidden="true">{label}</span>
      {pendingCount > 0 && (
        <span
          aria-hidden="true"
          className="rounded-full bg-surface-2 px-1.5 tabular-nums text-primary"
        >
          {pendingCount}
        </span>
      )}
    </button>
  );
}
