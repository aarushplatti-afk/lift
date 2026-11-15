import { observeOutboxCounts } from '../db/repos/outbox';
import type { SyncEngine } from './engine';

const WRITE_DEBOUNCE_MS = 2000;

interface AutoRefresh {
  startAutoRefresh(): Promise<void>;
  stopAutoRefresh(): Promise<void>;
}

export function startSyncTriggers(engine: SyncEngine, auth?: AutoRefresh): () => void {
  const fire = (reason: Parameters<SyncEngine['syncNow']>[0]): void => {
    void engine.syncNow(reason);
  };
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') fire('visible');
  };
  const onOnline = (): void => {
    void auth?.startAutoRefresh().catch(() => undefined);
    fire('online');
  };
  const onOffline = (): void => {
    void auth?.stopAutoRefresh().catch(() => undefined);
    fire('offline');
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  let previous: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sub = observeOutboxCounts().subscribe({
    next: ({ pending }) => {
      if (previous !== null && pending > previous) {
        clearTimeout(timer);
        timer = setTimeout(() => fire('write'), WRITE_DEBOUNCE_MS);
      }
      previous = pending;
    },
    error: () => undefined,
  });

  fire('start');

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    clearTimeout(timer);
    engine.cancelRetry();
    sub.unsubscribe();
  };
}
