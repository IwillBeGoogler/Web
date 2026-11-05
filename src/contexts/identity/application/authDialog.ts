import { useSyncExternalStore } from "react";
import { tokens } from "@/shared/api";

export type AuthMode = "signin" | "signup" | null;
let mode: AuthMode = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export const authDialog = {
  open: (m: Exclude<AuthMode, null> = "signin") => {
    mode = m;
    emit();
  },
  close: () => {
    mode = null;
    emit();
  },
  get: () => mode,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useAuthDialog = () => useSyncExternalStore(authDialog.subscribe, authDialog.get, authDialog.get);

/** Runs `fn` for signed-in readers; otherwise asks them to sign in. */
export const requireAuth =
  <A extends unknown[]>(fn: (...a: A) => void) =>
  (...a: A) => {
    if (tokens.get()) fn(...a);
    else authDialog.open("signin");
  };
