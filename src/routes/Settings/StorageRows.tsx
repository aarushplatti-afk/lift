import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { formatBytes, getStorageInfo, requestPersistentStorage } from '../../lib/platform/storage';
import type { StorageInfo } from '../../lib/platform/storage';
import { Row } from './Section';

export function StorageRows() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [requesting, setRequesting] = useState(false);

  const refresh = useCallback(async () => {
    setInfo(await getStorageInfo());
  }, []);

  useEffect(() => {
    let live = true;
    void getStorageInfo().then((next) => {
      if (live) setInfo(next);
    });
    return () => {
      live = false;
    };
  }, []);

  if (info === null) return null;

  const hasUsage = info.usageBytes !== undefined && info.quotaBytes !== undefined;
  const showPersist = info.persisted !== undefined || info.canPersist;

  return (
    <>
      {hasUsage && (
        <Row
          label="Storage"
          value={`Using ${formatBytes(info.usageBytes ?? 0)} of ${formatBytes(info.quotaBytes ?? 0)}`}
        />
      )}
      {showPersist && (
        <Row label="Persistent storage" value={info.persisted === true ? 'On' : 'Not enabled'} />
      )}
      {showPersist && info.persisted !== true && (
        <>
          <p className="text-body-sm text-secondary">
            Without this, your browser may clear workout data stored on this device when space runs
            low.
          </p>
          {info.canPersist && (
            <Button
              variant="secondary"
              fullWidth
              disabled={requesting}
              onClick={() => {
                setRequesting(true);
                void requestPersistentStorage()
                  .then(refresh)
                  .finally(() => {
                    setRequesting(false);
                  });
              }}
            >
              {requesting ? 'Working…' : 'Keep data on this device'}
            </Button>
          )}
        </>
      )}
    </>
  );
}
