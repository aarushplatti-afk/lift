import { getOwner, setOwner, wipeLocalData } from '../db/repos/meta';
import { countOutboxByState } from '../db/repos/outbox';
import type { RecoveryTokens } from '../lib/authRedirect';
import { createRecoveryClient, getSupabase, type LiftClient } from '../lib/supabase';
import { getSyncEngine } from './engine';
import { AUTH_TIMEOUT_MS, TIMED_OUT, withTimeout } from './timeout';

export interface AuthIdentity {
  userId: string;
  email: string;
}

export type SignInResult = { ok: true } | { ok: false; message: string };
export type SignOutResult =
  { ok: true } | { ok: false; reason: 'unsynced'; pendingCount: number; failedCount: number };

const STORAGE_KEY = 'lift-auth';
const listeners = new Set<(id: AuthIdentity | null) => void>();

function emit(id: AuthIdentity | null): void {
  for (const cb of listeners) cb(id);
}

function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request('lift-sync', fn) : fn();
}

async function adoptIdentity(identity: AuthIdentity): Promise<void> {
  await withSyncLock(async () => {
    const owner = await getOwner();
    if (owner?.userId !== identity.userId) await wipeLocalData();
    await setOwner(identity.userId, identity.email);
  });
}

export async function getCachedSession(): Promise<AuthIdentity | null> {
  const owner = await getOwner();
  const storedOwner = owner && hasStoredSession() ? owner : null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false && storedOwner) {
    return storedOwner;
  }
  try {
    const result = await withTimeout(getSupabase().auth.getSession(), AUTH_TIMEOUT_MS);
    if (result === TIMED_OUT) return storedOwner;
    const user = result.data.session?.user;
    if (!result.error && user) {
      const identity = { userId: user.id, email: user.email ?? owner?.email ?? '' };
      if (owner?.userId !== identity.userId) await adoptIdentity(identity);
      return identity;
    }
  } catch {
    // Fall through to the cached owner rule below.
  }
  return storedOwner;
}

function friendlyError(error: { message: string; status?: number; code?: string }): string {
  if (!navigator.onLine || /fetch|network/i.test(error.message)) {
    return 'You appear to be offline. Connect to the internet to sign in.';
  }
  if (error.code === 'invalid_credentials' || error.status === 400) {
    return 'Incorrect email or password.';
  }
  return 'Could not sign in. Please try again.';
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  if (!navigator.onLine) {
    return { ok: false, message: 'You appear to be offline. Connect to the internet to sign in.' };
  }
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return {
      ok: false,
      message: friendlyError(error ?? { message: 'Could not sign in. Please try again.' }),
    };
  }
  const identity: AuthIdentity = { userId: data.user.id, email: data.user.email ?? email };
  await adoptIdentity(identity);
  emit(identity);
  void getSyncEngine().syncNow('signin');
  return { ok: true };
}

export const PASSWORD_MIN_LENGTH = 8;

type SignUpResult =
  | { ok: true; needsConfirmation: false }
  | { ok: true; needsConfirmation: true }
  | { ok: false; message: string };

function signUpError(error: { message: string; status?: number; code?: string }): string {
  if (!navigator.onLine || /fetch|network/i.test(error.message)) {
    return 'You appear to be offline. Connect to the internet to create an account.';
  }
  switch (error.code) {
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Sign in instead.';
    case 'weak_password':
      return `Choose a stronger password (at least ${String(PASSWORD_MIN_LENGTH)} characters).`;
    case 'email_address_invalid':
      return 'Enter a valid email address.';
    case 'signup_disabled':
      return 'New accounts are turned off for this app.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many sign-up attempts. Wait a few minutes and try again.';
    default:
      return 'Could not create the account. Please try again.';
  }
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  if (!navigator.onLine) {
    return {
      ok: false,
      message: 'You appear to be offline. Connect to the internet to create an account.',
    };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
    };
  }
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error || !data.user) {
    return {
      ok: false,
      message: signUpError(error ?? { message: 'Could not create the account.' }),
    };
  }
  if (data.user.identities?.length === 0) {
    return { ok: false, message: 'An account with this email already exists. Sign in instead.' };
  }
  if (!data.session) return { ok: true, needsConfirmation: true };
  const identity: AuthIdentity = { userId: data.user.id, email: data.user.email ?? email };
  await adoptIdentity(identity);
  emit(identity);
  void getSyncEngine().syncNow('signin');
  return { ok: true, needsConfirmation: false };
}

export async function signOut(opts: { discardUnsynced: boolean }): Promise<SignOutResult> {
  if (navigator.onLine) {
    try {
      await getSyncEngine().syncNow('manual');
    } catch {
      // A failed sync leaves entries pending, which the check below reports.
    }
  }
  const counts = await countOutboxByState();
  const pendingCount = counts.pending + counts.failed;
  if (pendingCount > 0 && !opts.discardUnsynced) {
    return { ok: false, reason: 'unsynced', pendingCount, failedCount: counts.failed };
  }
  getSyncEngine().cancelRetry();
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  if (error) console.warn('Supabase signOut failed; clearing local data anyway', error.message);
  await withSyncLock(wipeLocalData);
  emit(null);
  return { ok: true };
}

