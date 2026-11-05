import { useSyncExternalStore } from "react";
import { articleFontPx, MEASURE_STEP, measureCh, normalizePrefs, paletteOf, paletteVars, type ReadingPrefs, typefaceOf } from "../domain/reading";

const KEY = "iblog.reading";
const GALAXY_KEY = "iblog.galaxy.v2";
const listeners = new Set<() => void>();

const load = (): ReadingPrefs => {
  try {
    const raw = localStorage.getItem(KEY);
    // one-time move to the Galaxy default; palette picks made after it stick
    if (raw && localStorage.getItem(GALAXY_KEY)) return normalizePrefs(JSON.parse(raw));
    localStorage.setItem(GALAXY_KEY, "1");
    if (raw) return normalizePrefs({ ...JSON.parse(raw), palette: "galaxy" });
    return normalizePrefs(null);
  } catch {
    return normalizePrefs(null);
  }
};

let prefs: ReadingPrefs = typeof window === "undefined" ? normalizePrefs(null) : load();

/** Writes prefs onto <html>: palette tokens, dark class, article type and modes. */
export function applyPrefs(p: ReadingPrefs, root: HTMLElement = document.documentElement) {
  const pal = paletteOf(p.palette);
  for (const [k, v] of Object.entries(paletteVars(pal))) root.style.setProperty(k, v);
  root.classList.toggle("dark", pal.mode === "dark");
  root.dataset.palette = pal.id;
  const face = typefaceOf(p.typeface);
  root.style.setProperty("--article-font", face.stack);
  root.style.setProperty("--article-size", `${articleFontPx(p.typeStep)}px`);
  root.style.setProperty("--article-measure", p.measureStep >= MEASURE_STEP.max ? "100%" : `${measureCh(p.measureStep)}ch`);
  root.classList.toggle("bold-text", p.bold);
  root.classList.toggle("focus-mode", p.focus);
  if (face.href && !document.querySelector(`link[data-typeface="${face.id}"]`)) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = face.href;
    l.dataset.typeface = face.id;
    document.head.append(l);
  }
}

export const readingPrefs = {
  get: () => prefs,
  set(patch: Partial<ReadingPrefs>) {
    prefs = normalizePrefs({ ...prefs, ...patch });
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {}
    applyPrefs(prefs);
    for (const l of listeners) l();
  },
  reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    readingPrefs.set(normalizePrefs(null));
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

if (typeof window !== "undefined") applyPrefs(prefs);

export const useReadingPrefs = () => useSyncExternalStore(readingPrefs.subscribe, readingPrefs.get, readingPrefs.get);
