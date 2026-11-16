import { Button } from './ui/Button';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function InstallInstructions() {
  const { platform, canPrompt, promptInstall } = useInstallPrompt();

  if (platform === 'standalone') {
    return <p className="text-body-sm text-secondary">Lift is already installed on this device.</p>;
  }
  if (platform === 'ios') {
    return (
      <ol className="list-decimal pl-5 text-body-sm text-secondary">
        <li>Open Lift in Safari.</li>
        <li>Tap the Share button.</li>
        <li>Tap Add to Home Screen, then Add.</li>
      </ol>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {canPrompt ? (
        <Button
          variant="secondary"
          onClick={() => {
            void promptInstall();
          }}
        >
          Install app
        </Button>
      ) : null}
      <p className="text-body-sm text-secondary">
        {platform === 'android'
          ? 'Open the browser menu, then tap Install app or Add to Home screen.'
          : 'Use your browser menu to install Lift or add it to your home screen.'}
      </p>
    </div>
  );
}
