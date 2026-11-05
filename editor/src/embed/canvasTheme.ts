import { useSyncExternalStore } from 'react';
import { canvasInk, contrastRatio, INK_LIGHT, mixHex } from '../lib/contrast';

/** The dark host's opaque card colour (Web: `--card`); a hex, because the canvas code derives its ink from it. */
const DARK_PAPER = '#0a0c1c';
const DEFAULT_PAPER = '#ffffff';

const root = () => document.querySelector<HTMLElement>('.sdd-root.sdd-embed');

const listeners = new Set<() => void>();
let capturing = false;

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  const el = root();
  const watch = el ? new MutationObserver(notify) : null;
  watch?.observe(el as HTMLElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    listeners.delete(notify);
    watch?.disconnect();
  };
};
const isDark = () => !capturing && root()?.dataset.theme === 'dark';
const useDarkPage = () => useSyncExternalStore(subscribe, isDark, () => false);

/**
 * What the canvas shows: embedded on a dark page the default white paper follows the page. A colour the person picked stays.
 * Standalone (no embed root) nothing changes.
 */
export function useShownCanvasBackground(background: string): string {
  return useDarkPage() && background === DEFAULT_PAPER ? DARK_PAPER : background;
}

/** Edge colours are saved for white paper (default `#2d3340`): on the dark one those that would vanish are drawn light. */
export function useShownEdgeColor(color: string, background: string): string {
  const onDarkPaper = useDarkPage() && background === DEFAULT_PAPER;
  return onDarkPaper && contrastRatio(color, DARK_PAPER) < 3 ? INK_LIGHT : color;
}

const isOnPage = () => !capturing && !!root();

/** Embedded, the default paper is tinted glass over the host's sky (.canvas-sky, embed/theme.css). Exports and picked colours stay solid. */
export function useSkyPaper(background: string): boolean {
  return useSyncExternalStore(subscribe, isOnPage, () => false) && background === DEFAULT_PAPER;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Text of an edge label sits on the paper and needs 4.5:1 (a line only 3:1): a colour that falls short is pulled toward the paper's ink
 * in steps of 10 % until it reads. The saved colour is untouched, the line keeps it.
 */
export function useShownLabelColor(color: string, background: string): string {
  const shown = useShownEdgeColor(color, background);
  const paper = useShownCanvasBackground(background);
  if (!HEX.test(shown) || !HEX.test(paper) || contrastRatio(shown, paper) >= 4.5) return shown;
  const ink = canvasInk(paper);
  for (let pct = 10; pct <= 100; pct += 10) {
    const c = mixHex(ink, shown, pct);
    if (contrastRatio(c, paper) >= 4.5) return c;
  }
  return ink;
}

const nextPaint = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

/** Images are cloned from the live canvas: they are taken on the real (light) paper, whatever the page shows. */
export async function withExportPaper<T>(capture: () => Promise<T>): Promise<T> {
  const switched = !!root() && root()?.dataset.theme === 'dark';
  if (switched) {
    capturing = true;
    for (const f of listeners) f();
    await nextPaint();
  }
  try {
    return await capture();
  } finally {
    if (switched) {
      capturing = false;
      for (const f of listeners) f();
    }
  }
}
