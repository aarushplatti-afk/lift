import { useCallback, useState } from 'react';
import { useToastStore } from '../components/ui/toastStore';
import { markBackupExported } from '../db/repos/meta';
import { saveTextFile } from '../lib/platform/download';

export function useBackupExport(): { exporting: boolean; exportBackup: () => Promise<void> } {
  const [exporting, setExporting] = useState(false);
  const exportBackup = useCallback(async () => {
    setExporting(true);
    try {
      const [{ getDataOps }, { backupFileName }] = await Promise.all([
        import('../sync/dataOps'),
        import('../lib/backup'),
      ]);
      const { backup } = await getDataOps().exportBackup();
      const outcome = await saveTextFile(
        backupFileName(Date.now()),
        'application/json',
        JSON.stringify(backup, null, 2),
      );
      if (outcome !== 'cancelled') {
        await markBackupExported(Date.now()).catch(() => undefined);
        useToastStore.getState().show({ message: 'Backup exported' });
      }
    } catch {
      useToastStore.getState().show({ message: "Couldn't export backup" });
    } finally {
      setExporting(false);
    }
  }, []);
  return { exporting, exportBackup };
}
