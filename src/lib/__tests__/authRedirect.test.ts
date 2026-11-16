import { afterEach, describe, expect, it } from 'vitest';
import { captureAuthRedirect, clearAuthRedirect, getAuthRedirect } from '../authRedirect';

function go(hash: string): void {
  window.history.replaceState(null, '', `/lift/${hash}`);
  captureAuthRedirect();
}

afterEach(() => {
  clearAuthRedirect();
});

describe('captureAuthRedirect', () => {
  it('captures recovery tokens and removes them from the URL', () => {
    go('#access_token=AT&refresh_token=RT&type=recovery&expires_in=3600');
    expect(getAuthRedirect()).toEqual({
      kind: 'recovery',
      tokens: { accessToken: 'AT', refreshToken: 'RT' },
    });
    expect(window.location.hash).toBe('#/');
    expect(window.location.pathname).toBe('/lift/');
    expect(window.location.href).not.toContain('AT');
  });

  it('treats signup and email tokens as a confirmation without adopting tokens', () => {
    go('#access_token=AT&refresh_token=RT&type=signup');
    expect(getAuthRedirect()).toEqual({ kind: 'signup_confirmed' });
    clearAuthRedirect();
    go('#access_token=AT&refresh_token=RT&type=email');
    expect(getAuthRedirect()).toEqual({ kind: 'signup_confirmed' });
  });

  it('captures error redirects', () => {
    go('#error=access_denied&error_code=otp_expired&error_description=Link+expired');
    expect(getAuthRedirect()).toEqual({
      kind: 'error',
      code: 'otp_expired',
      description: 'Link expired',
    });
    expect(window.location.hash).toBe('#/');
  });

  it('treats tokens of an unknown type as an error', () => {
    go('#access_token=AT&refresh_token=RT&type=magiclink');
    expect(getAuthRedirect()).toEqual({ kind: 'error', code: 'invalid_link' });
  });

  it('leaves routes and empty hashes alone', () => {
    go('#/history');
    expect(getAuthRedirect()).toBeNull();
    expect(window.location.hash).toBe('#/history');
    go('#/');
    go('');
    go('#');
    go('#foo=bar');
    expect(getAuthRedirect()).toBeNull();
    expect(window.location.hash).toBe('#foo=bar');
  });

  it('keeps the slot stable until cleared', () => {
    go('#access_token=AT&refresh_token=RT&type=recovery');
    expect(getAuthRedirect()).toBe(getAuthRedirect());
    clearAuthRedirect();
    expect(getAuthRedirect()).toBeNull();
  });

  it('preserves the search string', () => {
    window.history.replaceState(null, '', '/lift/?a=1#access_token=AT&type=signup');
    captureAuthRedirect();
    expect(window.location.search).toBe('?a=1');
    expect(window.location.hash).toBe('#/');
  });
});
