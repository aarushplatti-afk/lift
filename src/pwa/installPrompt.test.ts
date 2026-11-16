import { beforeEach, describe, expect, it, vi } from 'vitest';

type Mod = typeof import('./installPrompt');

function fakePrompt(outcome: 'accepted' | 'dismissed'): Event {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  Object.assign(e, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  });
  return e;
}

function setEnv(
  ua: string,
  opts: { platform?: string; touch?: number; standalone?: boolean } = {},
): void {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'platform', {
    value: opts.platform ?? 'Win32',
    configurable: true,
  });
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: opts.touch ?? 0,
    configurable: true,
  });
  Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: opts.standalone ?? false });
}

let mod: Mod;
beforeEach(async () => {
  vi.resetModules();
  setEnv('Mozilla/5.0 Desktop');
  mod = await import('./installPrompt');
});

describe('install prompt capture', () => {
  it('captures beforeinstallprompt and notifies', () => {
    mod.initInstallPrompt();
    mod.initInstallPrompt();
    const cb = vi.fn();
    mod.subscribeInstallPrompt(cb);
    expect(mod.canPromptInstall()).toBe(false);
    const e = fakePrompt('accepted');
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(mod.canPromptInstall()).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('promptInstall returns outcome then unavailable', async () => {
    mod.initInstallPrompt();
    window.dispatchEvent(fakePrompt('dismissed'));
    expect(await mod.promptInstall()).toBe('dismissed');
    expect(mod.canPromptInstall()).toBe(false);
    expect(await mod.promptInstall()).toBe('unavailable');
  });

  it('appinstalled clears', () => {
    mod.initInstallPrompt();
    window.dispatchEvent(fakePrompt('accepted'));
    window.dispatchEvent(new Event('appinstalled'));
    expect(mod.canPromptInstall()).toBe(false);
  });

  it('unsubscribe stops notifications', () => {
    mod.initInstallPrompt();
    const cb = vi.fn();
    mod.subscribeInstallPrompt(cb)();
    window.dispatchEvent(fakePrompt('accepted'));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('platform detection', () => {
  it('standalone', () => {
    setEnv('Mozilla/5.0 (iPhone)', { standalone: true });
    expect(mod.getInstallPlatform()).toBe('standalone');
  });
  it('ios', () => {
    setEnv('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)');
    expect(mod.getInstallPlatform()).toBe('ios');
  });
  it('iPadOS as MacIntel with touch', () => {
    setEnv('Mozilla/5.0 (Macintosh)', { platform: 'MacIntel', touch: 5 });
    expect(mod.getInstallPlatform()).toBe('ios');
  });
  it('android', () => {
    setEnv('Mozilla/5.0 (Linux; Android 14)');
    expect(mod.getInstallPlatform()).toBe('android');
  });
  it('android via captured prompt', () => {
    mod.initInstallPrompt();
    window.dispatchEvent(fakePrompt('accepted'));
    expect(mod.getInstallPlatform()).toBe('android');
  });
  it('other', () => {
    expect(mod.getInstallPlatform()).toBe('other');
  });
});
