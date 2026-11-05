import type { DiagramEdge, DiagramNode } from '../types';
import { absolutePosition, nodeSize } from './graph';
import { isDarkBackground } from './contrast';

/**
 * Tiny SVG preview of a page (project cards, template gallery). Pure and deterministic.
 * `background`: the page's own canvas colour (a hex); a dark one is painted so a dark page is not shown as light marks on white.
 */
export function buildThumbnail(nodes: DiagramNode[], edges: DiagramEdge[], size: { width: number; height: number }, pad = 10, background?: string): string {
  const { width: W, height: H } = size;
  const bg = background && /^#[0-9a-f]{6}$/i.test(background) ? background : null;
  const dark = !!bg && isDarkBackground(bg);
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-hidden="true">${bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ''}`;
  if (!nodes.length) return `${head}</svg>`;
  const rects = nodes.map((n) => {
    const p = absolutePosition(nodes, n);
    const s = nodeSize(n);
    return { n, x: p.x, y: p.y, w: s.width, h: s.height };
  });
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const scale = Math.min((W - pad * 2) / Math.max(1, maxX - minX), (H - pad * 2) / Math.max(1, maxY - minY));
  const ox = (W - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (H - (maxY - minY) * scale) / 2 - minY * scale;
  const f = (v: number) => Math.round(v * 10) / 10;
  const byId = new Map(rects.map((r) => [r.n.id, r]));
  const parts: string[] = [];
  const isBox = (t: string | undefined) => t === 'group' || t === 'cluster' || t === 'frame';
  for (const r of rects.filter((r) => isBox(r.n.type)))
    parts.push(`<rect data-node="${r.n.id}" x="${f(r.x * scale + ox)}" y="${f(r.y * scale + oy)}" width="${f(r.w * scale)}" height="${f(r.h * scale)}" rx="3" fill="none" stroke="${r.n.type === 'frame' ? '#a5a5f5' : dark ? '#b6bdcb' : '#8a93a3'}" stroke-width="0.8"${r.n.type === 'frame' ? '' : ' stroke-dasharray="3 2"'}/>`);
  for (const e of edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    parts.push(`<line data-edge="${e.id}" x1="${f((a.x + a.w / 2) * scale + ox)}" y1="${f((a.y + a.h / 2) * scale + oy)}" x2="${f((b.x + b.w / 2) * scale + ox)}" y2="${f((b.y + b.h / 2) * scale + oy)}" stroke="${e.data?.color && /^#[0-9a-f]{3,8}$/i.test(e.data.color) ? e.data.color : '#94a3b8'}" stroke-width="0.9"/>`);
  }
  for (const r of rects.filter((r) => !isBox(r.n.type))) {
    const own = typeof r.n.data.fill === 'string' && /^#[0-9a-f]{3,8}$/i.test(r.n.data.fill) ? r.n.data.fill : null;
    const fill = r.n.type === 'sticky' ? own ?? '#fde68a' : r.n.type === 'text' ? (dark ? '#6b7385' : '#cbd5e1') : dark ? own ?? '#a5b4fc' : '#6366f1';
    const k = r.n.type === 'sticky' ? 0.9 : 0.55;
    const w = Math.max(3, r.w * scale * k);
    const h = Math.max(3, r.h * scale * k);
    parts.push(`<rect data-node="${r.n.id}" x="${f((r.x + r.w / 2) * scale + ox - w / 2)}" y="${f((r.y + r.h / 2) * scale + oy - h / 2)}" width="${f(w)}" height="${f(h)}" rx="2" fill="${fill}" fill-opacity="0.85"/>`);
  }
  return `${head}${parts.join('')}</svg>`;
}
