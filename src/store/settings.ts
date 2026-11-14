import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  observeSettings,
  updateSettings,
  type SettingsPatch,
} from '../db/repos/settings';
import type { SettingsData } from '../types/domain';

interface SettingsState {
  settings: SettingsData;
  hydrated: boolean;
  update: (patch: SettingsPatch) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>(() => ({
  settings: { ...DEFAULT_SETTINGS },
  hydrated: false,
  update: updateSettings,
}));

export function initSettingsStore(): () => void {
  const sub = observeSettings().subscribe({
    next: (settings) => useSettingsStore.setState({ settings, hydrated: true }),
    error: () => useSettingsStore.setState({ hydrated: true }),
  });
  return () => sub.unsubscribe();
}
