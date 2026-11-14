import type { ThemePref } from '../types/domain';

const STORAGE_KEY = 'lift.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function setDark(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
}

function mirror(pref: ThemePref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies in memory.
  }
}

export function applyTheme(pref: ThemePref): () => void {
  mirror(pref);
  if (pref !== 'system') {
    setDark(pref === 'dark');
    return () => undefined;
  }
  const mql = window.matchMedia(DARK_QUERY);
  setDark(mql.matches);
  const onChange = (e: MediaQueryListEvent): void => setDark(e.matches);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
