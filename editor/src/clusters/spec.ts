import type { DiagramEdge, DiagramNode, DiagramNodeData, EdgeData, EdgeKind, ReplMode } from '../types';
import { absolutePosition, sortParentsFirst } from '../lib/graph';
import { ringLayout, ringRadius } from './layout';
import { NODE_H, NODE_W, HEADER_H, PAD, ROLE_H } from './builder';
import { defineParams, type ClusterProfile, type FieldSpec, type Generated } from './profiles/types';
import { CELL_H, CELL_W, GROUP_HEAD, GROUP_PAD, plural } from './profiles/shared';

type P = Record<string, unknown>;
type N<T> = number | ((p: T) => number);

/**
 * Declarative cluster profile: a handful of component rows / groups, link rules and validation rules are
 * enough to get a laid-out, validated, summarised cluster.
 */
export interface CompSpec<T extends P> {
  key: string;
  label: string | ((p: T) => string);
  count: N<T>;
  port?: number;
  iconId?: string;
  role?: string | ((i: number, n: number, p: T) => string | undefined);
  sub?: string | ((i: number, n: number, p: T) => string | undefined);
  /** plural noun for the auto summary (defaults to label + "s") */
  noun?: string;
  /** hide when false */
  show?: (p: T) => boolean;
}
export interface GroupSpec<T extends P> {
  key: string;
  label: string | ((p: T) => string);
  components: CompSpec<T>[];
  show?: (p: T) => boolean;
  layout?: 'rows' | 'ring' | ((p: T) => 'rows' | 'ring');
  /** spread this group's components over `p.azs` AZ sub-groups (round-robin) */
  azSpread?: boolean;
  stroke?: string;
  maxCols?: number;
}
export interface LinkSpec<T extends P> {
  from: string;
  to: string;
  mode: 'first-to-all' | 'all-to-first' | 'chain' | 'pair' | 'first-to-first' | 'all-to-all' | 'mesh' | 'ring';
  label?: string;
  kind?: EdgeKind;
  replMode?: ReplMode | ((p: T) => ReplMode);
  data?: Partial<EdgeData>;
  show?: (p: T) => boolean;
}
export type Rule<T extends P> = (p: T) => string | undefined;

export interface ClusterSpec<T extends P> {
  id: string;
  tech: string;
  label: string;
  iconId: string;
  accent: string;
  category: string;
  aliases?: string[];
  topologies: string[];
  roles: string[];
  fields: FieldSpec[];
  title?: (p: T) => string;
  topology?: string | ((p: T) => string);
  arrange?: 'rows' | 'columns';
  groups: GroupSpec<T>[];
  /** components drawn outside the cluster box (load balancers, proxies, exporters, clients) */
  externals?: CompSpec<T>[];
  links?: LinkSpec<T>[];
  rules?: Rule<T>[];
  summarize?: (p: T) => string;
}

export interface SpecProfile<T extends P = P> extends ClusterProfile<T> {
  category: string;
  aliases: string[];
}

const labelOf = <T extends P>(c: CompSpec<T>, p: T): string => (typeof c.label === 'function' ? c.label(p) : c.label);
const count = <T extends P>(c: CompSpec<T>, p: T): number => (c.show && !c.show(p) ? 0 : typeof c.count === 'function' ? c.count(p) : c.count);
const text = <V>(v: V | ((...a: never[]) => V) | undefined, ...a: unknown[]): V | undefined => (typeof v === 'function' ? (v as (...x: unknown[]) => V)(...a) : v);

/* ---- tiny helpers used by the spec files ---- */
export const num = (key: string, label: string, min: number, max: number, def: number, showIf?: (p: P) => boolean): FieldSpec => ({ key, type: 'number', label, min, max, default: def, ...(showIf ? { showIf } : {}) });
export const sel = (key: string, label: string, options: [string | number, string][], def: string | number, showIf?: (p: P) => boolean): FieldSpec => ({ key, type: 'select', label, default: def, options: options.map(([value, l]) => ({ value, label: l })), ...(showIf ? { showIf } : {}) });
export const bool = (key: string, label: string, def: boolean, showIf?: (p: P) => boolean): FieldSpec => ({ key, type: 'boolean', label, default: def, ...(showIf ? { showIf } : {}) });
export const azs = (): FieldSpec => num('azs', 'Racks / AZs', 1, 3, 1);
export const quorum = (key: string, label: string, def = 3): FieldSpec => sel(key, label, [[3, '3'], [5, '5'], [7, '7']], def);
export const comp = <T extends P>(key: string, label: CompSpec<T>['label'], n: N<T>, o: Partial<CompSpec<T>> = {}): CompSpec<T> => ({ key, label, count: n, ...o });
export const grp = <T extends P>(key: string, label: GroupSpec<T>['label'], components: CompSpec<T>[], o: Partial<GroupSpec<T>> = {}): GroupSpec<T> => ({ key, label, components, ...o });
export const lead = (i: number) => (i === 0 ? 'leader' : 'follower');
export const primary = (i: number) => (i === 0 ? 'primary' : 'replica');
/** rules */
export const oddRule = <T extends P>(what: string, get: (p: T) => number): Rule<T> => (p) => { const n = get(p); return n > 1 && n % 2 === 0 ? `Even number of ${what} (${n}): no more fault tolerant than ${n - 1}; use an odd number for quorum.` : undefined; };
export const minRule = <T extends P>(min: number, get: (p: T) => number, msg: string): Rule<T> => (p) => (get(p) < min ? msg : undefined);
export const when = <T extends P>(cond: (p: T) => boolean, msg: string | ((p: T) => string)): Rule<T> => (p) => (cond(p) ? (typeof msg === 'function' ? msg(p) : msg) : undefined);

