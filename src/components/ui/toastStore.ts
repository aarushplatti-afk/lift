import { create } from 'zustand';

interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

interface ToastInput {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastState {
  toast: ToastItem | null;
  show: (input: ToastInput) => void;
  dismiss: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: ({ durationMs = 5000, ...rest }) => {
    set({ toast: { id: nextId++, durationMs, ...rest } });
  },
  dismiss: () => {
    set({ toast: null });
  },
}));
