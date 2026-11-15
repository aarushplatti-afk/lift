import { useCallback } from 'react';
import { useToastStore } from '../../../components/ui/toastStore';
import { deleteEntry, restoreEntry } from '../../../db/repos/bodyweight';
import type { BodyweightEntry } from '../../../types/domain';

export function useDeleteWithUndo(): (entry: BodyweightEntry) => Promise<void> {
  return useCallback(async (entry) => {
    const snapshot = await deleteEntry(entry.id);
    if (!snapshot) return;
    useToastStore.getState().show({
      message: 'Weigh-in deleted',
      actionLabel: 'Undo',
      onAction: () => {
        void restoreEntry(snapshot).then((restored) => {
          if (!restored) {
            useToastStore.getState().show({
              message: 'Couldn’t undo — this day was logged again.',
            });
          }
        });
      },
    });
  }, []);
}
