import { t } from '../i18n';
import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}
interface ToastStore {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, ms?: number) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}
let nextId = 1;
export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (kind, message, ms = 3500) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message: t(message) }] }));
    if (ms > 0) setTimeout(() => get().dismiss(id), ms);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m, 6000),
  info: (m: string) => useToastStore.getState().push('info', m),
};
