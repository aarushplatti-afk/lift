import { isQuotaError } from './platform/storage';

const listeners = new Set<() => void>();

export function reportStorageError(err: unknown): void {
  if (!isQuotaError(err)) return;
  for (const cb of [...listeners]) cb();
}

export function onQuotaExceeded(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function installStorageErrorListener(): () => void {
  const onRejection = (e: PromiseRejectionEvent): void => reportStorageError(e.reason);
  window.addEventListener('unhandledrejection', onRejection);
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
