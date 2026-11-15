import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { signOut } from '../../sync/auth';
import { useAuthStore } from '../../store/auth';
import { useSyncStatus, useSyncStore } from '../../store/sync';
import type { SyncStatus } from '../../types/sync';
import { FailedChangesList } from './FailedChangesList';
import { Row, Section } from './Section';
import { StaleSyncBanner } from './StaleSyncBanner';

const STATUS_TEXT: Record<SyncStatus['state'], string> = {
  synced: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: 'Sync error',
};

interface Blocked {
  pendingCount: number;
  failedCount: number;
}

export function AccountSyncSection() {
  const status = useSyncStatus();
  const syncNow = useSyncStore((s) => s.syncNow);
  const identity = useAuthStore((s) => s.identity);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const result = await signOut({ discardUnsynced: false });
      if (!result.ok) {
        setBlocked({ pendingCount: result.pendingCount, failedCount: result.failedCount });
      }
    } finally {
      setSigningOut(false);
    }
  };

  const handleForceSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut({ discardUnsynced: true });
      setBlocked(null);
    } finally {
      setSigningOut(false);
    }
  };

  const syncDisabled = status.state === 'syncing' || status.state === 'offline';
  const pending = blocked?.pendingCount ?? 0;

  return (
    <>
      <Section title="Account & Sync">
        <StaleSyncBanner />
        <Row label="Signed in as" value={identity?.email ?? '—'} />
        <Row label="Status" value={STATUS_TEXT[status.state]} />
        {status.lastError && status.state === 'error' && (
          <p role="alert" className="text-body-sm text-danger">
            {status.lastError}
          </p>
        )}
        <Row label="Pending changes" value={status.pendingCount} />
        {status.failedCount > 0 && <Row label="Failed changes" value={status.failedCount} />}
        <FailedChangesList />
        <Row
          label="Last synced"
          value={
            status.lastSyncedAt === undefined
              ? 'Never'
              : `${formatDistanceToNow(status.lastSyncedAt)} ago`
          }
        />
        <Button
          variant="secondary"
          fullWidth
          disabled={syncDisabled}
          onClick={() => {
            void syncNow();
          }}
        >
          Sync now
        </Button>
        <Button
          variant="secondary"
          fullWidth
          disabled={signingOut}
          onClick={() => {
            void handleSignOut();
          }}
        >
          Sign out
        </Button>
      </Section>

      <Dialog
        open={blocked !== null}
        title="Unsynced changes"
        onClose={() => {
          setBlocked(null);
        }}
      >
        <p className="mb-4 text-body">
          You have {pending} unsynced {pending === 1 ? 'change' : 'changes'}
          {blocked !== null && blocked.failedCount > 0
            ? `, including ${String(blocked.failedCount)} rejected`
            : ''}
          . Signing out will discard them.
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            fullWidth
            disabled={signingOut}
            onClick={() => {
              setBlocked(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={signingOut}
            onClick={() => {
              void handleForceSignOut();
            }}
          >
            Sign out anyway
          </Button>
        </div>
      </Dialog>
    </>
  );
}
