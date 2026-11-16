import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function BottomSheet({ open, title, onClose, children, footer }: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onKeyDown = useFocusTrap(panelRef, { open, onClose, initialFocusRef: titleRef });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70"
      onKeyDown={onKeyDown}
      onClick={onClose}
      role="presentation"
      data-testid="sheet-backdrop"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pl-safe pr-safe flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-card border border-border bg-surface shadow-lg"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="px-4 pb-2 pt-4 text-title-sm font-semibold"
        >
          {title}
        </h2>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer !== undefined && (
          <div className="pb-safe sticky bottom-0 border-t border-border bg-surface px-4 pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
