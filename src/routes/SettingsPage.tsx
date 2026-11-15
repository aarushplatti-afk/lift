import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { Header } from '../components/ui/Header';
import { IconButton } from '../components/ui/IconButton';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Stepper } from '../components/ui/Stepper';
import { Toggle } from '../components/ui/Toggle';
import { useToastStore } from '../components/ui/toastStore';
import { GoalWeightField } from './Settings/GoalWeightField';
import { REST_MAX_SEC, REST_MIN_SEC, REST_STEP_SEC } from '../lib/calc/rest';
import { formatDurationInput } from '../lib/duration';
import { formatWeight } from '../lib/format';
import { isVibrationSupported } from '../lib/platform/haptics';
import { isWakeLockSupported } from '../lib/platform/wakeLock';
import { APP_VERSION } from '../lib/version';
import { signOut } from '../sync/auth';
import { useAuthStore } from '../store/auth';
import { useSettingsStore } from '../store/settings';
import { useSyncStatus, useSyncStore } from '../store/sync';
import type { ThemePref, Unit } from '../types/domain';
import type { SyncStatus } from '../types/sync';

const UNIT_OPTIONS: readonly { value: Unit; label: string }[] = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
];

const THEME_OPTIONS: readonly { value: ThemePref; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const STATUS_TEXT: Record<SyncStatus['state'], string> = {
  synced: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: 'Sync error',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="px-1 text-caption font-semibold uppercase text-secondary">{title}</h2>
      <Card className="flex flex-col gap-4">{children}</Card>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-body">
      <span className="text-secondary">{label}</span>
      <span className="min-w-0 break-words text-right tabular-nums">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const status = useSyncStatus();
  const syncNow = useSyncStore((s) => s.syncNow);
  const identity = useAuthStore((s) => s.identity);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);

  const [signingOut, setSigningOut] = useState(false);

  const saveSetting = (patch: Parameters<typeof update>[0]) => {
    update(patch).catch(() => {
      useToastStore.getState().show({ message: "Couldn't save setting" });
    });
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const result = await signOut({ discardUnsynced: false });
      if (!result.ok) setBlockedCount(result.pendingCount);
    } finally {
      setSigningOut(false);
    }
  };

  const handleForceSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut({ discardUnsynced: true });
      setBlockedCount(null);
    } finally {
      setSigningOut(false);
    }
  };

  const syncDisabled = status.state === 'syncing' || status.state === 'offline';

  return (
    <>
      <Header
        title="Settings"
        left={
          <IconButton
            aria-label="Back"
            onClick={() => {
              navigate(-1);
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
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </IconButton>
        }
      />
      <div className="pl-safe pr-safe pb-safe flex flex-col gap-6 p-4">
        <Section title="Units">
          <SegmentedControl
            label="Weight unit"
            options={UNIT_OPTIONS}
            value={settings.unit}
            onChange={(unit) => {
              saveSetting({ unit });
            }}
          />
          <p className="text-body-sm text-secondary tabular-nums">
            Example: 100 kg = {formatWeight(100, settings.unit, { withUnit: true })}
          </p>
        </Section>

        <Section title="Appearance">
          <SegmentedControl
            label="Theme"
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(theme) => {
              saveSetting({ theme });
            }}
          />
        </Section>

        <Section title="Workout">
          <Stepper
            label="Default rest time"
            value={settings.defaultRestSeconds}
            min={REST_MIN_SEC}
            max={REST_MAX_SEC}
            step={REST_STEP_SEC}
            format={formatDurationInput}
            onChange={(defaultRestSeconds) => {
              saveSetting({ defaultRestSeconds });
            }}
          />
          <Toggle
            label="Auto-start rest timer"
            checked={settings.restTimerAutoStart}
            onChange={(restTimerAutoStart) => {
              saveSetting({ restTimerAutoStart });
            }}
          />
          <Toggle
            label="Sound"
            description="Chime when rest ends. Muted by the silent switch on iPhone."
            checked={settings.soundEnabled}
            onChange={(soundEnabled) => {
              saveSetting({ soundEnabled });
            }}
          />
          {isVibrationSupported() && (
            <Toggle
              label="Haptics"
              checked={settings.hapticsEnabled}
              onChange={(hapticsEnabled) => {
                saveSetting({ hapticsEnabled });
              }}
            />
          )}
          <Toggle
            label="Keep screen awake"
            description={
              isWakeLockSupported()
                ? 'While the workout screen is open.'
                : 'Not supported in this browser.'
            }
            disabled={!isWakeLockSupported()}
            checked={settings.keepScreenAwakeDuringWorkout}
            onChange={(keepScreenAwakeDuringWorkout) => {
              saveSetting({ keepScreenAwakeDuringWorkout });
            }}
          />
        </Section>

        <Section title="Bodyweight">
          <GoalWeightField
            goalKg={settings.bodyweightGoalKg}
            unit={settings.unit}
            onSave={(bodyweightGoalKg) => {
              saveSetting({ bodyweightGoalKg });
            }}
          />
        </Section>

        <Section title="Account & Sync">
          <Row label="Signed in as" value={identity?.email ?? '—'} />
          <Row label="Status" value={STATUS_TEXT[status.state]} />
          {status.lastError && status.state === 'error' && (
            <p role="alert" className="text-body-sm text-danger">
              {status.lastError}
            </p>
          )}
          <Row label="Pending changes" value={status.pendingCount} />
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

        <Section title="About">
          <Row label="App" value="Lift" />
          <Row label="Version" value={APP_VERSION} />
        </Section>
      </div>

      <Dialog
        open={blockedCount !== null}
        title="Unsynced changes"
        onClose={() => {
          setBlockedCount(null);
        }}
      >
        <p className="mb-4 text-body">
          You have {blockedCount} unsynced {blockedCount === 1 ? 'change' : 'changes'}. Signing out
          will discard them.
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            fullWidth
            disabled={signingOut}
            onClick={() => {
              setBlockedCount(null);
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
