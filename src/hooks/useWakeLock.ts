import { useEffect } from 'react';
import { keepAwake } from '../lib/platform/wakeLock';

export function useWakeLock(enabled: boolean): void {
  useEffect(() => (enabled ? keepAwake() : undefined), [enabled]);
}
