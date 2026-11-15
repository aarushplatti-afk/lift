import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { EmptyState } from '../../../components/ui/EmptyState';
import { IconButton } from '../../../components/ui/IconButton';
import { useToastStore } from '../../../components/ui/toastStore';
import { WorkoutInProgressDialog } from '../../../components/workout/WorkoutInProgressDialog';
import { deleteTemplate, duplicateTemplate, listTemplates } from '../../../db/repos/templates';
import { useLiveQuery } from '../../../hooks/useLiveQuery';
import { useNow } from '../../../hooks/useNow';
import { formatLastUsed } from '../../../lib/format';
import { newId } from '../../../lib/ids';
import { templateSummary, workoutInitFromTemplate } from '../../../lib/templates';
import { useActiveWorkoutStore } from '../../../store/activeWorkout';
import type { Template } from '../../../types/domain';
import { useExerciseMap } from '../useExerciseMap';
import { TemplateOptionsSheet } from './TemplateOptionsSheet';
import { TemplatePreviewSheet } from './TemplatePreviewSheet';

const SAVE_FAILED = 'Couldn’t save. Storage may be full.';

export function TemplateList() {
  const navigate = useNavigate();
  const now = useNow();
  const names = useExerciseMap();
  const templates = useLiveQuery<Template[] | null>(() => listTemplates(), [], null);
  const status = useActiveWorkoutStore((s) => s.status);
  const active = useActiveWorkoutStore((s) => s.workout);
  const start = useActiveWorkoutStore((s) => s.start);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [optionsId, setOptionsId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [starting, setStarting] = useState(false);

  const find = (id: string | null) => templates?.find((t) => t.id === id) ?? null;
  const preview = find(previewId);
  const options = find(optionsId);

  const handleStart = async () => {
    if (!preview) return;
    if (active) {
      setPreviewId(null);
      setBlocked(true);
      return;
    }
    setStarting(true);
    try {
      await start(workoutInitFromTemplate(preview, { now: Date.now(), newId }));
      setPreviewId(null);
      navigate('/workout/active');
    } catch {
      useToastStore.getState().show({ message: 'Couldn’t start the workout. Try again.' });
    } finally {
      setStarting(false);
    }
  };

  const handleDuplicate = async () => {
    if (!options) return;
    const id = options.id;
    setOptionsId(null);
    try {
      const copy = await duplicateTemplate(id);
      useToastStore.getState().show({ message: `Duplicated as “${copy.name}”` });
    } catch {
      useToastStore.getState().show({ message: SAVE_FAILED });
    }
  };

  const confirmDelete = async () => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    try {
      await deleteTemplate(target.id);
      useToastStore.getState().show({ message: 'Template deleted' });
    } catch {
      useToastStore.getState().show({ message: SAVE_FAILED });
    }
  };

  const goNew = () => {
    navigate('/templates/new');
  };

  return (
    <section aria-labelledby="templates-heading" className="mt-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 id="templates-heading" className="text-title-sm font-semibold">
          Templates
        </h2>
        <Button variant="ghost" onClick={goNew}>
          + New Template
        </Button>
      </div>
      {templates !== null && templates.length === 0 && (
        <EmptyState
          title="No templates yet"
          description="Save a routine you repeat, like Push Day, and start it in one tap."
          action={<Button onClick={goNew}>Create template</Button>}
        />
      )}
      {templates !== null && templates.length > 0 && (
        <ul className="flex flex-col gap-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center rounded-card border border-border bg-surface"
            >
              <button
                type="button"
                aria-label={t.name}
                onClick={() => {
                  setPreviewId(t.id);
                }}
                className="flex min-h-[72px] min-w-0 flex-1 flex-col justify-center rounded-card px-4 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:bg-surface-2"
              >
                <span className="truncate text-body font-semibold">{t.name}</span>
                <span className="truncate text-body-sm text-secondary">
                  {names ? templateSummary(t, names) : ''}
                </span>
                <span className="text-caption text-secondary">
                  {formatLastUsed(t.lastUsedAt, now)}
                </span>
              </button>
              <IconButton
                aria-label={`${t.name} options`}
                onClick={() => {
                  setOptionsId(t.id);
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <TemplatePreviewSheet
        template={preview}
        names={names}
        starting={starting || status === 'loading'}
        onStart={() => {
          void handleStart();
        }}
        onEdit={() => {
          if (preview) navigate(`/templates/${preview.id}/edit`);
        }}
        onClose={() => {
          setPreviewId(null);
        }}
      />
      <TemplateOptionsSheet
        template={options}
        onDuplicate={() => {
          void handleDuplicate();
        }}
        onDelete={() => {
          setDeleting(options);
          setOptionsId(null);
        }}
        onClose={() => {
          setOptionsId(null);
        }}
      />
      <WorkoutInProgressDialog
        open={blocked}
        onClose={() => {
          setBlocked(false);
        }}
      />
      <Dialog
        open={deleting !== null}
        title="Delete this template?"
        onClose={() => {
          setDeleting(null);
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
              void confirmDelete();
            }}
          >
            Delete template
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setDeleting(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
