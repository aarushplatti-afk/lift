import { InstallInstructions } from './InstallInstructions';
import { BottomSheet } from './ui/BottomSheet';
import { Button } from './ui/Button';

interface InstallHelpSheetProps {
  open: boolean;
  onClose: () => void;
}

export function InstallHelpSheet({ open, onClose }: InstallHelpSheetProps) {
  return (
    <BottomSheet
      open={open}
      title="How to install"
      onClose={onClose}
      footer={
        <Button variant="secondary" fullWidth onClick={onClose} className="mb-3">
          Close
        </Button>
      }
    >
      <p className="mb-3 text-body-sm text-secondary">
        Installing Lift gives you a full-screen app that works offline.
      </p>
      <InstallInstructions />
    </BottomSheet>
  );
}
