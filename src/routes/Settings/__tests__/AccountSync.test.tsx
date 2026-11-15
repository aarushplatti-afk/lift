import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FailedChange } from '../../../db/repos/outbox';
import { useSyncStore } from '../../../store/sync';
import { AccountSyncSection } from '../AccountSyncSection';

const failedChanges = vi.hoisted(() => ({ current: [] as FailedChange[] }));
const exportBackup = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useFailedChanges', () => ({
  useFailedChanges: () => failedChanges.current,
}));
vi.mock('../../../hooks/useBackupExport', () => ({
  useBackupExport: () => ({ exporting: false, exportBackup }),
}));
vi.mock('../../../sync/auth', () => ({ signOut: vi.fn() }));

const retryFailed = vi.fn();
const discardFailed = vi.fn();
const discardAllFailed = vi.fn();

function change(over: Partial<FailedChange>): FailedChange {
  return {
    table: 'workouts',
    recordId: 'w1',
    op: 'upsert',
    entryIds: [1],
    attempts: 1,
    lastError: 'Not allowed by the server',
    firstCreatedAt: 0,
    recordName: 'Push Day',
    recordDate: new Date(2026, 10, 12, 9).getTime(),
    ...over,
  };
}

beforeEach(() => {
  failedChanges.current = [];
  retryFailed.mockReset().mockResolvedValue(undefined);
  discardFailed.mockReset().mockResolvedValue(true);
  discardAllFailed.mockReset().mockResolvedValue(true);
  exportBackup.mockReset();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  useSyncStore.setState({
    status: { state: 'synced', pendingCount: 0, failedCount: 0 },
    retryFailed,
    discardFailed,
    discardAllFailed,
  });
});

describe('Account & Sync', () => {
  it('shows no failed rows and no stale banner by default', () => {
    render(<AccountSyncSection />);
    expect(screen.queryByText('Failed changes')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Failed changes' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lists failed changes with label and error, and retries one', async () => {
    failedChanges.current = [change({})];
    useSyncStore.setState({ status: { state: 'error', pendingCount: 1, failedCount: 1 } });
    render(<AccountSyncSection />);
    expect(screen.getByText('Workout · Push Day · Thu, Nov 12')).toBeInTheDocument();
    expect(screen.getByText(/Not allowed by the server/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry all' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Retry Workout/ }));
    expect(retryFailed).toHaveBeenCalledWith('workouts', 'w1');
  });

  it('confirms before discarding one change', async () => {
    failedChanges.current = [change({})];
    render(<AccountSyncSection />);
    await userEvent.click(screen.getByRole('button', { name: /^Discard Workout/ }));
    expect(discardFailed).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Discard this change\? The version on the server will be kept\./),
    ).toBeInTheDocument();
    await userEvent.click(within_dialog('Discard'));
    await waitFor(() => {
      expect(discardFailed).toHaveBeenCalledWith('workouts', 'w1');
      expect(discardAllFailed).not.toHaveBeenCalled();
    });
  });

  it('offers Retry all and Discard all for several failures', async () => {
    failedChanges.current = [
      change({}),
      change({
        table: 'bodyweight_entries',
        recordId: 'b1',
        recordName: undefined,
        recordDate: '2026-11-10',
      }),
    ];
    render(<AccountSyncSection />);
    expect(screen.getByText('Weigh-in · Tue, Nov 10')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry all' }));
    expect(retryFailed).toHaveBeenCalledWith();
    await userEvent.click(screen.getByRole('button', { name: 'Discard all' }));
    await userEvent.click(within_dialog('Discard'));
    await waitFor(() => {
      expect(discardAllFailed).toHaveBeenCalledTimes(1);
    });
  });

  it('disables Discard offline with a caption', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    failedChanges.current = [change({})];
    render(<AccountSyncSection />);
    expect(screen.getByRole('button', { name: /^Discard Workout/ })).toBeDisabled();
    expect(screen.getByText('Connect to the internet to discard changes.')).toBeInTheDocument();
  });

  it('shows the failed count row only when there are failures', () => {
    useSyncStore.setState({ status: { state: 'error', pendingCount: 2, failedCount: 2 } });
    render(<AccountSyncSection />);
    expect(screen.getByText('Failed changes')).toBeInTheDocument();
  });

  it('shows the stale banner with an export button when stale', async () => {
    useSyncStore.setState({
      status: {
        state: 'offline',
        pendingCount: 1,
        failedCount: 0,
        oldestPendingAt: Date.now() - 3 * 86_400_000,
      },
    });
    render(<AccountSyncSection />);
    const banner = screen.getByRole('status', {
      name: 'Changes have not synced for over 24 hours',
    });
    expect(banner).toHaveTextContent(/haven't synced for 3 days/);
    await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(exportBackup).toHaveBeenCalledTimes(1);
  });

  it('hides the banner when the oldest entry is under 24 hours old', () => {
    useSyncStore.setState({
      status: {
        state: 'offline',
        pendingCount: 1,
        failedCount: 0,
        oldestPendingAt: Date.now() - 3_600_000,
      },
    });
    render(<AccountSyncSection />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

function within_dialog(name: string): HTMLElement {
  const dialog = screen.getByRole('dialog');
  const button = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === name);
  if (!button) throw new Error(`No ${name} button in dialog`);
  return button;
}
