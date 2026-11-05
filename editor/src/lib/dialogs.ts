import { t } from '../i18n';
import type { ReactNode } from 'react';
import { create } from 'zustand';

/** Promise-based dialogs. Never window.confirm / prompt / alert: everything goes through <DialogHost/>. */
export interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** red confirm button, and Cancel gets the initial focus */
  danger?: boolean;
  /** the user must type this exact text before the confirm button enables (type-to-confirm) */
  typeToConfirm?: string;
}
export interface PromptOpts {
  title: string;
  message?: ReactNode;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** return an error message, or null when the (trimmed) value is fine */
  validate?: (value: string) => string | null;
}
export interface Choice<T> {
  value: T;
  label: string;
  variant?: 'default' | 'primary' | 'danger';
  /** one line under the title: what this option does */
  description?: string;
  icon?: ReactNode;
}
export interface ChoiceOpts<T> {
  title: string;
  message?: ReactNode;
  choices: Choice<T>[];
  /** the ghost button on the left of the footer (resolves null) */
  cancelLabel?: string;
  /** the primary button on the right of the footer: applies the selected option (default "Continue") */
  confirmLabel?: string;
}
export interface CustomApi<T> {
  /** resolve with a value and close */
  done: (value: T) => void;
  /** close, resolving null */
  cancel: () => void;
}
export interface CustomOpts<T> {
  title: string;
  className?: string;
  render: (api: CustomApi<T>) => ReactNode;
}

export type DialogReq =
  | { id: number; kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void; closing?: boolean }
  | { id: number; kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void; closing?: boolean }
  | { id: number; kind: 'choice'; opts: ChoiceOpts<unknown>; resolve: (v: unknown) => void; closing?: boolean }
  | { id: number; kind: 'custom'; opts: CustomOpts<unknown>; resolve: (v: unknown) => void; closing?: boolean };

interface DialogState {
  stack: DialogReq[];
  push: (r: DialogReq) => void;
  /** resolve the dialog now; it is removed from the stack after its exit animation */
  close: (id: number, value: unknown) => void;
  remove: (id: number) => void;
  /** drop everything (tests, route changes): pending promises resolve to their cancel value */
  clear: () => void;
}

export const EXIT_MS = 220;
let seq = 0;
const cancelValue = (r: DialogReq): unknown => (r.kind === 'confirm' ? false : null);

export const useDialogStore = create<DialogState>((set, get) => ({
  stack: [],
  push: (r) => set((s) => ({ stack: [...s.stack, r] })),
  close: (id, value) => {
    const r = get().stack.find((x) => x.id === id);
    if (!r || r.closing) return;
    set((s) => ({ stack: s.stack.map((x) => (x.id === id ? { ...x, closing: true } : x)) as DialogReq[] }));
    (r.resolve as (v: unknown) => void)(value);
    setTimeout(() => get().remove(id), EXIT_MS);
  },
  remove: (id) => set((s) => ({ stack: s.stack.filter((x) => x.id !== id) })),
  clear: () => {
    for (const r of get().stack) if (!r.closing) (r.resolve as (v: unknown) => void)(cancelValue(r));
    set({ stack: [] });
  },
}));

/** Callers pass English; the dialog shows the host's language (t() returns text it has no entry for unchanged, so pre-translated text is fine). */
const tr = (v: string | undefined) => (v === undefined ? v : t(v));
const trNode = (v: ReactNode) => (typeof v === 'string' ? t(v) : v);
const localize = <O extends { title: string; message?: ReactNode; confirmLabel?: string; cancelLabel?: string; label?: string; placeholder?: string }>(o: O): O => ({
  ...o,
  title: t(o.title),
  ...(o.message !== undefined ? { message: trNode(o.message) } : {}),
  ...(o.confirmLabel !== undefined ? { confirmLabel: tr(o.confirmLabel) } : {}),
  ...(o.cancelLabel !== undefined ? { cancelLabel: tr(o.cancelLabel) } : {}),
  ...(o.label !== undefined ? { label: tr(o.label) } : {}),
  ...(o.placeholder !== undefined ? { placeholder: tr(o.placeholder) } : {}),
});

const open = <T>(make: (id: number, resolve: (v: T) => void) => DialogReq): Promise<T> =>
  new Promise<T>((resolve) => useDialogStore.getState().push(make(++seq, resolve)));

export const dialogs = {
  /** true = confirmed, false = cancelled / dismissed */
  confirm: (opts: ConfirmOpts): Promise<boolean> => open<boolean>((id, resolve) => ({ id, kind: 'confirm', opts: localize(opts), resolve })),
  /** the trimmed text, or null when cancelled */
  prompt: (opts: PromptOpts): Promise<string | null> => open<string | null>((id, resolve) => ({ id, kind: 'prompt', opts: localize(opts), resolve })),
  /** the chosen value, or null when cancelled */
  choose: <T>(opts: ChoiceOpts<T>): Promise<T | null> => open<T | null>((id, resolve) => ({ id, kind: 'choice', opts: { ...localize(opts), choices: opts.choices.map((c) => ({ ...c, label: t(c.label), ...(c.description !== undefined ? { description: t(c.description) } : {}) })) } as ChoiceOpts<unknown>, resolve: resolve as (v: unknown) => void })),
  /** any form body (New project, Export ...): resolves what `done` is called with, null on cancel */
  custom: <T>(opts: CustomOpts<T>): Promise<T | null> => open<T | null>((id, resolve) => ({ id, kind: 'custom', opts: { ...opts, title: t(opts.title) } as CustomOpts<unknown>, resolve: resolve as (v: unknown) => void })),
};
