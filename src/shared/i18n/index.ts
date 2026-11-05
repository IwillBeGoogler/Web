import { useSyncExternalStore } from "react";
import { en } from "./en";
import { ru } from "./ru";
import { uz } from "./uz";

export type Lang = "uz" | "ru" | "en";
export type Messages = typeof en;
export type MessageKey = keyof Messages;

export const LANGS: { id: Lang; label: string }[] = [
  { id: "uz", label: "O‘zbekcha" },
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
];

const dictionaries: Record<Lang, Partial<Messages>> = { en, ru, uz };
const KEY = "iblog.lang";
const listeners = new Set<() => void>();

const isLang = (v: unknown): v is Lang => v === "uz" || v === "ru" || v === "en";

/** Stored choice, else the browser's language, else Uzbek. */
export function detectLang(stored: string | null, browser: readonly string[]): Lang {
  if (isLang(stored)) return stored;
  for (const l of browser) {
    const base = l.toLowerCase().split("-")[0];
    if (isLang(base)) return base;
  }
  return "uz";
}

const load = (): Lang => {
  try {
    return detectLang(localStorage.getItem(KEY), typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]));
  } catch {
    return "uz";
  }
};

let lang: Lang = typeof window === "undefined" ? "uz" : load();

const applyLang = (l: Lang) => {
  if (typeof document !== "undefined") document.documentElement.lang = l;
};
applyLang(lang);

/** Message for key in the current language; English when missing. {name} placeholders are filled from vars. */
export function translate(l: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  let s = dictionaries[l][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const i18n = {
  get: () => lang,
  set(l: Lang) {
    lang = l;
    try {
      localStorage.setItem(KEY, l);
    } catch {}
    applyLang(l);
    for (const fn of listeners) fn();
  },
  t: (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const useLang = () => useSyncExternalStore(i18n.subscribe, i18n.get, i18n.get);

/** t() bound to the current language; re-renders on change. */
export function useT() {
  const l = useLang();
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(l, key, vars);
}
