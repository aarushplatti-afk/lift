import { useState } from 'react';
import type { FormEvent } from 'react';
import { saveTemplate } from '../../db/repos/templates';
import { NAME_MAX } from '../../lib/exercises';
import { templateFromWorkout } from '../../lib/templates';
import type { Template, Workout } from '../../types/domain';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { TextInput } from '../ui/TextInput';
import { useToastStore } from '../ui/toastStore';

interface SaveAsTemplateDialogProps {
  open: boolean;
  workout: Workout;
  onClose: () => void;
  onSaved: (t: Template) => void;
}

const MSG_NAME_REQUIRED = 'Enter a name';
const MSG_NAME_TOO_LONG = `Use ${NAME_MAX} characters or fewer`;
const MSG_NOTHING = 'Nothing to save. Log at least one set first.';
const MSG_FAILED = 'Couldn’t save. Storage may be full.';

interface FormProps {
  workout: Workout;
  onClose: () => void;
  onSaved: (t: Template) => void;
}

function SaveForm({ workout, onClose, onSaved }: FormProps) {
  const [name, setName] = useState(workout.name);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const toast = useToastStore.getState().show;
    try {
      const result = await saveTemplate(templateFromWorkout({ ...workout, name }));
      if (result.ok) {
        toast({ message: `Saved “${result.template.name}” as a template` });
        onSaved(result.template);
        return;
      }
      if (result.error.field === 'exercises') {
        toast({ message: MSG_NOTHING });
        onClose();
        return;
      }
      setError(result.error.code === 'required' ? MSG_NAME_REQUIRED : MSG_NAME_TOO_LONG);
    } catch {
      toast({ message: MSG_FAILED });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <TextInput
        label="Template name"
        value={name}
        error={error}
        autoFocus
        autoComplete="off"
        onChange={(e) => {
          setName(e.target.value);
          setError(undefined);
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function SaveAsTemplateDialog({
  open,
  workout,
  onClose,
  onSaved,
}: SaveAsTemplateDialogProps) {
  return (
    <Dialog open={open} title="Save as template" onClose={onClose}>
      <SaveForm workout={workout} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  );
}
