import { useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';
import { isWorkoutActive, useActiveWorkoutStore } from '../store/activeWorkout';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface UpdateState {
  needRefresh: boolean;
  dismissed: boolean;
  offlineReady: boolean;
}

const useUpdateStore = create<UpdateState>(() => ({
  needRefresh: false,
  dismissed: false,
  offlineReady: false,
}));

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let registered = false;

function watchForUpdates(registration: ServiceWorkerRegistration): void {
  const check = () => {
    void registration.update().catch(() => undefined);
  };
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

function registerOnce(): void {
  if (registered) return;
  registered = true;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      useUpdateStore.setState({ needRefresh: true, dismissed: false });
    },
    onOfflineReady() {
      useUpdateStore.setState({ offlineReady: true });
    },
    onRegisteredSW(_url, registration) {
      if (registration) watchForUpdates(registration);
    },
  });
}

function apply(): void {
  void updateSW?.(true);
}

function dismiss(): void {
  useUpdateStore.setState({ dismissed: true });
}

export function useUpdatePrompt(): {
  visible: boolean;
  offlineReady: boolean;
  apply: () => void;
  dismiss: () => void;
} {
  useEffect(registerOnce, []);
  const needRefresh = useUpdateStore((s) => s.needRefresh);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const offlineReady = useUpdateStore((s) => s.offlineReady);
  const active = useActiveWorkoutStore(isWorkoutActive);
  return {
    visible: needRefresh && !dismissed && !active,
    offlineReady,
    apply,
    dismiss,
  };
}
