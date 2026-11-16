import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useToastStore } from './components/ui/toastStore';
import { useAuthStore } from './store/auth';

const redirect = vi.hoisted(() => ({
  slot: null as null | { kind: string; tokens?: { accessToken: string; refreshToken: string } },
}));

vi.mock('./lib/authRedirect', () => ({
  getAuthRedirect: () => redirect.slot,
  clearAuthRedirect: () => {
    redirect.slot = null;
  },
}));
vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({ auth: {} }),
}));
vi.mock('./sync/engine', () => ({
  getSyncEngine: () => ({
    syncNow: vi.fn(),
    subscribe: () => () => undefined,
    getStatus: () => ({ state: 'synced', pendingCount: 0, failedCount: 0 }),
  }),
}));
vi.mock('./sync/triggers', () => ({ startSyncTriggers: () => () => undefined }));
vi.mock('./sync/auth', () => ({
  PASSWORD_MIN_LENGTH: 8,
  signUp: vi.fn(),
  signIn: vi.fn(),
  requestPasswordReset: vi.fn(),
  beginPasswordReset: vi.fn(() => Promise.resolve({ ok: true, email: 'me@x.co' })),
  completePasswordReset: vi.fn(),
  getCachedSession: vi.fn(() => new Promise(() => undefined)),
  onAuthChange: () => () => undefined,
}));

beforeEach(() => {
  window.location.hash = '#/';
  useToastStore.setState({ toast: null });
  useAuthStore.setState({
    status: 'signedOut',
    initialPullDone: false,
    init: () => () => undefined,
  });
});

describe('App auth redirects', () => {
  it('shows the reset screen for a recovery redirect and clears the slot', async () => {
    redirect.slot = { kind: 'recovery', tokens: { accessToken: 'a', refreshToken: 'r' } };
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    expect(redirect.slot).toBeNull();
  });

  it('toasts an error redirect once under StrictMode, then clears', () => {
    redirect.slot = { kind: 'error' };
    const show = vi.spyOn(useToastStore.getState(), 'show');
    useToastStore.setState({ show });
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0]?.[0].message).toMatch(/invalid or has expired/);
    expect(redirect.slot).toBeNull();
  });

  it('toasts signup confirmation', () => {
    redirect.slot = { kind: 'signup_confirmed' };
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Email confirmed. Sign in to continue.');
  });
});
