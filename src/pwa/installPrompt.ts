export type InstallPlatform = 'standalone' | 'ios' | 'android' | 'other';
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of [...listeners]) cb();
}

export function initInstallPrompt(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false;
}

function isIos(): boolean {
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function getInstallPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'other';
  if (isStandalone()) return 'standalone';
  if (isIos()) return 'ios';
  if (/Android/i.test(navigator.userAgent) || deferred !== null) return 'android';
  return 'other';
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function subscribeInstallPrompt(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export async function promptInstall(): Promise<InstallOutcome> {
  const evt = deferred;
  if (!evt) return 'unavailable';
  deferred = null;
  notify();
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    return choice.outcome;
  } catch {
    return 'dismissed';
  }
}
