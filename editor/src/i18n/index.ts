/*
 * UI language of the editor chrome. Gettext style: the English text is the key, so `t('Share')` reads like the code it
 * replaced and a missing translation falls back to English. Placeholders: `t('{n} files', { n: 3 })`.
 *
 * Dictionaries live per area in `./dict/<area>.ts` (one object per language), merged below; add an area there.
 * The host sets the language once per mount (`lang` prop of `DiagramEditor`); strings are read at render time, so module-level
 * constants keep their English text and are passed through `t()` where they are shown.
 */
import { useSyncExternalStore } from 'react';
import { dictionaries } from './dict';

export type Lang = 'en' | 'uz' | 'ru';

let lang: Lang = 'en';
const subs = new Set<() => void>();

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  for (const f of subs) f();
}

export const getLang = (): Lang => lang;

/** BCP 47 tag for `Intl` / `toLocale*String` in the current UI language */
export const localeTag = (): string => (lang === 'uz' ? 'uz-UZ' : lang === 'ru' ? 'ru-RU' : 'en');

export function t(text: string, vars?: Record<string, string | number>): string {
  const out = lang === 'en' ? text : (dictionaries[lang][text] ?? text);
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

/** Re-renders the caller when the language changes. */
export const useLang = (): Lang =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    getLang,
    getLang,
  );
