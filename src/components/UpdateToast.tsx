import { useEffect } from 'react';
import { useUpdatePrompt } from '../pwa/updatePrompt';
import { useToastStore } from './ui/toastStore';

export function UpdateToast() {
  const { visible, offlineReady, apply, dismiss } = useUpdatePrompt();

  useEffect(() => {
    if (!offlineReady) return;
    useToastStore.getState().show({ message: 'Ready to work offline' });
  }, [offlineReady]);

  useEffect(() => {
    if (!visible) return;
    const { show } = useToastStore.getState();
    show({
      message: 'Update available',
      actionLabel: 'Reload',
      onAction: apply,
      durationMs: 0,
    });
    return useToastStore.subscribe((state) => {
      if (state.toast === null) dismiss();
    });
  }, [visible, apply, dismiss]);

  return null;
}
