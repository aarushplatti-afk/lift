import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { reportStorageError } from '../../lib/storageEvents';
import { QuotaDialog } from '../QuotaDialog';

const exportBackup = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useBackupExport', () => ({
  useBackupExport: () => ({ exporting: false, exportBackup }),
}));

describe('QuotaDialog', () => {
  it('is hidden until a quota error is reported, then offers Export and Close', async () => {
    render(<QuotaDialog />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      reportStorageError(new DOMException('full', 'QuotaExceededError'));
    });
    expect(screen.getByRole('dialog', { name: 'Storage is full' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(exportBackup).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores other errors', () => {
    render(<QuotaDialog />);
    act(() => {
      reportStorageError(new Error('boom'));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
