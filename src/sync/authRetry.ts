import type { LiftClient } from '../lib/supabase';
import { isNetworkError, OfflineError } from './push';
import { isAuthError } from './retry';
import { TIMED_OUT, withTimeout } from './timeout';

const REFRESH_TIMEOUT_MS = 5000;

export class AuthExpiredError extends Error {
  constructor() {
    super('Session expired. Sign in again to sync.');
    this.name = 'AuthExpiredError';
  }
}

export function createAuthRetry(client: LiftClient): <T>(fn: () => Promise<T>) => Promise<T> {
  let refresh: Promise<void> | undefined;

  async function doRefresh(): Promise<void> {
    let result: Awaited<ReturnType<typeof client.auth.refreshSession>>;
    try {
      const outcome = await withTimeout(client.auth.refreshSession(), REFRESH_TIMEOUT_MS);
      if (outcome === TIMED_OUT) throw new OfflineError('offline');
      result = outcome;
    } catch (err) {
      if (err instanceof OfflineError) throw err;
      if (isNetworkError(err)) throw new OfflineError('offline');
      throw new AuthExpiredError();
    }
    if (result.error) {
      if (isNetworkError(result.error.message) || result.error.status === 0) {
        throw new OfflineError('offline');
      }
      throw new AuthExpiredError();
    }
    if (!result.data.session) throw new AuthExpiredError();
  }

  return async function authRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (!isAuthError(err)) throw err;
    }
    refresh ??= doRefresh();
    await refresh;
    try {
      return await fn();
    } catch (err) {
      if (isAuthError(err)) throw new AuthExpiredError();
      throw err;
    }
  };
}
