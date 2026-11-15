export interface StorageInfo {
  usageBytes?: number;
  quotaBytes?: number;
  persisted?: boolean;
  canPersist: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const s: StorageManager | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!s) return { canPersist: false };
  const info: StorageInfo = { canPersist: typeof s.persist === 'function' };
  try {
    if (typeof s.estimate === 'function') {
      const e = await s.estimate();
      info.usageBytes = e.usage;
      info.quotaBytes = e.quota;
    }
  } catch {
    // estimate unavailable; leave fields unset
  }
  try {
    if (typeof s.persisted === 'function') info.persisted = await s.persisted();
  } catch {
    // persisted unavailable; leave unset
  }
  return info;
}

export async function requestPersistentStorage(): Promise<boolean | undefined> {
  const s: StorageManager | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!s || typeof s.persist !== 'function') return undefined;
  try {
    return await s.persist();
  } catch {
    return undefined;
  }
}

interface MaybeQuotaError {
  name?: unknown;
  code?: unknown;
  inner?: unknown;
}

export function isQuotaError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && typeof cur === 'object' && cur !== null; depth++) {
    const e = cur as MaybeQuotaError;
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
    if (e.code === 22) return true;
    cur = e.inner;
  }
  return false;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return i === 0 ? `${Math.round(v)} B` : `${v.toFixed(1)} ${units[i]}`;
}
