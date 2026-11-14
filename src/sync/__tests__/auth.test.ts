import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/schema';
import * as meta from '../../db/repos/meta';
import { enqueue, runWrite } from '../../db/repos/outbox';

const auth = {
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
};
const syncNow = vi.fn(() => Promise.resolve());

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({ auth }) }));
vi.mock('../engine', () => ({ getSyncEngine: () => ({ syncNow }) }));

const { getCachedSession, signIn, signOut } = await import('../auth');

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
    expect(blocked).toEqual({ ok: false, reason: 'unsynced', pendingCount: 1 });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(await signOut({ discardUnsynced: true })).toEqual({ ok: true });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(await db.syncQueue.count()).toBe(0);
  });
});
