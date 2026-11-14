import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';

interface SwipeRowProps {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel: string;
  disabled?: boolean;
}

const LOCK_DISTANCE = 8;
const LOCK_RATIO = 1.5;
const REVEAL_WIDTH = 80;

let closeOpenRow: (() => void) | null = null;

type Gesture = 'pending' | 'horizontal' | 'vertical';

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  base: number;
  gesture: Gesture;
}

export function SwipeRow({ children, onDelete, deleteLabel, disabled = false }: SwipeRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const open = offset === -REVEAL_WIDTH && !dragging;

  const close = useCallback(() => {
    setOffset(0);
    setDragging(false);
    dragRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    closeOpenRow?.();
    closeOpenRow = close;
    const onOutside = (e: globalThis.PointerEvent) => {
      if (e.target instanceof Node && deleteRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      if (closeOpenRow === close) closeOpenRow = null;
    };
  }, [open, close]);

  const rowWidth = () => {
    const el = rootRef.current;
    if (!el) return 0;
    return el.getBoundingClientRect().width || el.offsetWidth;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      base: open ? -REVEAL_WIDTH : 0,
      gesture: 'pending',
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.gesture === 'pending') {
      if (Math.hypot(dx, dy) < LOCK_DISTANCE) return;
      if (Math.abs(dx) > LOCK_RATIO * Math.abs(dy)) {
        drag.gesture = 'horizontal';
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
      } else {
        drag.gesture = 'vertical';
        return;
      }
    }
    if (drag.gesture !== 'horizontal') return;
    setOffset(Math.min(0, Math.max(-rowWidth(), drag.base + dx)));
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (drag.gesture !== 'horizontal') return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    const travelled = -offset;
    const width = rowWidth();
    if (width > 0 && travelled >= width / 2) {
      setOffset(0);
      onDelete();
    } else if (travelled >= REVEAL_WIDTH) {
      setOffset(-REVEAL_WIDTH);
    } else {
      setOffset(0);
    }
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setDragging(false);
    setOffset(open ? -REVEAL_WIDTH : 0);
  };

  return (
    <div ref={rootRef} className="relative overflow-hidden">
      <button
        ref={deleteRef}
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={open ? undefined : true}
        onClick={() => {
          close();
          onDelete();
        }}
        className="absolute inset-y-0 right-0 flex min-h-tap w-20 items-center justify-center bg-danger text-body font-semibold text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {deleteLabel}
      </button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{ transform: `translateX(${String(offset)}px)`, touchAction: 'pan-y' }}
        className={`relative bg-surface ${dragging ? '' : 'motion-safe:transition-transform'}`}
      >
        {children}
      </div>
    </div>
  );
}
