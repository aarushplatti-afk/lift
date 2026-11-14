import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../db/repos/settings';
import { useToastStore } from '../../components/ui/toastStore';
import { useSettingsStore } from '../../store/settings';
import { useSyncStore } from '../../store/sync';
import { SettingsPage } from '../SettingsPage';

const signOut = vi.hoisted(() => vi.fn());
vi.mock('../../sync/auth', () => ({ signOut }));

const update = vi.fn().mockResolvedValue(undefined);

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  signOut.mockReset();
  update.mockClear();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'lb' }, update });
  useSyncStore.setState({ status: { state: 'synced', pendingCount: 0, failedCount: 0 } });
});

describe('SettingsPage', () => {
  it('re-renders the formatted sample when the unit changes', async () => {
    renderPage();
    expect(screen.getByText(/Example: 100 kg = 220\.5 lb/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'kg' }));
    expect(update).toHaveBeenCalledWith({ unit: 'kg' });
    act(() => {
      useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, unit: 'kg' } });
    });
    expect(screen.getByText(/Example: 100 kg = 100 kg/)).toBeInTheDocument();
  });

  it('calls update with the chosen theme', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(update).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('confirms before discarding unsynced changes on sign out', async () => {
    signOut.mockResolvedValueOnce({ ok: false, reason: 'unsynced', pendingCount: 3 });
    signOut.mockResolvedValueOnce({ ok: true });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenNthCalledWith(1, { discardUnsynced: false });
    expect(await screen.findByText(/You have 3 unsynced changes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out anyway' }));
    expect(signOut).toHaveBeenNthCalledWith(2, { discardUnsynced: true });
  });

  it('shows an error toast when saving a setting fails', async () => {
    update.mockRejectedValueOnce(new Error('quota'));
    useToastStore.setState({ toast: null });
    renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    await waitFor(() => {
      expect(useToastStore.getState().toast?.message).toBe("Couldn't save setting");
    });
  });

  it('uses the singular for one unsynced change', async () => {
    signOut.mockResolvedValueOnce({ ok: false, reason: 'unsynced', pendingCount: 1 });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/You have 1 unsynced change\./)).toBeInTheDocument();
  });

  it('ignores a second sign-out tap while one is in flight', async () => {
    let resolve: (value: { ok: true }) => void = () => undefined;
    signOut.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderPage();
    const button = screen.getByRole('button', { name: 'Sign out' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(signOut).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true });
      await Promise.resolve();
    });
    expect(button).toBeEnabled();
  });

  describe('Workout section', () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'vibrate');
      Reflect.deleteProperty(navigator, 'wakeLock');
    });

    it('steps the default rest time by 15 seconds', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Increase Default rest time' }));
      expect(update).toHaveBeenCalledWith({ defaultRestSeconds: 105 });
      await userEvent.click(screen.getByRole('button', { name: 'Decrease Default rest time' }));
      expect(update).toHaveBeenCalledWith({ defaultRestSeconds: 75 });
    });

    it('sends the right patch for auto-start and sound', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('switch', { name: /Auto-start rest timer/ }));
      expect(update).toHaveBeenCalledWith({ restTimerAutoStart: false });
      await userEvent.click(screen.getByRole('switch', { name: /Sound/ }));
      expect(update).toHaveBeenCalledWith({ soundEnabled: false });
    });

    it('hides Haptics when vibration is unsupported', () => {
      renderPage();
      expect(screen.queryByRole('switch', { name: /Haptics/ })).toBeNull();
    });

    it('shows Haptics when supported and sends its patch', async () => {
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn() });
      renderPage();
      await userEvent.click(screen.getByRole('switch', { name: /Haptics/ }));
      expect(update).toHaveBeenCalledWith({ hapticsEnabled: false });
    });

    it('disables Keep screen awake with a caption when unsupported', () => {
      renderPage();
      const toggle = screen.getByRole('switch', { name: /Keep screen awake/ });
      expect(toggle).toBeDisabled();
      expect(screen.getByText('Not supported in this browser.')).toBeInTheDocument();
    });

    it('sends the Keep screen awake patch when supported', async () => {
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {} });
      renderPage();
      await userEvent.click(screen.getByRole('switch', { name: /Keep screen awake/ }));
      expect(update).toHaveBeenCalledWith({ keepScreenAwakeDuringWorkout: false });
    });
  });

  it('disables Sync now while offline', () => {
    useSyncStore.setState({ status: { state: 'offline', pendingCount: 2, failedCount: 0 } });
    renderPage();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });
});
