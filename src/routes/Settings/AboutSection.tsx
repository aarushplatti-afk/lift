import { lazy, Suspense, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { APP_VERSION } from '../../lib/version';
import { Row, Section } from './Section';
import { StorageRows } from './StorageRows';

const InstallHelpSheet = lazy(() =>
  import('../../components/InstallHelpSheet').then((m) => ({ default: m.InstallHelpSheet })),
);

export function AboutSection() {
  const { canPrompt, promptInstall } = useInstallPrompt();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Section title="About">
      <Row label="App" value="Lift" />
      <Row label="Version" value={APP_VERSION} />
      {canPrompt ? (
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            void promptInstall();
          }}
        >
          Install app
        </Button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setHelpOpen(true);
        }}
        className="flex min-h-tap w-full items-center justify-between gap-4 rounded-control text-left text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span>How to install</span>
        <span aria-hidden="true" className="text-secondary">
          ›
        </span>
      </button>
      <StorageRows />
      {helpOpen ? (
        <Suspense fallback={null}>
          <InstallHelpSheet
            open
            onClose={() => {
              setHelpOpen(false);
            }}
          />
        </Suspense>
      ) : null}
    </Section>
  );
}
