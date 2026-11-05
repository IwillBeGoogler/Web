/**
 * "Sketch" look (settings.canvas.sketch): wobbly lines + a handwritten font.
 *  - lines: ONE inline SVG filter (feTurbulence + feDisplacementMap, fixed seed) applied by CSS to the node layer and the edge layer
 *    (styles/sketch.css), never to the whole viewport, so HTML labels of the edge-label layer and the UI stay crisp;
 *  - font: Caveat (OFL, latin / latin-ext / cyrillic / cyrillic-ext) from `@fontsource/caveat`, self-hosted by Vite, fetched only when sketch is on.
 */
export const SKETCH_FILTER_ID = 'sdd-sketch-filter';
export const SKETCH_DEFS_ID = 'sdd-sketch-defs';
export const SKETCH_FONT = 'Caveat';
/** above this many nodes the filter is skipped (a full-layer filter re-rasterises on every change); the font still applies */
export const SKETCH_FILTER_NODE_LIMIT = 400;

/** the filter, inline so a CSS `filter: url(#id)` finds it; wide region because the layers are zero-sized boxes whose children overflow */
export const SKETCH_DEFS_INNER = `<filter id="${SKETCH_FILTER_ID}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter>`;

/** a standalone <svg> with the filter, appended into the cloned viewport for PNG / SVG export */
export function sketchDefsElement(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('id', SKETCH_DEFS_ID);
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.position = 'absolute';
  svg.innerHTML = SKETCH_DEFS_INNER;
  return svg;
}

let fontLoad: Promise<void> | null = null;
/** load the handwritten font (once); the dynamic imports keep it out of the main bundle until sketch is turned on */
export function loadSketchFont(): Promise<void> {
  return (fontLoad ??= Promise.all([import('@fontsource/caveat/400.css'), import('@fontsource/caveat/700.css')]).then(
    () => undefined,
    () => {
      fontLoad = null;
    },
  ));
}

const inRanges = (cp: number, ranges: string): boolean =>
  ranges.split(',').some((r) => {
    const m = /U\+([0-9a-f]+)(?:-([0-9a-f]+))?/i.exec(r.trim());
    if (!m) return false;
    const lo = parseInt(m[1], 16);
    return cp >= lo && cp <= (m[2] ? parseInt(m[2], 16) : lo);
  });

/**
 * @font-face CSS (fonts as data URLs) for the Caveat subsets that `text` actually uses, for html-to-image's `fontEmbedCSS`.
 * Empty when the font was never loaded.
 */
export async function sketchFontEmbedCss(text: string): Promise<string> {
  const toData = (b: Blob) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(b); });
  const cps = new Set(Array.from(text, (c) => c.codePointAt(0)!));
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule) || !rule.style.getPropertyValue('font-family').includes(SKETCH_FONT)) continue;
      const range = rule.style.getPropertyValue('unicode-range');
      if (range && ![...cps].some((cp) => inRanges(cp, range))) continue;
      const src = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(rule.style.getPropertyValue('src'));
      if (!src) continue;
      try {
        const data = await toData(await (await fetch(new URL(src[1], sheet.href ?? document.baseURI).href)).blob());
        out.push(`@font-face{font-family:'${SKETCH_FONT}';font-style:normal;font-weight:${rule.style.getPropertyValue('font-weight') || 400};src:url(${data}) format('woff2');${range ? `unicode-range:${range};` : ''}}`);
      } catch {
        /* a missing subset falls back to the system cursive font */
      }
    }
  }
  return out.join('\n');
}
