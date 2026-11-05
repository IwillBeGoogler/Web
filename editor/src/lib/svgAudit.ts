// Pure SVG visibility audit (no imports so Node can run it directly: scripts/icons-audit.ts).
export interface AuditResult {
  ok: boolean;
  problems: string[];
  /** share (0-1) of painted weight that is white / near-white */
  whiteShare: number;
  /** drawn bounding box in viewBox units (absent when the SVG uses transforms) */
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'image', 'text']);
const NON_RENDER = new Set(['defs', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'pattern', 'symbol', 'marker', 'filter', 'style', 'title', 'desc', 'metadata']);

function parseColor(c: string): { r: number; g: number; b: number } | null {
  const s = c.trim().toLowerCase();
  if (s === 'white') return { r: 255, g: 255, b: 255 };
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
  m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}
export const isWhiteish = (c: string): boolean => {
  const p = parseColor(c);
  return !!p && p.r > 240 && p.g > 240 && p.b > 240;
};

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1].trim() : undefined;
}
function styleProp(tag: string, name: string): string | undefined {
  const st = attr(tag, 'style');
  const m = st && st.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i'));
  return m ? m[1].trim() : undefined;
}
const paint = (tag: string, name: 'fill' | 'stroke') => styleProp(tag, name) ?? attr(tag, name);

export function validViewBox(vb: string): boolean {
  const p = vb.trim().split(/[\s,]+/).map(Number);
  return p.length === 4 && p.every(Number.isFinite) && p[2] > 0 && p[3] > 0;
}

export interface BBox { x0: number; y0: number; x1: number; y1: number }
const grow = (b: BBox | null, x: number, y: number): BBox => (b ? { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) } : { x0: x, y0: y, x1: x, y1: y });

/** Bounding box of an SVG path (control points included, so curves may be slightly over-estimated). */
export function pathBBox(d: string): BBox | null {
  let box: BBox | null = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let cmd = '';
  let i = 0;
  const skipSep = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = (flag = false): number => {
    skipSep();
    if (flag) { const v = d[i] === '1' ? 1 : d[i] === '0' ? 0 : NaN; i++; return v; }
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    return Number(m[0]);
  };
  const arity: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  for (;;) {
    skipSep();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
    else if (!cmd) return box;
    const lc = cmd.toLowerCase();
    const rel = cmd === lc;
    if (!(lc in arity)) return box;
    if (lc === 'z') { cx = sx; cy = sy; continue; }
    const a = Array.from({ length: arity[lc] }, (_, k) => num(lc === 'a' && (k === 3 || k === 4)));
    if (a.some((v) => Number.isNaN(v))) return box;
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (lc === 'h') cx = a[0] + ox;
    else if (lc === 'v') cy = a[0] + oy;
    else if (lc === 'c' || lc === 's' || lc === 'q') {
      for (let k = 0; k < a.length - 2; k += 2) box = grow(box, a[k] + ox, a[k + 1] + oy);
      cx = a[a.length - 2] + ox; cy = a[a.length - 1] + oy;
    } else if (lc === 'a') { cx = a[5] + ox; cy = a[6] + oy; }
    else { cx = a[0] + ox; cy = a[1] + oy; }
    box = grow(box, cx, cy);
    if (lc === 'm') { sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; }
  }
  return box;
}

