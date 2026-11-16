export interface RecoveryTokens {
  accessToken: string;
  refreshToken: string;
}

export type AuthRedirect =
  | { kind: 'recovery'; tokens: RecoveryTokens }
  | { kind: 'signup_confirmed' }
  | { kind: 'error'; code?: string; description?: string };

let captured: AuthRedirect | null = null;

function parse(params: URLSearchParams): AuthRedirect | null {
  const error = params.get('error');
  const errorCode = params.get('error_code');
  if (error !== null || errorCode !== null) {
    const code = errorCode ?? error ?? undefined;
    const description = params.get('error_description') ?? undefined;
    return { kind: 'error', code, description };
  }
  const accessToken = params.get('access_token');
  if (accessToken === null) return null;
  const type = params.get('type');
  const refreshToken = params.get('refresh_token');
  if (type === 'recovery' && refreshToken) {
    return { kind: 'recovery', tokens: { accessToken, refreshToken } };
  }
  if (type === 'signup' || type === 'email') return { kind: 'signup_confirmed' };
  return { kind: 'error', code: 'invalid_link' };
}

export function captureAuthRedirect(): void {
  const { hash, pathname, search } = window.location;
  if (!hash.startsWith('#') || hash.startsWith('#/')) return;
  const params = new URLSearchParams(hash.slice(1));
  if (!params.has('access_token') && !params.has('error') && !params.has('error_code')) return;
  captured = parse(params);
  window.history.replaceState(null, '', `${pathname}${search}#/`);
}

export function getAuthRedirect(): AuthRedirect | null {
  return captured;
}

export function clearAuthRedirect(): void {
  captured = null;
}
