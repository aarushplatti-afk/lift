import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '../../../components/ui/toastStore';
import { useAuthStore } from '../../../store/auth';
import { DataSection } from '../DataSection';

const ops = vi.hoisted(() => ({
  exportBackup: vi.fn(),
  exportCsv: vi.fn(),
  importReplace: vi.fn(),
  deleteAllData: vi.fn(),
}));
const saveTextFile = vi.hoisted(() => vi.fn());
const parseBackup = vi.hoisted(() => vi.fn());

vi.mock('../../../sync/dataOps', () => ({ getDataOps: () => ops }));
vi.mock('../../../lib/platform/download', () => ({ saveTextFile }));
vi.mock('../../../lib/backup', () => ({
  parseBackup,
  backupFileName: () => 'lift-backup-2026-11-15.json',
  summarizeBackup: (_b: unknown, owner: string) => ({
    exercises: 98,
    customExercises: 3,
    workouts: 12,
    templates: 2,
    bodyweight: 40,
    exportedAt: '2026-11-15T12:00:00.000Z',
    fromOtherAccount: owner !== 'u1',
  }),
}));
vi.mock('../../../lib/csv', () => ({ csvFileName: () => 'lift-workouts-2026-11-15.csv' }));

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

function toastMessage(): string | undefined {
  return useToastStore.getState().toast?.message;
}

function backupFile(): File {
  const file = new File(['{}'], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve('{}') });
  return file;
}

beforeEach(() => {
  Object.values(ops).forEach((m) => m.mockReset());
  saveTextFile.mockReset().mockResolvedValue('downloaded');
  parseBackup.mockReset();
  setOnline(true);
  useToastStore.setState({ toast: null });
  useAuthStore.setState({ identity: { userId: 'u1', email: 'a@b.c' } });
});

afterEach(() => {
  setOnline(true);
});

describe('DataSection', () => {
  it('exports a backup file and toasts', async () => {
    ops.exportBackup.mockResolvedValue({ backup: { format: 'lift-backup' }, synced: true });
    render(<DataSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => {
      expect(saveTextFile).toHaveBeenCalledWith(
        'lift-backup-2026-11-15.json',
        'application/json',
        expect.stringContaining('lift-backup'),
      );
    });
    await waitFor(() => {
      expect(toastMessage()).toBe('Backup exported');
    });
  });

  it('does not toast when the share sheet is cancelled', async () => {
    ops.exportBackup.mockResolvedValue({ backup: {}, synced: true });
    saveTextFile.mockResolvedValue('cancelled');
    render(<DataSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => {
      expect(saveTextFile).toHaveBeenCalled();
    });
    expect(toastMessage()).toBeUndefined();
  });

  it('shows Working… and disables the section while exporting', async () => {
    let resolve: (v: { backup: object; synced: boolean }) => void = () => undefined;
    ops.exportBackup.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<DataSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    expect(await screen.findByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export workouts as CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete all data' })).toBeDisabled();
    resolve({ backup: {}, synced: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
    });
  });

  it('exports CSV', async () => {
    ops.exportCsv.mockResolvedValue('a,b');
    render(<DataSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Export workouts as CSV' }));
    await waitFor(() => {
      expect(saveTextFile).toHaveBeenCalledWith('lift-workouts-2026-11-15.csv', 'text/csv', 'a,b');
    });
  });

  it('shows an inline error for an invalid file', async () => {
    parseBackup.mockReturnValue({
      ok: false,
      error: 'Not a Lift backup.',
      issues: ['format: bad'],
    });
    render(<DataSection />);
    await userEvent.upload(screen.getByLabelText('Backup file'), backupFile());
    expect(await screen.findByRole('alert')).toHaveTextContent('Not a Lift backup. format: bad');
    expect(ops.importReplace).not.toHaveBeenCalled();
  });

  it('shows the summary, then a confirm dialog, then imports', async () => {
    parseBackup.mockReturnValue({ ok: true, backup: { userId: 'u2' } });
    ops.importReplace.mockResolvedValue({ ok: true, counts: {}, failed: 0, pending: 0 });
    useAuthStore.setState({ identity: { userId: 'u3', email: 'c@d.e' } });
    render(<DataSection />);
    await userEvent.upload(screen.getByLabelText('Backup file'), backupFile());
    expect(
      await screen.findByText(
        '12 workouts · 98 exercises (3 custom) · 2 templates · 40 weigh-ins · settings',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Exported Nov 15, 2026')).toBeInTheDocument();
    expect(screen.getByText('From a different account')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace all data' }));
    expect(screen.getByText(/replaced by the backup, on all your devices/)).toBeInTheDocument();
    expect(ops.importReplace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Replace all data' }));
    await waitFor(() => {
      expect(toastMessage()).toBe('Backup imported');
    });
    expect(ops.importReplace).toHaveBeenCalledTimes(1);
  });

  it('reports changes that could not sync after an import', async () => {
    parseBackup.mockReturnValue({ ok: true, backup: { userId: 'u1' } });
    ops.importReplace.mockResolvedValue({ ok: true, counts: {}, failed: 2, pending: 0 });
    render(<DataSection />);
    await userEvent.upload(screen.getByLabelText('Backup file'), backupFile());
    await userEvent.click(await screen.findByRole('button', { name: 'Replace all data' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace all data' }));
    await waitFor(() => {
      expect(toastMessage()).toBe("Imported. 2 changes couldn't sync yet. See Account & Sync.");
    });
  });

  it('shows the op message when the import is rejected', async () => {
    parseBackup.mockReturnValue({ ok: true, backup: { userId: 'u1' } });
    ops.importReplace.mockResolvedValue({
      ok: false,
      error: 'active_workout',
      message: 'Finish or discard your current workout first.',
    });
    render(<DataSection />);
    await userEvent.upload(screen.getByLabelText('Backup file'), backupFile());
    await userEvent.click(await screen.findByRole('button', { name: 'Replace all data' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace all data' }));
    await waitFor(() => {
      expect(toastMessage()).toBe('Finish or discard your current workout first.');
    });
  });

  it('disables import and delete offline with captions', () => {
    setOnline(false);
    render(<DataSection />);
    expect(screen.getByRole('button', { name: 'Import data' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete all data' })).toBeDisabled();
    expect(screen.getByText('Connect to the internet to import.')).toBeInTheDocument();
    expect(screen.getByText('Connect to the internet to delete data.')).toBeInTheDocument();
  });

  it('requires a typed, case-sensitive DELETE', async () => {
    ops.deleteAllData.mockResolvedValue({ ok: true, failed: 0 });
    render(<DataSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    expect(screen.getByText(/Built-in exercises come back/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const confirm = screen.getByRole('button', { name: 'Delete everything' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    expect(confirm).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Type DELETE to confirm'));
    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => {
      expect(toastMessage()).toBe('All data deleted');
    });
    expect(ops.deleteAllData).toHaveBeenCalledWith('DELETE');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the error message when delete fails', async () => {
    ops.deleteAllData.mockResolvedValue({
      ok: false,
      error: 'server_error',
      message: "Couldn't delete everything. Check your connection and try again.",
    });
    render(<DataSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    await waitFor(() => {
      expect(toastMessage()).toMatch(/Couldn't delete everything/);
    });
  });
});
