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
});
