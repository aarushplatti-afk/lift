import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useFocusTrap(panelRef, { open, onClose });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4"
      onKeyDown={onKeyDown}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-card border border-border bg-surface p-4 shadow-lg"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id={titleId} className="mb-2 text-title-sm font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
