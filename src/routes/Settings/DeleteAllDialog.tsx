import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { TextInput } from '../../components/ui/TextInput';

const CONFIRM_TEXT = 'DELETE';

interface DeleteAllDialogProps {
  open: boolean;
  offline: boolean;
  busy: boolean;
  onConfirm: (text: string) => void;
  onClose: () => void;
}

export function DeleteAllDialog({ open, offline, busy, onConfirm, onClose }: DeleteAllDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [text, setText] = useState('');

  const close = () => {
    if (busy) return;
    setStep(1);
    setText('');
    onClose();
  };

  if (step === 1) {
    return (
      <Dialog open={open} title="Delete all data?" onClose={close}>
        <p className="mb-2 text-body">
          This deletes all workouts, custom exercises, templates, weigh-ins and settings in this
          account.
        </p>
        <ul className="mb-2 list-disc pl-5 text-body-sm text-secondary">
          <li>Your other devices clear on their next sync.</li>
          <li>Unsynced changes on other devices may reappear.</li>
          <li>Built-in exercises come back.</li>
        </ul>
        {offline && (
          <p className="mb-2 text-body-sm text-secondary">
            Connect to the internet to delete data.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" fullWidth onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            disabled={offline}
            onClick={() => {
              setStep(2);
            }}
          >
            Continue
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} title="Confirm deletion" onClose={close}>
      <div className="mb-4">
        <TextInput
          label="Type DELETE to confirm"
          value={text}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" fullWidth disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          variant="danger"
          fullWidth
          disabled={busy || offline || text !== CONFIRM_TEXT}
          onClick={() => {
            onConfirm(text);
          }}
        >
          {busy ? 'Working…' : 'Delete everything'}
        </Button>
      </div>
    </Dialog>
  );
}