/** Optional metrics-exporter sidecar: adds an "exporter" toggle, an external exporter node and a dashed scrape link to `target`. */
export function withExporter<T extends P>(spec: ClusterSpec<T>, o: { target: string; port: number; label?: string; iconId?: string }): ClusterSpec<T> {
  const label = o.label ?? 'exporter';
  const on = (p: T) => p.exporter === true;
  const inner = spec.summarize;
  const auto = (p: T) => defineSpecProfile({ ...spec, summarize: undefined }).summarize(p);
  return {
    ...spec,
    fields: [...spec.fields, bool('exporter', 'Metrics exporter sidecar', false)],
    externals: [...(spec.externals ?? []), comp('exporter', label, (p: T) => (on(p) ? 1 : 0), { port: o.port, iconId: o.iconId ?? 'prometheus' })],
    links: [...(spec.links ?? []), { from: 'exporter', to: o.target, mode: 'first-to-first', label: 'scrape', data: { strokeStyle: 'dashed' } as never }],
    summarize: (p: T) => `${(inner ?? auto)(p)}${on(p) ? ' · exporter' : ''}`,
  };
}

interface Placed {
  key: string;
  ids: string[];
}

/** Build a ClusterProfile from a declarative spec. */
export function defineSpecProfile<T extends P>(spec: ClusterSpec<T>): SpecProfile<T> {
  const { schema, defaults } = defineParams<T>(spec.fields);

  const validate = (p: T): string[] => (spec.rules ?? []).map((r) => r(p)).filter((x): x is string => !!x);
  const autoSummary = (p: T): string => {
    const parts: string[] = [];
    for (const g of spec.groups) {
      if (g.show && !g.show(p)) continue;
      for (const c of g.components) {
        const n = count(c, p);
        if (n > 0) parts.push(`${n} ${n === 1 ? labelOf(c, p) : c.noun ?? `${labelOf(c, p)}s`}`);
      }
    }
    if (typeof p.azs === 'number' && p.azs > 1) parts.push(`${p.azs} AZ`);
    return parts.join(' · ');
  };
  const summarize = (p: T): string => (spec.summarize ?? autoSummary)(p);

  const generate = (p: T, prefix: string): Generated => {
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];
    const placed = new Map<string, Placed>();
    const gid = (k: string) => `${prefix}-g-${k}`;
    const nid = (k: string, i: number) => `${prefix}-${k}-${i + 1}`;
    const compNode = (c: CompSpec<T>, i: number, n: number, parentId: string | undefined, at: { x: number; y: number }): DiagramNode => {
      const id = nid(c.key, i);
      const role = text<string | undefined>(c.role as never, i, n, p);
      const sub = text<string | undefined>(c.sub as never, i, n, p);
      const label = `${labelOf(c, p)}${n > 1 ? `-${i + 1}` : ''}${c.port ? ` :${c.port}` : ''}`;
      const arr = placed.get(c.key) ?? { key: c.key, ids: [] };
      arr.ids.push(id);
      placed.set(c.key, arr);
      return { id, type: 'icon', ...(parentId ? { parentId } : {}), position: at, width: NODE_W, height: role ? NODE_H + ROLE_H : NODE_H, data: { label, iconId: c.iconId ?? spec.iconId, ...(role ? { role } : {}), ...(sub ? { subtitle: sub } : {}), genPos: at } as DiagramNodeData };
    };

    // ---- lay out each group into a box ----
    interface Box { g: GroupSpec<T>; width: number; height: number; build: (origin: { x: number; y: number }) => DiagramNode[] }
    const boxes: Box[] = [];
    for (const g of spec.groups) {
      if (g.show && !g.show(p)) continue;
      const rowsOf = (comps: CompSpec<T>[]) => comps.map((c) => ({ c, n: count(c, p) })).filter((r) => r.n > 0);
      const rows = rowsOf(g.components);
      if (!rows.length) continue;
      const label = typeof g.label === 'function' ? g.label(p) : g.label;
      const maxCols = g.maxCols ?? 6;
      const stroke = g.stroke ?? spec.accent;
      const mkGroup = (id: string, lbl: string, parentId: string | undefined, at: { x: number; y: number }, size: { width: number; height: number }): DiagramNode => ({
        id, type: 'group', ...(parentId ? { parentId } : {}), position: at, width: size.width, height: size.height, style: { width: size.width, height: size.height },
        data: { label: lbl, strokeStyle: 'dashed', fillOpacity: 0, stroke, genPos: at } as DiagramNodeData,
      });

      if ((typeof g.layout === 'function' ? g.layout(p) : g.layout) === 'ring') {
        const all = rows.flatMap(({ c, n }) => Array.from({ length: n }, (_, i) => ({ c, i, n })));
        const radius = ringRadius(all.length, 150);
        const w = Math.ceil(radius * 2 + NODE_W + 60);
        const h = Math.ceil(radius * 2 + NODE_H + 40) + GROUP_HEAD;
        boxes.push({ g, width: w, height: h, build: (o) => {
          const out: DiagramNode[] = [mkGroup(gid(g.key), label, prefix, o, { width: w, height: h })];
          ringLayout(all.length, radius, { x: w / 2, y: GROUP_HEAD + radius + NODE_H / 2 + 10 }).forEach((pt, k) => out.push(compNode(all[k].c, all[k].i, all[k].n, gid(g.key), { x: pt.x - NODE_W / 2, y: pt.y - NODE_H / 2 })));
          return out;
        } });
        continue;
      }

      const nAz = g.azSpread && typeof p.azs === 'number' ? Math.max(1, p.azs as number) : 1;
      if (nAz > 1) {
        // columns per AZ; components distributed round-robin by index
        const cols: { c: CompSpec<T>; i: number; n: number }[][] = Array.from({ length: nAz }, () => []);
        for (const { c, n } of rows) for (let i = 0; i < n; i++) cols[i % nAz].push({ c, i, n });
        const colW = (items: typeof cols[number]) => Math.min(Math.max(1, items.length), 2) * CELL_W + GROUP_PAD * 2 - 24 + 24;
        const colH = (items: typeof cols[number]) => GROUP_HEAD + Math.ceil(Math.max(1, items.length) / 2) * CELL_H + GROUP_PAD;
        const widths = cols.map(colW);
        const w = widths.reduce((a, b) => a + b, 0) + GROUP_PAD * (nAz + 1);
        const h = GROUP_HEAD + Math.max(...cols.map(colH)) + GROUP_PAD;
        boxes.push({ g, width: w, height: h, build: (o) => {
          const out: DiagramNode[] = [mkGroup(gid(g.key), label, prefix, o, { width: w, height: h })];
          let x = GROUP_PAD;
          cols.forEach((items, j) => {
            const id = `${gid(g.key)}-az${j + 1}`;
            out.push(mkGroup(id, `AZ ${j + 1}`, gid(g.key), { x, y: GROUP_HEAD }, { width: widths[j], height: colH(items) }));
            items.forEach((it, k) => out.push(compNode(it.c, it.i, it.n, id, { x: GROUP_PAD - 12 + (k % 2) * CELL_W + (CELL_W - NODE_W) / 2 + 6, y: GROUP_HEAD + Math.floor(k / 2) * CELL_H })));
            x += widths[j] + GROUP_PAD;
          });
          return out;
        } });
        continue;
      }

      // plain rows: one row (wrapped at maxCols) per component type
      const rowHeights = rows.map(({ n }) => Math.ceil(n / maxCols) * CELL_H);
      const widest = Math.max(...rows.map(({ n }) => Math.min(n, maxCols)));
      const w = widest * CELL_W + GROUP_PAD * 2;
      const h = GROUP_HEAD + rowHeights.reduce((a, b) => a + b, 0) + GROUP_PAD - 18;
      boxes.push({ g, width: w, height: h, build: (o) => {
        const out: DiagramNode[] = [mkGroup(gid(g.key), label, prefix, o, { width: w, height: h })];
        let y = GROUP_HEAD;
        rows.forEach(({ c, n }, ri) => {
          for (let i = 0; i < n; i++) {
            const perRow = Math.min(n, maxCols);
            const col = i % maxCols;
            const rowLen = Math.min(maxCols, n - Math.floor(i / maxCols) * maxCols);
            void perRow;
            out.push(compNode(c, i, n, gid(g.key), { x: (w - rowLen * CELL_W) / 2 + col * CELL_W + (CELL_W - NODE_W) / 2, y: y + Math.floor(i / maxCols) * CELL_H }));
          }
          y += rowHeights[ri];
        });
        return out;
      } });
    }

    // ---- arrange boxes inside the cluster ----
    const columns = spec.arrange === 'columns';
    const innerW = columns ? boxes.reduce((s, b) => s + b.width, 0) + PAD * Math.max(0, boxes.length - 1) : Math.max(0, ...boxes.map((b) => b.width));
    const innerH = columns ? Math.max(0, ...boxes.map((b) => b.height)) : boxes.reduce((s, b) => s + b.height, 0) + PAD * Math.max(0, boxes.length - 1);
    const size = { width: Math.max(260, innerW + PAD * 2), height: HEADER_H + PAD + innerH + PAD };
    const warnings = validate(p);
    const topology = typeof spec.topology === 'function' ? spec.topology(p) : spec.topology;
    const root: DiagramNode = {
      id: prefix, type: 'cluster', position: { x: 0, y: 0 }, width: size.width, height: size.height, style: { width: size.width, height: size.height },
      data: { label: spec.title ? spec.title(p) : spec.label, subtitle: summarize(p), iconId: spec.iconId, accent: spec.accent, profileId: spec.id, params: p, warnings, ...(topology ? { topology } : {}), genPos: { x: 0, y: 0 } } as DiagramNodeData,
    };
    nodes.push(root);
    let cursorX = PAD + (columns ? 0 : 0);
    let cursorY = HEADER_H + PAD;
    for (const b of boxes) {
      const x = columns ? cursorX : PAD + (innerW - b.width) / 2;
      nodes.push(...b.build({ x, y: cursorY }));
      if (columns) cursorX += b.width + PAD;
      else cursorY += b.height + PAD;
    }

    // ---- externals (outside the cluster box, to the right) ----
    let ey = 0;
    const ex = size.width + 150;
    for (const c of spec.externals ?? []) {
      const n = count(c, p);
      for (let i = 0; i < n; i++) {
        nodes.push(compNode(c, i, n, undefined, { x: ex, y: ey }));
        ey += NODE_H + 36;
      }
    }

    // ---- links ----
    let ei = 0;
    const link = (a: string, b: string, l: LinkSpec<T>) => {
      const rm = typeof l.replMode === 'function' ? l.replMode(p) : l.replMode;
      edges.push({
        id: `${prefix}-e${++ei}`, source: a, target: b, ...(l.label ? { label: l.label } : {}),
        data: { generated: true, ...(l.kind ? { kind: l.kind } : {}), ...(rm ? { replMode: rm } : {}), ...(l.data ?? {}) } as EdgeData,
      });
    };
    for (const l of spec.links ?? []) {
      if (l.show && !l.show(p)) continue;
      const A = placed.get(l.from)?.ids ?? [];
      const B = placed.get(l.to)?.ids ?? [];
      if (!A.length || !B.length) continue;
      if (l.mode === 'first-to-all') B.forEach((b) => b !== A[0] && link(A[0], b, l));
      else if (l.mode === 'all-to-first') A.forEach((a) => a !== B[0] && link(a, B[0], l));
      else if (l.mode === 'chain') for (let i = 1; i < A.length; i++) link(A[i - 1], A[i], l);
      else if (l.mode === 'pair') A.forEach((a, i) => { const b = B[i % B.length]; if (a !== b) link(a, b, l); });
      else if (l.mode === 'first-to-first') link(A[0], B[0], l);
      else if (l.mode === 'ring') { for (let i = 1; i < A.length; i++) link(A[i - 1], A[i], l); if (A.length > 2) link(A[A.length - 1], A[0], l); }
      else if (l.mode === 'mesh') A.forEach((a, i) => A.slice(i + 1).forEach((b) => link(a, b, l)));
      else A.forEach((a) => B.forEach((b) => a !== b && link(a, b, l)));
    }

    // ---- pick connection handles from the final geometry ----
    const ordered = sortParentsFirst(nodes);
    const centre = new Map(ordered.map((n) => {
      const a = absolutePosition(ordered, n);
      return [n.id, { x: a.x + (n.width ?? NODE_W) / 2, y: a.y + (n.height ?? NODE_H) / 2 }];
    }));
    for (const e of edges) {
      const s = centre.get(e.source)!;
      const t = centre.get(e.target)!;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      if (Math.abs(dx) >= Math.abs(dy)) [e.sourceHandle, e.targetHandle] = dx >= 0 ? ['right', 'left'] : ['left', 'right'];
      else [e.sourceHandle, e.targetHandle] = dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
    }
    return { nodes: ordered, edges, rootId: prefix, size };
  };

  return {
    id: spec.id, tech: spec.tech, label: spec.label, iconId: spec.iconId, accent: spec.accent, roles: spec.roles, topologies: spec.topologies,
    fields: spec.fields, schema, defaults, generate, validate, summarize, category: spec.category,
    aliases: [`${spec.id} cluster`, `${spec.tech} cluster`, ...(spec.aliases ?? [])],
  };
}

export { plural };
