import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import * as meta from '../../db/repos/meta';
import { enqueue, runWrite } from '../../db/repos/outbox';

const auth = {
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
};
const syncNow = vi.fn(() => Promise.resolve());
const cancelRetry = vi.fn();

const recoveryAuth = {
  setSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
};

vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({ auth }),
  createRecoveryClient: () => ({ auth: recoveryAuth }),
}));
vi.mock('../engine', () => ({ getSyncEngine: () => ({ syncNow, cancelRetry }) }));

const {
  abandonPasswordReset,
  beginPasswordReset,
  completePasswordReset,
  getCachedSession,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
} = await import('../auth');

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  localStorage.clear();
  vi.clearAllMocks();
});

describe('getCachedSession', () => {
  it('returns the meta owner when getSession errors but a stored session exists', async () => {
    await meta.setOwner('u1', 'a@b.c');
    localStorage.setItem('lift-auth', '{}');
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new Error('offline') });
    expect(await getCachedSession()).toEqual({ userId: 'u1', email: 'a@b.c' });
  });

  it('returns the owner immediately when offline without calling getSession', async () => {
    await meta.setOwner('u1', 'a@b.c');
    localStorage.setItem('lift-auth', '{}');
    auth.getSession.mockReturnValue(new Promise(() => undefined));
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      expect(await getCachedSession()).toEqual({ userId: 'u1', email: 'a@b.c' });
      expect(auth.getSession).not.toHaveBeenCalled();
    } finally {
      online.mockRestore();
    }
  });

  it('falls back to the owner after a timeout when online but getSession hangs', async () => {
    await meta.setOwner('u1', 'a@b.c');
    localStorage.setItem('lift-auth', '{}');
    auth.getSession.mockReturnValue(new Promise(() => undefined));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = getCachedSession();
      await vi.advanceTimersByTimeAsync(2500);
      expect(await pending).toEqual({ userId: 'u1', email: 'a@b.c' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('adopts the session identity when the meta owner is missing', async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u9', email: 'z@b.c' } } },
      error: null,
    });
    expect(await getCachedSession()).toEqual({ userId: 'u9', email: 'z@b.c' });
    expect(await meta.getOwner()).toEqual({ userId: 'u9', email: 'z@b.c' });
  });

  it('returns null without a stored session', async () => {
    await meta.setOwner('u1', 'a@b.c');
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await getCachedSession()).toBeNull();
  });
});

describe('signIn', () => {
  it('wipes local data before setting a different owner, then syncs', async () => {
    await meta.setOwner('old', 'o@b.c');
    const order: string[] = [];
    const wipe = vi.spyOn(meta, 'wipeLocalData').mockImplementation(() => {
      order.push('wipe');
      return Promise.resolve();
    });
    const set = vi.spyOn(meta, 'setOwner').mockImplementation(() => {
      order.push('setOwner');
      return Promise.resolve();
    });
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'new', email: 'n@b.c' } },
      error: null,
    });
    expect(await signIn('n@b.c', 'pw')).toEqual({ ok: true });
    expect(order).toEqual(['wipe', 'setOwner']);
    expect(syncNow).toHaveBeenCalledWith('signin');
    wipe.mockRestore();
    set.mockRestore();
  });

  it('wipes when there is no owner, then sets the owner', async () => {
    await db.syncState.put({ table: 'exercises', lastPulledAt: 'x', lastPulledKey: 'y' });
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'new', email: 'n@b.c' } },
      error: null,
    });
    await signIn('n@b.c', 'pw');
    expect(await db.syncState.count()).toBe(0);
    expect(await meta.getOwner()).toEqual({ userId: 'new', email: 'n@b.c' });
  });

  it('reports invalid credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' },
    });
    const res = await signIn('a@b.c', 'bad');
    expect(res).toEqual({ ok: false, message: 'Incorrect email or password.' });
  });
});

describe('signOut', () => {
  it('blocks when changes are pending unless discardUnsynced', async () => {
    await meta.setOwner('u1', 'a@b.c');
    await runWrite(['exercises'], () => enqueue('exercises', 'e1', 'delete'));
    const blocked = await signOut({ discardUnsynced: false });
    expect(blocked).toEqual({ ok: false, reason: 'unsynced', pendingCount: 1, failedCount: 0 });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(cancelRetry).not.toHaveBeenCalled();
    expect(await signOut({ discardUnsynced: true })).toEqual({ ok: true });
    expect(cancelRetry).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(await db.syncQueue.count()).toBe(0);
  });
});

describe('signUp', () => {
  it('adopts the new identity and syncs when a session is returned', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'n1', email: 'n@b.c', identities: [{}] }, session: {} },
      error: null,
    });
    expect(await signUp('n@b.c', 'longenough')).toEqual({ ok: true, needsConfirmation: false });
    expect(await meta.getOwner()).toEqual({ userId: 'n1', email: 'n@b.c' });
    expect(syncNow).toHaveBeenCalledWith('signin');
  });

  it('reports that email confirmation is needed when no session comes back', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'n1', email: 'n@b.c', identities: [{}] }, session: null },
      error: null,
    });
    expect(await signUp('n@b.c', 'longenough')).toEqual({ ok: true, needsConfirmation: true });
    expect(await meta.getOwner()).toBeUndefined();
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('rejects a short password without calling Supabase', async () => {
    const result = await signUp('n@b.c', 'short');
    expect(result.ok).toBe(false);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('maps an existing account to a sign-in hint', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered', code: 'user_already_exists', status: 422 },
    });
    expect(await signUp('n@b.c', 'longenough')).toEqual({
      ok: false,
      message: 'An account with this email already exists. Sign in instead.',
    });
  });

  it('treats an obfuscated existing user (no identities) as already registered', async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'x', email: 'n@b.c', identities: [] }, session: null },
      error: null,
    });
    const result = await signUp('n@b.c', 'longenough');
    expect(result.ok).toBe(false);
  });
});

