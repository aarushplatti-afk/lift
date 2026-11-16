import { useSyncExternalStore } from 'react';
import {
  canPromptInstall,
  getInstallPlatform,
  promptInstall,
  subscribeInstallPrompt,
  type InstallOutcome,
  type InstallPlatform,
} from '../pwa/installPrompt';

export function useInstallPrompt(): {
  platform: InstallPlatform;
  canPrompt: boolean;
  promptInstall: () => Promise<InstallOutcome>;
} {
  const canPrompt = useSyncExternalStore(subscribeInstallPrompt, canPromptInstall, () => false);
  const platform = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPlatform,
    (): InstallPlatform => 'other',
  );
  return { platform, canPrompt, promptInstall };
}
