import { useEffect, useState } from 'react';
import { useBackupExport } from '../hooks/useBackupExport';
import { onQuotaExceeded } from '../lib/storageEvents';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

export function QuotaDialog() {
  const [open, setOpen] = useState(false);
  const { exporting, exportBackup } = useBackupExport();

  useEffect(
    () =>
      onQuotaExceeded(() => {
        setOpen(true);
      }),
    [],
  );

  return (
    <Dialog
      open={open}
      title="Storage is full"
      onClose={() => {
        setOpen(false);
      }}
    >
      <p className="mb-4 text-body">
        This device has no space left, so your latest changes may not be saved. Export a backup,
        then free up space on your device.
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setOpen(false);
          }}
        >
          Close
        </Button>
        <Button
          fullWidth
          disabled={exporting}
          onClick={() => {
            void exportBackup();
          }}
        >
          {exporting ? 'Working…' : 'Export backup'}
        </Button>
      </div>
    </Dialog>
  );
}
