import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Header } from '../../../components/ui/Header';
import { TextInput } from '../../../components/ui/TextInput';
import { useToastStore } from '../../../components/ui/toastStore';
import { ExerciseCard } from '../../../components/workout/ExerciseCard';
import { ExercisePicker } from '../../../components/workout/ExercisePicker';
import { deleteTemplate, getTemplate } from '../../../db/repos/templates';
import { NAME_MAX } from '../../../lib/exercises';
import { newId } from '../../../lib/ids';
import { draftFromTemplate, emptyDraft, type TemplateFieldError } from '../../../lib/templates';
import { useSettingsStore } from '../../../store/settings';
import { useTemplateDraftStore } from '../../../store/templateDraft';
import { useExerciseMap } from '../useExerciseMap';

const SAVE_FAILED = 'Couldn’t save. Storage may be full.';

function errorMessage(error: TemplateFieldError): string {
  if (error.field === 'exercises') return 'Add at least one exercise';
  return error.code === 'required' ? 'Enter a name' : 'Use 60 characters or fewer';
}

export function TemplateEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const unit = useSettingsStore((s) => s.settings.unit);
  const draft = useTemplateDraftStore((s) => s.draft);
  const exerciseMap = useExerciseMap();
  const [missingId, setMissingId] = useState<string | null>(null);
  const [error, setError] = useState<TemplateFieldError | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (id === undefined) {
      useTemplateDraftStore.getState().load(emptyDraft(Date.now()));
    } else {
      void getTemplate(id).then((t) => {
        if (cancelled) return;
        if (t) {
          useTemplateDraftStore.getState().load(draftFromTemplate(t, { now: Date.now(), newId }));
        } else {
          setMissingId(id);
        }
      });
    }
    return () => {
      cancelled = true;
      useTemplateDraftStore.getState().clear();
    };
  }, [id]);

  const goHome = () => {
    navigate('/', { replace: true });
  };

  if (id !== undefined && missingId === id) {
    return (
      <>
        <Header title="Edit Template" />
        <main className="px-4 pt-6">
          <EmptyState
            title="Template not found"
            description="It may have been deleted."
            action={<Button onClick={goHome}>Done</Button>}
          />
        </main>
      </>
    );
  }

  if (!draft) return null;

  const isEdit = id !== undefined;
  const nameError = error?.field === 'name' ? errorMessage(error) : undefined;
  const exercisesError = error?.field === 'exercises' ? errorMessage(error) : undefined;

  const cancel = () => {
    if (useTemplateDraftStore.getState().isDirty()) setDiscardOpen(true);
    else goHome();
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await useTemplateDraftStore.getState().save();
      if (result.ok) {
        useToastStore.getState().show({ message: 'Template saved' });
        goHome();
      } else {
        setError(result.error);
        setBusy(false);
      }
    } catch {
      useToastStore.getState().show({ message: SAVE_FAILED });
      setBusy(false);
    }
  };

  const remove = async () => {
    if (id === undefined) return;
    setDeleteOpen(false);
    try {
      await deleteTemplate(id);
      useToastStore.getState().show({ message: 'Template deleted' });
      goHome();
    } catch {
      useToastStore.getState().show({ message: SAVE_FAILED });
    }
  };

  return (
    <>
      <Header
        title={isEdit ? 'Edit Template' : 'New Template'}
        left={
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        }
        right={
          <Button
            onClick={() => {
              void save();
            }}
          >
            Save
          </Button>
        }
      />
      <main className="flex flex-col gap-3 px-4 pb-6 pt-3">
        <TextInput
          label="Template name"
          placeholder="e.g. Push Day"
          maxLength={NAME_MAX}
          value={draft.name}
          error={nameError}
          onChange={(e) => {
            if (error?.field === 'name') setError(null);
            useTemplateDraftStore.getState().setName(e.target.value);
          }}
        />
        {exerciseMap !== null &&
          draft.exercises.map((we, i) => (
            <ExerciseCard
              key={we.id}
              mode="template"
              we={we}
              index={i}
              count={draft.exercises.length}
              exercise={exerciseMap.get(we.exerciseId)}
              unit={unit}
              previous={undefined}
            />
          ))}
        {draft.exercises.length === 0 && (
          <EmptyState
            title="No exercises yet"
            description="Add the exercises you do in this routine."
          />
        )}
        {exercisesError !== undefined && (
          <p role="alert" className="text-body-sm text-danger">
            {exercisesError}
          </p>
        )}
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setPickerOpen(true);
          }}
        >
          + Add Exercise
        </Button>
        {isEdit && (
          <Button
            variant="secondary"
            fullWidth
            className="text-danger"
            onClick={() => {
              setDeleteOpen(true);
            }}
          >
            Delete Template
          </Button>
        )}
      </main>

      <ExercisePicker
        open={pickerOpen}
        title="Add exercises"
        onClose={() => {
          setPickerOpen(false);
        }}
        onAdd={(ids) => {
          if (error?.field === 'exercises') setError(null);
          useTemplateDraftStore.getState().addExercises(ids);
        }}
      />
      <Dialog
        open={discardOpen}
        title="Discard changes?"
        onClose={() => {
          setDiscardOpen(false);
        }}
      >
        <p className="mb-4 text-body-sm text-secondary">
          Your changes to this template won’t be saved.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="danger" fullWidth onClick={goHome}>
            Discard changes
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setDiscardOpen(false);
            }}
          >
            Keep editing
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={deleteOpen}
        title="Delete this template?"
        onClose={() => {
          setDeleteOpen(false);
        }}
      >
        <p className="mb-4 text-body-sm text-secondary">
          Workouts you logged from it stay in your history.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              void remove();
            }}
          >
            Delete template
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setDeleteOpen(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </Dialog>
    </>
  );
}
