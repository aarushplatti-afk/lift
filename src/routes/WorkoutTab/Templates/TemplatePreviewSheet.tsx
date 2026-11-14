import { BottomSheet } from '../../../components/ui/BottomSheet';
import { Button } from '../../../components/ui/Button';
import type { Exercise, Template } from '../../../types/domain';

interface TemplatePreviewSheetProps {
  template: Template | null;
  names: ReadonlyMap<string, Exercise> | null;
  starting: boolean;
  onStart: () => void;
  onEdit: () => void;
  onClose: () => void;
}

export function TemplatePreviewSheet({
  template,
  names,
  starting,
  onStart,
  onEdit,
  onClose,
}: TemplatePreviewSheetProps) {
  const exercises = template ? [...template.exercises].sort((a, b) => a.order - b.order) : [];
  return (
    <BottomSheet
      open={template !== null}
      title={template?.name ?? ''}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 pb-2">
          <Button size="lg" fullWidth disabled={starting} onClick={onStart}>
            Start Workout
          </Button>
          <Button variant="secondary" fullWidth onClick={onEdit}>
            Edit
          </Button>
        </div>
      }
    >
      <ul className="flex flex-col">
        {exercises.map((e) => (
          <li
            key={`${e.order}-${e.exerciseId}`}
            className="flex min-h-[44px] items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate text-body">
              {names?.get(e.exerciseId)?.name ?? (names ? 'Deleted exercise' : '')}
            </span>
            <span className="shrink-0 text-body-sm tabular-nums text-secondary">
              {e.sets.length === 1 ? '1 set' : `${e.sets.length} sets`}
            </span>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