describe('requestPasswordReset', () => {
  it('passes origin + pathname as redirectTo and succeeds', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    expect(await requestPasswordReset('a@b.c')).toEqual({ ok: true });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
  });

  it('maps rate limits', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: 'x', status: 429, code: 'over_email_send_rate_limit' },
    });
    expect(await requestPasswordReset('a@b.c')).toEqual({
      ok: false,
      message: 'Too many reset emails. Wait a few minutes and try again.',
    });
  });

  it('reports offline without calling Supabase', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      const res = await requestPasswordReset('a@b.c');
      expect(res.ok).toBe(false);
      expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    } finally {
      online.mockRestore();
    }
  });

  it('maps a network failure to the offline copy', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch' },
    });
    const res = await requestPasswordReset('a@b.c');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/offline/);
  });
});

describe('password reset session', () => {
  const tokens = { accessToken: 'AT', refreshToken: 'RT' };
  const okSession = { data: { session: { user: { email: 'r@b.c' } } }, error: null };

  it('uses only the recovery client and never touches lift-auth or Dexie meta', async () => {
    await meta.setOwner('u1', 'a@b.c');
    localStorage.setItem('lift-auth', 'main-session');
    recoveryAuth.setSession.mockResolvedValue(okSession);
    expect(await beginPasswordReset(tokens)).toEqual({ ok: true, email: 'r@b.c' });
    expect(recoveryAuth.setSession).toHaveBeenCalledWith({
      access_token: 'AT',
      refresh_token: 'RT',
    });
    recoveryAuth.updateUser.mockResolvedValue({ data: { user: { email: 'r@b.c' } }, error: null });
    expect(await completePasswordReset('newpassword')).toEqual({ ok: true, email: 'r@b.c' });
    expect(recoveryAuth.updateUser).toHaveBeenCalledWith({ password: 'newpassword' });
    expect(recoveryAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('lift-auth')).toBe('main-session');
    expect(await meta.getOwner()).toEqual({ userId: 'u1', email: 'a@b.c' });
  });

  it('maps an invalid session to invalid_link', async () => {
    recoveryAuth.setSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'invalid JWT', status: 401 },
    });
    expect(await beginPasswordReset(tokens)).toMatchObject({ ok: false, reason: 'invalid_link' });
  });

  it('rejects short passwords client-side', async () => {
    recoveryAuth.setSession.mockResolvedValue(okSession);
    await beginPasswordReset(tokens);
    expect(await completePasswordReset('short')).toMatchObject({
      ok: false,
      reason: 'weak_password',
    });
    expect(recoveryAuth.updateUser).not.toHaveBeenCalled();
  });

  it('maps same_password and weak_password from the server', async () => {
    recoveryAuth.setSession.mockResolvedValue(okSession);
    await beginPasswordReset(tokens);
    recoveryAuth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'same', status: 422, code: 'same_password' },
    });
    expect(await completePasswordReset('newpassword')).toEqual({
      ok: false,
      reason: 'same_password',
      message: 'Choose a password different from your current one.',
    });
    recoveryAuth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'weak', status: 422, code: 'weak_password' },
    });
    expect(await completePasswordReset('newpassword')).toMatchObject({
      ok: false,
      reason: 'weak_password',
    });
    expect(recoveryAuth.signOut).not.toHaveBeenCalled();
  });

  it('reports invalid_link when completing without a session', async () => {
    recoveryAuth.setSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'bad' },
    });
    await beginPasswordReset(tokens);
    expect(await completePasswordReset('newpassword')).toMatchObject({
      ok: false,
      reason: 'invalid_link',
    });
  });

  it('abandon signs the recovery client out locally and invalidates the reset', async () => {
    recoveryAuth.setSession.mockResolvedValue(okSession);
    await beginPasswordReset(tokens);
    await abandonPasswordReset();
    expect(recoveryAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(await completePasswordReset('newpassword')).toMatchObject({
      ok: false,
      reason: 'invalid_link',
    });
    expect(recoveryAuth.updateUser).not.toHaveBeenCalled();
  });

  it('abandon is a no-op without a recovery client', async () => {
    await abandonPasswordReset();
    expect(recoveryAuth.signOut).not.toHaveBeenCalled();
  });

  it('abandon swallows a rejecting signOut', async () => {
    recoveryAuth.setSession.mockResolvedValue(okSession);
    await beginPasswordReset(tokens);
    recoveryAuth.signOut.mockRejectedValueOnce(new Error('net'));
    await expect(abandonPasswordReset()).resolves.toBeUndefined();
  });
});
