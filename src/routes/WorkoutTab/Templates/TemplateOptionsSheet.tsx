import { BottomSheet } from '../../../components/ui/BottomSheet';
import type { Template } from '../../../types/domain';

interface TemplateOptionsSheetProps {
  template: Template | null;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const ITEM =
  'flex min-h-[48px] w-full items-center rounded-control px-2 text-left text-body focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:bg-surface-2';

export function TemplateOptionsSheet({
  template,
  onDuplicate,
  onDelete,
  onClose,
}: TemplateOptionsSheetProps) {
  return (
    <BottomSheet open={template !== null} title={template?.name ?? ''} onClose={onClose}>
      <div className="flex flex-col">
        <button type="button" className={`${ITEM} text-primary`} onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className={`${ITEM} text-danger`} onClick={onDelete}>
          Delete
        </button>
      </div>
    </BottomSheet>
  );
}
