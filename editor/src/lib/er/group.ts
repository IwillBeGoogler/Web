import type { DiagramEdge, DiagramNode } from '../../types';
import { ACCENTS, tableOf } from './tableData';
import { GAP_Y } from './layout';
import { nodeSize } from '../graph';

const PAD = 24;
const HEAD = 40;
const BLOCK_GAP = 96;
const ASPECT = 2.6; // the canvas is wide; rows wrap late

/** Name prefix before the first `_` (not at the start), or '' when the name has none. */
export const tablePrefix = (name: string): string => { const i = name.indexOf('_'); return i > 0 ? name.slice(0, i) : ''; };

/** Most linked first, then whatever is most linked to what is already placed: neighbours end up next to each other. */
function orderByLinks<T>(items: T[], key: (t: T) => string, weight: (a: string, b: string) => number): T[] {
  const left = [...items];
  const out: T[] = [];
  const total = (t: T) => items.reduce((sum, o) => sum + (o === t ? 0 : weight(key(t), key(o))), 0);
  while (left.length) {
    const score = (t: T) => out.reduce((sum, o) => sum + weight(key(t), key(o)), 0);
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      const d = score(left[i]) - score(left[best]) || total(left[i]) - total(left[best]);
      if (d > 0) best = i;
    }
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

/** Columns of even width, each table dropped into the shortest one, so a tall table leaves no hole beside it. */
function masonry(ns: DiagramNode[]): { at: Map<string, { x: number; y: number }>; width: number; height: number } {
  const cols = Math.ceil(Math.sqrt(ns.length));
  const cw = Math.max(...ns.map((n) => nodeSize(n).width)) + GAP_Y;
  const tops = new Array<number>(cols).fill(0);
  const at = new Map<string, { x: number; y: number }>();
  for (const n of ns) {
    const c = tops.indexOf(Math.min(...tops));
    at.set(n.id, { x: c * cw, y: tops[c] });
    tops[c] += nodeSize(n).height + GAP_Y;
  }
  const used = tops.filter((t) => t > 0).length;
  return { at, width: used * cw - GAP_Y, height: Math.max(...tops) - GAP_Y };
}

/**
 * Tables sharing a prefix (>= 2 members, e.g. `dg_*`, `user_*`) go into a group node of their own, with one shared accent per
 * prefix. The groups and the block of remaining tables are packed into rows of a roughly screen-shaped area, the most related
 * ones side by side, which keeps relations short. Expects root-level nodes with absolute positions.
 */
export function groupByPrefix(nodes: DiagramNode[], idPrefix = '', edges: DiagramEdge[] = []): DiagramNode[] {
  const members = new Map<string, DiagramNode[]>();
  for (const n of nodes) {
    if (n.type !== 'table' || n.parentId) continue;
    const p = tablePrefix(tableOf(n).label);
    if (p) (members.get(p) ?? members.set(p, []).get(p)!).push(n);
  }
  const groups = [...members.entries()].filter(([, ns]) => ns.length >= 2).sort((a, b) => a[0].localeCompare(b[0]));
  if (!groups.length) return nodes;
  const taken = new Set(groups.flatMap(([, ns]) => ns.map((n) => n.id)));
  const rest = nodes.filter((n) => !taken.has(n.id) && !n.parentId);
  const roots = nodes.filter((n) => !n.parentId);
  const origin = { x: Math.min(...roots.map((n) => n.position.x)), y: Math.min(...roots.map((n) => n.position.y)) };

  const links = new Map<string, number>();
  const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const e of edges) links.set(pair(e.source, e.target), (links.get(pair(e.source, e.target)) ?? 0) + 1);
  const tableWeight = (a: string, b: string) => links.get(pair(a, b)) ?? 0;

  // a block is one group, or the tables without a group (key '')
  const blocks = [...(rest.length ? [['', rest] as [string, DiagramNode[]]] : []), ...groups].map(([prefix, ns]) => {
    const ordered = orderByLinks(ns, (n) => n.id, tableWeight);
    const m = masonry(ordered);
    const inset = prefix ? PAD : 0;
    return { prefix, ns, m, width: m.width + inset * 2, height: m.height + (prefix ? HEAD + PAD * 2 : 0) };
  });
  const blockOf = new Map(blocks.flatMap((b) => b.ns.map((n) => [n.id, b.prefix] as const)));
  const blockLinks = new Map<string, number>();
  for (const e of edges) {
    const [a, b] = [blockOf.get(e.source), blockOf.get(e.target)];
    if (a !== undefined && b !== undefined && a !== b) blockLinks.set(pair(a, b), (blockLinks.get(pair(a, b)) ?? 0) + 1);
  }
  const ordered = orderByLinks(blocks, (b) => b.prefix, (a, b) => blockLinks.get(pair(a, b)) ?? 0);
  const area = blocks.reduce((sum, b) => sum + (b.width + BLOCK_GAP) * (b.height + BLOCK_GAP), 0);
  const rowWidth = Math.max(Math.sqrt(area * ASPECT), ...blocks.map((b) => b.width));

  const out = new Map<string, DiagramNode>();
  const boxes: DiagramNode[] = [];
  let x = origin.x;
  let y = origin.y;
  let rowHeight = 0;
  for (const b of ordered) {
    if (x > origin.x && x - origin.x + b.width > rowWidth) { x = origin.x; y += rowHeight + BLOCK_GAP; rowHeight = 0; }
    if (b.prefix) {
      const id = `${idPrefix}grp_${b.prefix}`;
      const accent = ACCENTS[groups.findIndex(([p]) => p === b.prefix) % ACCENTS.length];
      for (const n of b.ns) {
        const p = b.m.at.get(n.id)!;
        out.set(n.id, { ...n, parentId: id, position: { x: PAD + p.x, y: HEAD + PAD + p.y }, data: { ...n.data, accent } as unknown as DiagramNode['data'] });
      }
      boxes.push({ id, type: 'group', position: { x, y }, width: b.width, height: b.height, style: { width: b.width, height: b.height }, data: { label: b.prefix, variant: 'card' } as unknown as DiagramNode['data'] });
    } else {
      for (const n of b.ns) {
        const p = b.m.at.get(n.id)!;
        out.set(n.id, { ...n, position: { x: x + p.x, y: y + p.y } });
      }
    }
    x += b.width + BLOCK_GAP;
    rowHeight = Math.max(rowHeight, b.height);
  }
  // parents first, so a group always precedes its children
  return [...boxes, ...nodes.map((n) => out.get(n.id) ?? n)];
}