export type ResetRequestResult = { ok: true } | { ok: false; message: string };
export type ResetFailure = 'invalid_link' | 'offline' | 'weak_password' | 'same_password' | 'error';
export type BeginResetResult =
  { ok: true; email: string } | { ok: false; reason: ResetFailure; message: string };
export type CompleteResetResult = BeginResetResult;

interface AuthErrorLike {
  message: string;
  status?: number;
  code?: string;
}

const OFFLINE_RESET = 'You appear to be offline. Connect to the internet to reset your password.';
const INVALID_LINK =
  'This link is invalid or has expired. Request a new one from the sign-in screen.';
const SEND_FAILED = 'Could not send the reset email. Please try again.';
const UPDATE_FAILED = 'Could not update the password. Please try again.';

function isOffline(error: AuthErrorLike): boolean {
  return !navigator.onLine || /fetch|network/i.test(error.message);
}

export async function requestPasswordReset(email: string): Promise<ResetRequestResult> {
  if (!navigator.onLine) return { ok: false, message: OFFLINE_RESET };
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  try {
    const result = await withTimeout(
      getSupabase().auth.resetPasswordForEmail(email, { redirectTo }),
      AUTH_TIMEOUT_MS,
    );
    if (result === TIMED_OUT) return { ok: false, message: SEND_FAILED };
    const { error } = result;
    if (!error) return { ok: true };
    if (isOffline(error)) return { ok: false, message: OFFLINE_RESET };
    if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
      return { ok: false, message: 'Too many reset emails. Wait a few minutes and try again.' };
    }
    return { ok: false, message: SEND_FAILED };
  } catch {
    return { ok: false, message: navigator.onLine ? SEND_FAILED : OFFLINE_RESET };
  }
}

let recoveryClient: LiftClient | undefined;

export async function beginPasswordReset(tokens: RecoveryTokens): Promise<BeginResetResult> {
  const client = createRecoveryClient();
  recoveryClient = client;
  try {
    const result = await withTimeout(
      client.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      }),
      AUTH_TIMEOUT_MS,
    );
    if (result === TIMED_OUT) {
      return navigator.onLine
        ? { ok: false, reason: 'error', message: 'Could not verify the link. Please try again.' }
        : { ok: false, reason: 'offline', message: OFFLINE_RESET };
    }
    const email = result.data.session?.user.email;
    if (result.error || !email) {
      if (result.error && isOffline(result.error)) {
        return { ok: false, reason: 'offline', message: OFFLINE_RESET };
      }
      recoveryClient = undefined;
      return { ok: false, reason: 'invalid_link', message: INVALID_LINK };
    }
    return { ok: true, email };
  } catch {
    recoveryClient = undefined;
    return { ok: false, reason: 'invalid_link', message: INVALID_LINK };
  }
}

export async function abandonPasswordReset(): Promise<void> {
  const client = recoveryClient;
  recoveryClient = undefined;
  if (!client) return;
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

export async function completePasswordReset(newPassword: string): Promise<CompleteResetResult> {
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      reason: 'weak_password',
      message: `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
    };
  }
  const client = recoveryClient;
  if (!client) return { ok: false, reason: 'invalid_link', message: INVALID_LINK };
  if (!navigator.onLine) return { ok: false, reason: 'offline', message: OFFLINE_RESET };
  try {
    const result = await withTimeout(
      client.auth.updateUser({ password: newPassword }),
      AUTH_TIMEOUT_MS,
    );
    if (result === TIMED_OUT) return { ok: false, reason: 'error', message: UPDATE_FAILED };
    const { data, error } = result;
    if (error) {
      if (isOffline(error)) return { ok: false, reason: 'offline', message: OFFLINE_RESET };
      if (error.code === 'same_password') {
        return {
          ok: false,
          reason: 'same_password',
          message: 'Choose a password different from your current one.',
        };
      }
      if (error.code === 'weak_password') {
        return {
          ok: false,
          reason: 'weak_password',
          message: `Choose a stronger password (at least ${String(PASSWORD_MIN_LENGTH)} characters).`,
        };
      }
      if (error.status === 401 || error.code === 'session_not_found' || error.code === 'bad_jwt') {
        return { ok: false, reason: 'invalid_link', message: INVALID_LINK };
      }
      return { ok: false, reason: 'error', message: UPDATE_FAILED };
    }
    const email = data.user.email ?? '';
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    recoveryClient = undefined;
    return { ok: true, email };
  } catch {
    return { ok: false, reason: 'error', message: UPDATE_FAILED };
  }
}

export function onAuthChange(cb: (id: AuthIdentity | null) => void): () => void {
  listeners.add(cb);
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') cb(null);
  });
  return () => {
    listeners.delete(cb);
    data.subscription.unsubscribe();
  };
}