/** Analyse inner SVG markup (no <svg> wrapper) for rendering problems. */
export function auditSvgBody(body: string, viewBox: string): AuditResult {
  const problems: string[] = [];
  if (!body || !body.trim()) problems.push('empty body');
  if (!validViewBox(viewBox)) problems.push(`invalid viewBox "${viewBox}"`);

  let shapes = 0;
  let total = 0;
  let white = 0;
  let colored = 0;
  let currentColor = 0;
  const fillStack: (string | undefined)[] = [undefined];
  const strokeStack: (string | undefined)[] = [undefined];
  let skip = 0;
  let box: BBox | null = null;
  let transformed = false;
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  const open: { name: string; skip: boolean }[] = [];
  while ((m = re.exec(body))) {
    const [, closing, rawName, attrs, selfClose] = m;
    const name = rawName.toLowerCase();
    const tag = ` ${attrs}`;
    if (closing) {
      const top = open.pop();
      if (top) {
        if (top.skip) skip--;
        if (name === 'g' || name === 'svg' || name === 'a') {
          fillStack.pop();
          strokeStack.pop();
        }
      }
      continue;
    }
    const isSkip = NON_RENDER.has(name);
    if (!selfClose) {
      open.push({ name, skip: isSkip });
      if (isSkip) skip++;
    }
    const grouping = name === 'g' || name === 'svg' || name === 'a';
    if (grouping && !selfClose) {
      fillStack.push(paint(tag, 'fill') ?? fillStack[fillStack.length - 1]);
      strokeStack.push(paint(tag, 'stroke') ?? strokeStack[strokeStack.length - 1]);
    }
    if (skip || !SHAPES.has(name)) continue;
    if (attr(tag, 'display') === 'none' || styleProp(tag, 'display') === 'none') continue;
    shapes++;
    if (attr(tag, 'transform')) transformed = true;
    if (name === 'path') { const b = pathBBox(attr(tag, 'd') ?? ''); if (b) { box = grow(box, b.x0, b.y0); box = grow(box, b.x1, b.y1); } }
    else if (name === 'rect') { const x = +(attr(tag, 'x') ?? 0), y = +(attr(tag, 'y') ?? 0); box = grow(grow(box, x, y), x + +(attr(tag, 'width') ?? 0), y + +(attr(tag, 'height') ?? 0)); }
    else if (name === 'circle') { const cx = +(attr(tag, 'cx') ?? 0), cy = +(attr(tag, 'cy') ?? 0), r = +(attr(tag, 'r') ?? 0); box = grow(grow(box, cx - r, cy - r), cx + r, cy + r); }
    else if (name === 'ellipse') { const cx = +(attr(tag, 'cx') ?? 0), cy = +(attr(tag, 'cy') ?? 0), rx = +(attr(tag, 'rx') ?? 0), ry = +(attr(tag, 'ry') ?? 0); box = grow(grow(box, cx - rx, cy - ry), cx + rx, cy + ry); }
    else if (name === 'polygon' || name === 'polyline') { const n = (attr(tag, 'points') ?? '').split(/[\s,]+/).map(Number); for (let k = 0; k + 1 < n.length; k += 2) box = grow(box, n[k], n[k + 1]); }
    else if (name === 'image') { const w = +(attr(tag, 'width') ?? 0), h = +(attr(tag, 'height') ?? 0); box = grow(grow(box, +(attr(tag, 'x') ?? 0), +(attr(tag, 'y') ?? 0)), +(attr(tag, 'x') ?? 0) + w, +(attr(tag, 'y') ?? 0) + h); }
    const weight = Math.max(8, (attr(tag, 'd') ?? attr(tag, 'points') ?? '').length) * 1;
    if (name === 'image') {
      total += weight;
      colored += weight;
      continue;
    }
    const fill = paint(tag, 'fill') ?? fillStack[fillStack.length - 1] ?? '#000000';
    const stroke = paint(tag, 'stroke') ?? strokeStack[strokeStack.length - 1];
    const fillNone = /^(none|transparent)$/i.test(fill);
    const strokeVisible = !!stroke && !/^(none|transparent)$/i.test(stroke) && (styleProp(tag, 'stroke-width') ?? attr(tag, 'stroke-width') ?? '1') !== '0';
    const opacity = parseFloat(attr(tag, 'opacity') ?? styleProp(tag, 'opacity') ?? '1');
    const fillOpacity = parseFloat(attr(tag, 'fill-opacity') ?? styleProp(tag, 'fill-opacity') ?? '1');
    const faint = opacity < 0.05 || (fillOpacity < 0.05 && !strokeVisible);
    if (faint || (fillNone && !strokeVisible)) continue;
    total += weight;
    const c = !fillNone ? fill : stroke!;
    if (/currentcolor/i.test(c)) {
      currentColor += weight;
      continue;
    }
    if (isWhiteish(c)) white += weight;
    else colored += weight;
  }

  if (!shapes) problems.push('no drawable shapes');
  else if (!total) problems.push('shapes have no visible fill or stroke');
  else {
    if (currentColor / total > 0.5) problems.push('uses currentColor (invisible on dark / transparent backgrounds)');
    if (colored === 0 && currentColor === 0 && white > 0) problems.push('white-only logo (invisible on a white canvas)');
  }
  // tiny / illegible: the drawing fills less than half of its tile (typically a wide wordmark letterboxed into a square)
  const vb = viewBox.trim().split(/[\s,]+/).map(Number);
  if (box && !transformed && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    const b = box as BBox;
    const fill = Math.max((b.x1 - b.x0) / vb[2], (b.y1 - b.y0) / vb[3]);
    const aspect = Math.max(vb[2] / vb[3], vb[3] / vb[2]);
    const squareFill = Math.min(aspect, 3) / aspect; // IconGlyph widens wide wordmarks up to 3x the tile
    if (fill < 0.5) problems.push(`tiny: drawing fills only ${Math.round(fill * 100)}% of the viewBox`);
    else if (body.includes('<image') && squareFill < 0.5) problems.push(`illegible: ${aspect.toFixed(1)}:1 image renders at only ~${Math.round(squareFill * 100)}% of its tile height`);
  }
  return { ok: problems.length === 0, problems, whiteShare: total ? white / total : 0, ...(box && !transformed ? { bbox: box as BBox } : {}) };
}
