import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme } from '../theme';

type Listener = (e: MediaQueryListEvent) => void;

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: initial,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  vi.stubGlobal('matchMedia', () => mql);
  return {
    listeners,
    fire(matches: boolean) {
      mql.matches = matches;
      listeners.forEach((l) => l({ matches } as MediaQueryListEvent));
    },
  };
}

const isDark = (): boolean => document.documentElement.classList.contains('dark');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.classList.remove('dark');
  localStorage.clear();
});

describe('applyTheme', () => {
  it('dark adds the class and light removes it', () => {
    applyTheme('dark');
    expect(isDark()).toBe(true);
    applyTheme('light');
    expect(isDark()).toBe(false);
  });

  it('mirrors the preference to localStorage', () => {
    applyTheme('light');
    expect(localStorage.getItem('lift.theme')).toBe('light');
  });

  it('survives localStorage throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => applyTheme('dark')).not.toThrow();
    expect(isDark()).toBe(true);
  });

  it('system follows matchMedia changes and cleanup stops following', () => {
    const mm = mockMatchMedia(true);
    const cleanup = applyTheme('system');
    expect(isDark()).toBe(true);
    mm.fire(false);
    expect(isDark()).toBe(false);
    mm.fire(true);
    expect(isDark()).toBe(true);
    cleanup();
    expect(mm.listeners.size).toBe(0);
    mm.fire(false);
    expect(isDark()).toBe(true);
  });
});
