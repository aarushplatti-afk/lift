import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAuthStore } from './store/auth';
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
  signIn: vi.fn(() => Promise.resolve({ ok: true })),
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
  useSyncStore.setState({ syncNow: () => syncNow() });
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

  it('shows the tab bar and opens settings without it', async () => {
    setAuth('signedIn', true);
    render(<App />);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });
});
