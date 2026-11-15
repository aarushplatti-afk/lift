import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { useToastStore } from '../../components/ui/toastStore';
import { useBackupExport } from '../../hooks/useBackupExport';
import { useOnline } from '../../hooks/useOnline';
import { saveTextFile } from '../../lib/platform/download';
import { useAuthStore } from '../../store/auth';
import type { BackupSummary, LiftBackup } from '../../lib/backup';
import { DeleteAllDialog } from './DeleteAllDialog';
import { ImportSheet } from './ImportSheet';
import { Section } from './Section';

type Busy = 'csv' | 'import' | 'delete' | null;

interface Pending {
  backup: LiftBackup;
  summary: BackupSummary;
}

function toast(message: string): void {
  useToastStore.getState().show({ message });
}

export function DataSection() {
  const online = useOnline();
  const userId = useAuthStore((s) => s.identity?.userId ?? '');
  const { exporting, exportBackup } = useBackupExport();
  const [busy, setBusy] = useState<Busy>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const working = busy !== null || exporting;

  const handleCsv = async () => {
    setBusy('csv');
    try {
      const [{ getDataOps }, { csvFileName }] = await Promise.all([
        import('../../sync/dataOps'),
        import('../../lib/csv'),
      ]);
      const csv = await getDataOps().exportCsv();
      const outcome = await saveTextFile(csvFileName(Date.now()), 'text/csv', csv);
      if (outcome !== 'cancelled') toast('Workouts exported');
    } catch {
      toast("Couldn't export workouts");
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    setBusy('import');
    try {
      const { parseBackup, summarizeBackup } = await import('../../lib/backup');
      const result = parseBackup(await file.text());
      if (!result.ok) {
        setImportError([result.error, ...result.issues].join(' '));
        return;
      }
      setPending({ backup: result.backup, summary: summarizeBackup(result.backup, userId) });
    } catch {
      setImportError("Couldn't read that file.");
    } finally {
      setBusy(null);
    }
  };

  const handleReplace = async () => {
    if (!pending) return;
    setBusy('import');
    try {
      const { getDataOps } = await import('../../sync/dataOps');
      const result = await getDataOps().importReplace(pending.backup);
      if (result.ok) {
        toast(
          result.failed > 0
            ? `Imported. ${String(result.failed)} changes couldn't sync yet. See Account & Sync.`
            : 'Backup imported',
        );
      } else {
        toast(result.message);
      }
    } catch {
      toast("Couldn't import backup");
    } finally {
      setPending(null);
      setBusy(null);
    }
  };

  const handleDelete = async (text: string) => {
    setBusy('delete');
    try {
      const { getDataOps } = await import('../../sync/dataOps');
      const result = await getDataOps().deleteAllData(text);
      toast(result.ok ? 'All data deleted' : result.message);
    } catch {
      toast("Couldn't delete data");
    } finally {
      setDeleteOpen(false);
      setBusy(null);
    }
  };

  return (
    <Section title="Data">
      <div className="flex flex-col gap-1">
        <Button
          variant="secondary"
          fullWidth
          disabled={working}
          onClick={() => {
            void exportBackup();
          }}
        >
          {exporting ? 'Working…' : 'Export data'}
        </Button>
        <p className="text-body-sm text-secondary">
          A JSON file with all workouts, exercises, templates, weigh-ins and settings.
        </p>
      </div>
      <Button
        variant="secondary"
        fullWidth
        disabled={working}
        onClick={() => {
          void handleCsv();
        }}
      >
        {busy === 'csv' ? 'Working…' : 'Export workouts as CSV'}
      </Button>
      <div className="flex flex-col gap-1">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          aria-label="Backup file"
          className="hidden"
          onChange={(e) => {
            void handleFile(e);
          }}
        />
        <Button
          variant="secondary"
          fullWidth
          disabled={working || !online}
          onClick={() => {
            fileRef.current?.click();
          }}
        >
          {busy === 'import' && pending === null ? 'Working…' : 'Import data'}
        </Button>
        {!online && (
          <p className="text-body-sm text-secondary">Connect to the internet to import.</p>
        )}
        {importError !== null && (
          <p role="alert" className="break-words text-body-sm text-danger">
            {importError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Button
          variant="danger"
          fullWidth
          disabled={working || !online}
          onClick={() => {
            setDeleteOpen(true);
          }}
        >
          Delete all data
        </Button>
        {!online && (
          <p className="text-body-sm text-secondary">Connect to the internet to delete data.</p>
        )}
      </div>
      <ImportSheet
        key={pending ? 'open' : 'closed'}
        summary={pending?.summary ?? null}
        offline={!online}
        busy={busy === 'import'}
        onReplace={() => {
          void handleReplace();
        }}
        onClose={() => {
          setPending(null);
        }}
      />
      <DeleteAllDialog
        key={deleteOpen ? 'open' : 'closed'}
        open={deleteOpen}
        offline={!online}
        busy={busy === 'delete'}
        onConfirm={(text) => {
          void handleDelete(text);
        }}
        onClose={() => {
          setDeleteOpen(false);
        }}
      />
    </Section>
  );
}
