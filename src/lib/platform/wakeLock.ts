export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator && !!navigator.wakeLock;
}

export function keepAwake(): () => void {
  if (!isWakeLockSupported()) return () => undefined;

  let sentinel: WakeLockSentinel | null = null;
  let pending = false;
  let stopped = false;

  const acquire = (): void => {
    if (stopped || pending || document.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    pending = true;
    navigator.wakeLock
      .request('screen')
      .then((s) => {
        pending = false;
        if (stopped) {
          s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
      })
      .catch(() => {
        pending = false;
      });
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') acquire();
  };

  document.addEventListener('visibilitychange', onVisibility);
  acquire();

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    const s = sentinel;
    sentinel = null;
    if (s && !s.released) s.release().catch(() => undefined);
  };
}
