import { describe, expect, it, vi } from 'vitest';
import { isViewportShort, nudgeLayout, stripAuthRedirectHash } from '../viewportFix';

describe('isViewportShort', () => {
  it('flags a portrait viewport shorter than the screen by the status bar', () => {
    expect(
      isViewportShort({ innerHeight: 797, screenWidth: 390, screenHeight: 844, portrait: true }),
    ).toBe(true);
  });

  it('accepts a full-height portrait viewport and small rounding differences', () => {
    expect(
      isViewportShort({ innerHeight: 844, screenWidth: 390, screenHeight: 844, portrait: true }),
    ).toBe(false);
    expect(
      isViewportShort({ innerHeight: 841, screenWidth: 390, screenHeight: 844, portrait: true }),
    ).toBe(false);
  });

  it('uses the short screen side in landscape', () => {
    expect(
      isViewportShort({ innerHeight: 390, screenWidth: 390, screenHeight: 844, portrait: false }),
    ).toBe(false);
    expect(
      isViewportShort({ innerHeight: 340, screenWidth: 390, screenHeight: 844, portrait: false }),
    ).toBe(true);
  });
});

describe('nudgeLayout', () => {
  it('restores the element display', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const el = document.createElement('div');
    el.style.display = '';
    nudgeLayout(el);
    expect(el.style.display).toBe('');
  });
});

describe('stripAuthRedirectHash', () => {
  it('replaces an auth token hash with the root route', () => {
    window.history.replaceState(null, '', '/lift/#access_token=abc&type=signup');
    stripAuthRedirectHash();
    expect(window.location.hash).toBe('#/');
    expect(window.location.pathname).toBe('/lift/');
  });

  it('leaves normal routes alone', () => {
    window.history.replaceState(null, '', '/lift/#/history');
    stripAuthRedirectHash();
    expect(window.location.hash).toBe('#/history');
  });
});
