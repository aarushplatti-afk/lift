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
