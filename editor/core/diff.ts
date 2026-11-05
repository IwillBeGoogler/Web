/** Structural diff helpers shared by the review panel, the Markdown change report and tests. No AI: plain comparison. */
import type { CNode, CPage } from './types';

type Rec = { id: string; [k: string]: any };
export interface PropChange { path: string; from: unknown; to: unknown; text: string }
export interface DiffLike {
  nameChanged?: { from: string; to: string } | null;
  nodes: { added: Rec[]; removed: Rec[]; changed: { id: string; before: Rec; after: Rec; fields: string[] }[] };
  edges: { added: Rec[]; removed: Rec[]; changed: { id: string; before: Rec; after: Rec; fields: string[] }[] };
}

const TRANSIENT = new Set(['selected', 'dragging', 'measured', 'resizing', 'positionAbsolute', 'internals', 'style', 'width', 'height', 'zIndex', 'draggable', 'deletable', 'selectable', 'connectable']);
const EDGE_RENDER = new Set(['type', 'markerStart', 'markerEnd', 'labelStyle', 'labelShowBg', 'labelBgStyle', 'labelBgPadding', 'pathOptions', 'animated', 'className', 'interactionWidth']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const show = (v: unknown): string => (typeof v === 'string' ? `“${v}”` : v === undefined ? '(none)' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const round = (p: any) => (p ? { x: Math.round(p.x), y: Math.round(p.y) } : p);

function describe(path: string, from: unknown, to: unknown): string {
  const name = path.replace(/^data\./, '');
  if (from === undefined) return `${name}: added ${show(to)}`;
  if (to === undefined) return `${name}: removed (was ${show(from)})`;
  return `${name}: ${show(from)} → ${show(to)}`;
}

/** property-level changes of a node or an edge (position counts, sizes and render styling do not) */
export function propChanges(before: Rec, after: Rec): PropChange[] {
  const out: PropChange[] = [];
  const add = (path: string, from: unknown, to: unknown, text?: string) => out.push({ path, from, to, text: text ?? describe(path, from, to) });
  const isEdge = 'source' in before || 'source' in after;
  if (!same(round(before.position), round(after.position)) && !isEdge) add('position', round(before.position), round(after.position), `moved ${JSON.stringify(round(before.position))} → ${JSON.stringify(round(after.position))}`);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (k === 'id' || k === 'position' || k === 'data' || TRANSIENT.has(k) || (isEdge && EDGE_RENDER.has(k))) continue;
    if (!same(before[k], after[k])) add(k, before[k], after[k]);
  }
  const da = (isObj(before.data) ? before.data : {}) as Record<string, any>;
  const db = (isObj(after.data) ? after.data : {}) as Record<string, any>;
  for (const k of new Set([...Object.keys(da), ...Object.keys(db)])) {
    if (same(da[k], db[k])) continue;
    if (k === 'columns' && Array.isArray(da[k] ?? []) && Array.isArray(db[k] ?? [])) {
      const ca = new Map<string, any>((da[k] ?? []).map((c: any) => [c.name, c]));
      const cb = new Map<string, any>((db[k] ?? []).map((c: any) => [c.name, c]));
      for (const [n, c] of ca) if (!cb.has(n)) add(`columns.${n}`, c, undefined, `column removed: ${n} ${c.type ?? ''}`.trim());
      for (const [n, c] of cb) {
        const o = ca.get(n);
        if (!o) add(`columns.${n}`, undefined, c, `column added: ${n} ${c.type ?? ''}`.trim());
        else for (const f of new Set([...Object.keys(o), ...Object.keys(c)])) if (f !== 'id' && !same(o[f], c[f])) add(`columns.${n}.${f}`, o[f], c[f], `column ${n}.${f}: ${show(o[f])} → ${show(c[f])}`);
      }
    } else if (isEdge && k === 'relation' && isObj(da[k]) && isObj(db[k])) {
      for (const f of new Set([...Object.keys(da[k] as object), ...Object.keys(db[k] as object)])) if (!same((da[k] as any)[f], (db[k] as any)[f])) add(`relation.${f}`, (da[k] as any)[f], (db[k] as any)[f]);
    } else if (isEdge && EDGE_RENDER.has(k)) continue;
    else if (isEdge && ['startMarker', 'endMarker', 'strokeStyle', 'dashed', 'arrows'].includes(k)) add(`data.${k}`, da[k], db[k]);
    else if (!(isEdge && k === 'relation')) add(`data.${k}`, da[k], db[k]);
  }
  return out;
}

/**
 * Re-key `other` so that comparing it with `base` is meaningful across two files: nodes keep their id when `base` has the same id,
 * otherwise they take the id of the single base node with the same type and label (ambiguous labels are not matched).
 * Edge endpoints follow. The inputs are not modified.
 */
export function alignIds(base: CPage, other: CPage): CPage {
  const baseIds = new Set(base.nodes.map((n) => n.id));
  const key = (n: CNode) => `${n.type}\u0000${String(n.data.label ?? '').trim().toLowerCase()}`;
  const byKey = new Map<string, CNode[]>();
  for (const n of base.nodes) byKey.set(key(n), [...(byKey.get(key(n)) ?? []), n]);
  const otherByKey = new Map<string, number>();
  for (const n of other.nodes) if (!baseIds.has(n.id)) otherByKey.set(key(n), (otherByKey.get(key(n)) ?? 0) + 1);
  const otherIds = new Set(other.nodes.map((n) => n.id));
  const map = new Map<string, string>();
  const taken = new Set(other.nodes.filter((n) => baseIds.has(n.id)).map((n) => n.id));
  for (const n of other.nodes) {
    if (baseIds.has(n.id)) continue;
    const cands = (byKey.get(key(n)) ?? []).filter((b) => !otherIds.has(b.id) || b.id === n.id);
    if (cands.length === 1 && otherByKey.get(key(n)) === 1 && !taken.has(cands[0].id)) {
      map.set(n.id, cands[0].id);
      taken.add(cands[0].id);
    }
  }
  const re = (id: string) => map.get(id) ?? id;
  // edges: same (re-keyed) endpoints and label take the id of the base edge, when that is unambiguous
  const ek = (e: { source: string; target: string; label?: string }) => `${e.source}\u0000${e.target}\u0000${e.label ?? ''}`;
  const baseEdges = new Map<string, string[]>();
  for (const e of base.edges) baseEdges.set(ek(e), [...(baseEdges.get(ek(e)) ?? []), e.id]);
  const baseEdgeIds = new Set(base.edges.map((e) => e.id));
  const edges = other.edges.map((e) => ({ ...e, source: re(e.source), target: re(e.target) }));
  const counts = new Map<string, number>();
  for (const e of edges) counts.set(ek(e), (counts.get(ek(e)) ?? 0) + 1);
  const usedEdge = new Set(edges.filter((e) => baseEdgeIds.has(e.id)).map((e) => e.id));
  for (const e of edges) {
    if (baseEdgeIds.has(e.id)) continue;
    const c = baseEdges.get(ek(e));
    if (c?.length === 1 && counts.get(ek(e)) === 1 && !usedEdge.has(c[0])) { e.id = c[0]; usedEdge.add(c[0]); }
  }
  return {
    ...structuredClone(other),
    nodes: other.nodes.map((n) => structuredClone({ ...n, id: re(n.id), ...(n.parentId ? { parentId: re(n.parentId) } : {}) })),
    edges: structuredClone(edges),
  };
}

const md = (s: unknown): string => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lineOf = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

export interface ReportOptions {
  title: string;
  from: string;
  to: string;
  /** nodes of both sides, to print endpoint names of edges */
  nodes?: Rec[];
  /** review comments: nodeId points at a node of the diff */
  comments?: { nodeId?: string; author: string; body: string }[];
}

/** Markdown change report of a diff (what a reviewer pastes into a pull request) */
export function diffReport(diff: DiffLike, o: ReportOptions): string {
  const name = new Map<string, string>();
  for (const n of [...(o.nodes ?? []), ...diff.nodes.added, ...diff.nodes.removed, ...diff.nodes.changed.flatMap((c) => [c.before, c.after])]) if (!name.has(n.id)) name.set(n.id, String(n.data?.label || n.id));
  const nm = (id: string) => name.get(id) ?? id;
  const icon = (r: Rec) => (r.data?.iconId ?? r.data?.groupIcon ? `, ${r.data.iconId ?? r.data.groupIcon}` : '');
  const nodeLine = (r: Rec) => `- **${md(r.data?.label || r.id)}** (\`${r.id}\`${icon(r)})`;
  const edgeText = (e: Rec) => `**${md(nm(e.source))}** → **${md(nm(e.target))}**${e.label ? ` “${md(e.label)}”` : ''}`;
  const add = diff.nodes.added.length + diff.edges.added.length;
  const rem = diff.nodes.removed.length + diff.edges.removed.length;
  const chg = diff.nodes.changed.length + diff.edges.changed.length;
  const out = [`# Change report: ${md(o.title)}`, '', `Comparing **${md(o.from)}** → **${md(o.to)}**`, ''];
  out.push(add || rem || chg || diff.nameChanged ? `Summary: ${[add && `${add} added`, rem && `${rem} removed`, chg && `${chg} changed`].filter(Boolean).join(', ') || 'renamed only'}` : 'No differences.', '');
  if (diff.nameChanged) out.push(`Renamed “${md(diff.nameChanged.from)}” → “${md(diff.nameChanged.to)}”`, '');
  if (diff.nodes.added.length) out.push('## Added', '', ...diff.nodes.added.map(nodeLine), '');
  if (diff.nodes.removed.length) out.push('## Removed', '', ...diff.nodes.removed.map(nodeLine), '');
  if (diff.nodes.changed.length) {
    out.push('## Changed', '');
    for (const c of diff.nodes.changed) {
      out.push(`### ${md(c.after.data?.label || c.id)} (\`${c.id}\`)`, '', '| Property | Before | After |', '|---|---|---|');
      for (const p of propChanges(c.before, c.after)) {
        const short = p.path.replace(/^data\./, '');
        out.push(`| ${md(short)} | ${md(p.from === undefined ? '' : typeof p.from === 'object' ? JSON.stringify(p.from) : p.from)} | ${md(p.to === undefined ? '' : typeof p.to === 'object' ? JSON.stringify(p.to) : p.to)} |`);
      }
      out.push('');
    }
  }
  if (diff.edges.added.length + diff.edges.removed.length + diff.edges.changed.length) {
    out.push('## Connections', '');
    for (const e of diff.edges.added) out.push(`- Added: ${edgeText(e)}`);
    for (const e of diff.edges.removed) out.push(`- Removed: ${edgeText(e)}`);
    for (const c of diff.edges.changed) out.push(`- Changed: ${edgeText(c.after)} (${propChanges(c.before, c.after).map((p) => lineOf(p.text)).join('; ')})`);
    out.push('');
  }
  if (o.comments?.length) {
    out.push('## Comments', '');
    for (const c of o.comments) out.push(`- **${md(c.author)}**${c.nodeId ? ` on *${md(nm(c.nodeId))}*` : ''}: ${lineOf(c.body)}`);
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
