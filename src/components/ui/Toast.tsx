import { useEffect } from 'react';
import { useToastStore } from './toastStore';

export function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!toast || toast.durationMs <= 0) return;
    const timer = setTimeout(dismiss, toast.durationMs);
    return () => {
      clearTimeout(timer);
    };
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-card border border-border bg-surface-2 py-1 pl-4 pr-1 text-body-sm shadow-lg"
      >
        <span className="flex-1">{toast.message}</span>
        {toast.actionLabel && toast.onAction ? (
          <button
            type="button"
            className="min-h-tap min-w-tap rounded-control px-3 font-semibold text-accent"
            onClick={() => {
              toast.onAction?.();
              dismiss();
            }}
          >
            {toast.actionLabel}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Dismiss"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-secondary"
          onClick={dismiss}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
