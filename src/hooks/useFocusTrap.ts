import { useEffect } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface FocusTrapOptions {
  open: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Moves focus into the panel on open, restores it on close, and returns a keydown
 * handler that closes on Escape and wraps Tab within the panel.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  { open, onClose, initialFocusRef }: FocusTrapOptions,
): (e: KeyboardEvent<HTMLElement>) => void {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, panelRef, initialFocusRef]);

  return (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (!firstItem || !lastItem) return;
    if (e.shiftKey && document.activeElement === firstItem) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  };
}
