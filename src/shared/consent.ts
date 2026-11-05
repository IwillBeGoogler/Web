import { useSyncExternalStore } from "react";

/** null: not asked yet. "necessary": storage needed to work only. "all": also anonymous analytics. */
export type Consent = "all" | "necessary" | null;

const KEY = "iblog.consent";
const listeners = new Set<() => void>();

const load = (): Consent => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "all" || v === "necessary" ? v : null;
  } catch {
    return null;
  }
};

let value: Consent = typeof window === "undefined" ? null : load();

export const consent = {
  get: () => value,
  set(v: Exclude<Consent, null>) {
    value = v;
    try {
      localStorage.setItem(KEY, v);
    } catch {}
    for (const l of listeners) l();
  },
  /** Ask again (footer "Cookie settings"). */
  reset() {
    value = null;
    try {
      localStorage.removeItem(KEY);
    } catch {}
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useConsent = () => useSyncExternalStore(consent.subscribe, consent.get, consent.get);
