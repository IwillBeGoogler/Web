import { getNodesBounds } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import { withExportPaper } from '../embed/canvasTheme';
import type { DiagramNode } from '../types';
import { flowExportMarkup } from './flow/export';
import { flowRegistry } from './flow/registry';
import { isDarkBackground } from './contrast';
import { sketchDefsElement, sketchFontEmbedCss } from './sketch';
import { buildExportOptions, downloadDataUrl, exportFileName, type ExportSettings } from './export';

// html-to-image cannot read the cross-origin Google Fonts stylesheet, so PNG / SVG fell back to another font and names were clipped / wrapped:
// fetch that CSS ourselves and inline every font file as a data URL (cached for the session)
let fontCss: Promise<string> | null = null;
function embeddedFontCss(): Promise<string> {
  const toData = (b: Blob) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(b); });
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]'));
  return (fontCss ??= Promise.all(
    links.map(async (l) => {
      let css = await (await fetch(l.href)).text();
      for (const u of new Set(Array.from(css.matchAll(/url\((https:[^)]+)\)/g), (m) => m[1]))) css = css.split(u).join(await toData(await (await fetch(u)).blob()));
      return css;
    }),
  ).then((all) => all.join('\n')).catch(() => { fontCss = null; return ''; }));
}

// The export renders at a different zoom than the screen, and text width does not scale linearly (hinting / rounding at 10-13px),
// so labels re-wrapped mid-word or got clipped. Freeze each label's on-screen line breaks: rewrite its text node as explicit lines
// shown with white-space: pre, never wrapped or clipped. Returns the undo (same text node, so React never notices).
const LABELS = '.node-label, .cluster-title, .cluster-sub, .card-title, .node-subtitle, .edge-label';
function freezeLabels(root: HTMLElement): () => void {
  const undo: Array<() => void> = [];
  for (const el of root.querySelectorAll<HTMLElement>(LABELS)) {
    const t = el.firstChild;
    if (!t || t !== el.lastChild || t.nodeType !== Node.TEXT_NODE) continue;
    const text = t.nodeValue ?? '';
    const lines: string[] = [];
    const range = document.createRange();
    let top = NaN;
    for (const m of text.matchAll(/\S+\s*/g)) {
      range.setStart(t, m.index!); range.setEnd(t, m.index! + m[0].trimEnd().length);
      const y = range.getClientRects()[0]?.top ?? top;
      if (lines.length && Math.abs(y - top) < 2) lines[lines.length - 1] += m[0];
      else { lines.push(m[0]); top = y; }
    }
    const prev = el.getAttribute('style');
    t.nodeValue = lines.map((l) => l.trimEnd()).join('\n');
    el.style.setProperty('white-space', 'pre', 'important');
    undo.push(() => { t.nodeValue = text; if (prev === null) el.removeAttribute('style'); else el.setAttribute('style', prev); });
  }
  return () => undo.forEach((u) => u());
}

/** Export the current page viewport (grid, minimap and controls live outside it, so they never appear). */
export async function exportPage(kind: 'png' | 'svg', nodes: DiagramNode[], opts: ExportSettings, canvasBackground: string, title: string): Promise<void> {
  return withExportPaper(() => capturePage(kind, nodes, opts, canvasBackground, title));
}

async function capturePage(kind: 'png' | 'svg', nodes: DiagramNode[], opts: ExportSettings, canvasBackground: string, title: string): Promise<void> {
  const el = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!el || !nodes.length) throw new Error('Nothing to export');
  // members of collapsed clusters are hidden: they must not stretch the image
  const base = buildExportOptions(opts, getNodesBounds(nodes.filter((n) => !n.hidden)), canvasBackground);
  // A dark canvas (light ink) exported on the usual white paper would vanish: it keeps its own colour unless the export is transparent or "black" was picked
  const options = !opts.transparent && opts.background !== 'black' && isDarkBackground(canvasBackground) ? { ...base, backgroundColor: canvasBackground } : base;
  // Data flow on: SVG keeps the moving packets (SMIL animateMotion), PNG gets one static frame
  let overlay: HTMLElement | null = null;
  if (flowRegistry.paths.length) {
    const tpl = document.createElement('template');
    tpl.innerHTML = flowExportMarkup(flowRegistry.paths, kind === 'svg');
    overlay = tpl.content.firstElementChild as HTMLElement | null;
    if (overlay) el.appendChild(overlay);
  }
  // Black background: dark lines / labels / group titles would vanish, so they are drawn white for this export
  const dark = !opts.transparent && opts.background === 'black';
  if (dark) el.classList.add('export-dark');
  // Sketch look: the wobble filter lives outside the viewport, so a copy goes inside it (the capture is a self-contained SVG), and the handwritten font is inlined too
  const sketch = !!el.closest('.canvas-sketch');
  const defs = sketch ? sketchDefsElement() : null;
  if (defs) el.appendChild(defs);
  const fontEmbedCSS = [await embeddedFontCss(), sketch ? await sketchFontEmbedCss(el.textContent ?? '') : ''].filter(Boolean).join('\n');
  const withFonts = fontEmbedCSS ? { ...options, fontEmbedCSS } : options;
  const thaw = freezeLabels(el); // measure on-screen lines before export-capture changes the wrapping rules
  el.classList.add('export-capture');
  let url: string;
  try {
    url = kind === 'png' ? await toPng(el, withFonts) : await toSvg(el, withFonts);
  } finally {
    overlay?.remove();
    defs?.remove();
    thaw();
    el.classList.remove('export-capture');
    if (dark) el.classList.remove('export-dark');
  }
  downloadDataUrl(url, exportFileName(title, kind));
}
