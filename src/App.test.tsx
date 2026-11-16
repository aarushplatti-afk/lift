import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { DEFAULT_SETTINGS } from './db/repos/settings';
import { wipeLocalData } from './db/repos/meta';
import { db } from './db/schema';
import { useAuthStore } from './store/auth';
import { useSettingsStore } from './store/settings';
import { useSyncStore } from './store/sync';

const syncNow = vi.fn(() => Promise.resolve());

vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ auth: {} }),
}));
vi.mock('./sync/engine', () => ({
  getSyncEngine: () => ({
    syncNow,
    subscribe: () => () => undefined,
    getStatus: () => ({ state: 'synced', pendingCount: 0, failedCount: 0 }),
  }),
}));
vi.mock('./sync/triggers', () => ({ startSyncTriggers: () => () => undefined }));
vi.mock('./sync/auth', () => ({
  PASSWORD_MIN_LENGTH: 8,
  signUp: vi.fn(() => Promise.resolve({ ok: true, needsConfirmation: false })),
  signIn: vi.fn(() => Promise.resolve({ ok: true })),
  requestPasswordReset: vi.fn(() => Promise.resolve({ ok: true })),
  getCachedSession: vi.fn(() => new Promise(() => undefined)),
  onAuthChange: () => () => undefined,
}));

function setAuth(status: 'loading' | 'signedOut' | 'signedIn', initialPullDone: boolean): void {
  useAuthStore.setState({
    status,
    initialPullDone,
    init: () => () => undefined,
  });
}

beforeEach(() => {
  window.location.hash = '#/';
  syncNow.mockClear();
  useSyncStore.setState({
    syncNow: () => syncNow(),
    status: { state: 'synced', pendingCount: 0, failedCount: 0 },
  });
});

describe('App theme', () => {
  it('does not write the theme mirror until settings are hydrated', () => {
    localStorage.removeItem('lift.theme');
    setAuth('signedIn', true);
    useSettingsStore.setState({ hydrated: false });
    render(<App />);
    expect(localStorage.getItem('lift.theme')).toBeNull();
    act(() => {
      useSettingsStore.setState({
        hydrated: true,
        settings: { ...DEFAULT_SETTINGS, theme: 'light' },
      });
    });
    expect(localStorage.getItem('lift.theme')).toBe('light');
  });
});

describe('App gate', () => {
  it('renders the sign-in screen when signed out', () => {
    setAuth('signedOut', false);
    render(<App />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('renders the setup screen with Retry when signed in but not pulled', async () => {
    setAuth('signedIn', false);
    render(<App />);
    expect(screen.getByRole('heading', { name: /Setting up/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(syncNow).toHaveBeenCalled();
  });

  it('shows the sync error on the setup screen', () => {
    setAuth('signedIn', false);
    render(<App />);
    act(() => {
      useSyncStore.setState({
        status: {
          state: 'error',
          pendingCount: 0,
          failedCount: 0,
          lastError: 'relation "public.exercises" does not exist',
        },
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/exercises" does not exist/);
  });

  it('shows the tab bar and opens settings without it', async () => {
    setAuth('signedIn', true);
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(
      await screen.findByRole('heading', { name: 'Settings', level: 1 }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('shows the mini-bar on other tabs while a workout is active and hides tabs on workout screens', async () => {
    await wipeLocalData();
    setAuth('signedIn', true);
    await db.workouts.put({
      id: 'w1',
      userId: 'u1',
      name: 'Test',
      startedAt: Date.now(),
      status: 'in_progress',
      exercises: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.meta.put({ key: 'activeWorkoutId', value: 'w1' });
    window.location.hash = '#/history';
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Workout in progress/ }));
    expect(await screen.findByLabelText('Workout name')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });
});
