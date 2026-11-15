import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useSyncStore } from '../../store/sync';
import type { SyncStatus } from '../../types/sync';
import { SyncIndicator } from '../SyncIndicator';

function renderWith(status: SyncStatus) {
  useSyncStore.setState({ status });
  render(
    <MemoryRouter>
      <SyncIndicator />
    </MemoryRouter>,
  );
}

describe('SyncIndicator', () => {
  it.each([
    ['synced', 'Sync status: Synced'],
    ['syncing', 'Sync status: Syncing'],
    ['offline', 'Sync status: Offline'],
    ['error', 'Sync status: Sync error'],
  ] as const)('labels %s', (state, label) => {
    renderWith({ state, pendingCount: 0, failedCount: 0 });
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('includes the pending count', () => {
    renderWith({ state: 'offline', pendingCount: 4, failedCount: 0 });
    expect(
      screen.getByRole('button', { name: 'Sync status: Offline, 4 pending changes' }),
    ).toBeInTheDocument();
  });

  it('shows Not synced with a warning dot when the outbox is stale', () => {
    renderWith({
      state: 'synced',
      pendingCount: 2,
      failedCount: 0,
      oldestPendingAt: Date.now() - 86_400_001,
    });
    const button = screen.getByRole('button', {
      name: 'Sync status: Not synced, 2 pending changes, changes unsynced for over 24 hours',
    });
    expect(button).toHaveTextContent('Not synced');
    expect(button.querySelector('.bg-warning')).not.toBeNull();
  });

  it('is not stale just under 24 hours', () => {
    renderWith({
      state: 'synced',
      pendingCount: 1,
      failedCount: 0,
      oldestPendingAt: Date.now() - 86_000_000,
    });
    expect(
      screen.getByRole('button', { name: 'Sync status: Synced, 1 pending changes' }),
    ).toBeInTheDocument();
  });
});
