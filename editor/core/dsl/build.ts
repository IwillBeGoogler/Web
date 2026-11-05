import { resolveIcon } from '../catalog';
import { applyLayout, absRects } from '../layout';
import { nodeSize, type CEdge, type CNode, type CPage } from '../types';
import { applyUml } from './build2';
import { ownedArchEdges, ownedArchNodes } from './print';
import type { Diagnostic, DslDoc, DslRefEnd, DslSeq, DslSeqItem, DslTable } from './types';

export interface BuildResult { page: CPage; diagnostics: Diagnostic[]; added: string[]; removed: string[] }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const uniq = (base: string, taken: Set<string>) => { let id = base; for (let i = 2; taken.has(id); i++) id = `${base}-${i}`; taken.add(id); return id; };

// --- ER geometry (mirrors src/lib/er/geometry.ts) ---
const ER = { headerH: 40, rowH: 28, bottomPad: 6, minW: 220, maxW: 400, charW: 7.1, footerLine: 18, footerPad: 10 };
export function tableSizeOf(d: { label: string; schema?: string; columns: any[]; indexes?: any[]; checks?: any[] }): { width: number; height: number } {
  let w = (d.schema ? d.schema.length + 1 : 0) * ER.charW + d.label.length * 8 + 110;
  for (const c of d.columns) w = Math.max(w, (c.name.length + Math.min(String(c.type ?? '').length, 22)) * ER.charW + 96);
  const width = Math.round(Math.min(ER.maxW, Math.max(ER.minW, w)) / 10) * 10;
  const n = (d.indexes?.length ?? 0) + (d.checks?.length ?? 0);
  const lines = n <= 5 ? n : 6;
  return { width, height: ER.headerH + Math.max(1, d.columns.length) * ER.rowH + ER.bottomPad + (lines ? ER.footerPad + lines * ER.footerLine : 0) };
}
/** rough size of a sequence node (the client recomputes the exact one with its layout engine) */
export function seqSizeOf(d: { participants: any[]; items: any[] }): { width: number; height: number } {
  let rows = 0;
  const walk = (items: any[]) => { for (const it of items) { rows++; if (it.type === 'fragment') for (const s of it.sections) { rows++; walk(s.items); } } };
  walk(d.items);
  return { width: Math.max(320, d.participants.length * 170 + 40), height: 120 + rows * 46 };
}

/** exact size of a timing node (mirrors src/lib/timing/layout.ts `timingSize`) */
export function timingSizeOf(d: { lifelines: { kind: string; states: unknown[] }[] }): { width: number; height: number } {
  const rows = d.lifelines.reduce((n, l) => n + (l.kind === 'robust' ? Math.max(2, l.states.length) * 20 + 12 : l.kind === 'binary' ? 56 : 40) + 8, 0);
  return { width: 16 + 120 + 560 + 32, height: 16 + 28 + rows + 36 + 12 };
}

const REL_COLOR = '#7b8499';
function relationEnds(r: { cardinality: string; optional: boolean }): { start: string; end: string } {
  const one = r.optional ? 'zeroOrOne' : 'one';
  switch (r.cardinality) {
    case '1:1': return { start: one, end: 'zeroOrOne' };
    case '1:N': return { start: one, end: 'zeroOrMany' };
    case 'N:1': return { start: 'zeroOrMany', end: one };
    default: return { start: 'zeroOrMany', end: 'zeroOrMany' };
  }
}

function seqItems(items: DslSeqItem[], counter: { m: number; n: number; f: number; s: number }): any[] {
  return items.map((it) => {
    if (it.type === 'message') return { type: 'message', id: `m${++counter.m}`, from: it.from, to: it.to, text: it.text, kind: it.kind };
    if (it.type === 'note') return { type: 'note', id: `n${++counter.n}`, text: it.text, over: it.over, ...(it.side ? { side: it.side } : {}) };
    const id = `f${++counter.f}`;
    return { type: 'fragment', id, op: it.op, sections: it.sections.map((s) => ({ id: `s${++counter.s}`, guard: s.guard, items: seqItems(s.items, counter) })) };
  });
}

/** Merge a parsed document into a page: existing ids keep their position, size and every property the text does not express. */
export function applyDoc(existing: CPage | undefined, doc: DslDoc, opts: { layout?: boolean } = {}): BuildResult {
  const diagnostics: Diagnostic[] = [];
  const page: CPage = existing ? structuredClone(existing) : { id: 'page-1', name: doc.title ?? 'Page 1', nodes: [], edges: [] };
  if (doc.title && existing) page.name = existing.name; // the page name belongs to the file, not to the text
  const added = new Set<string>();
  const removed: string[] = [];
  const fresh = new Set<string>(); // nodes that need a position
  const hadContent = page.nodes.length > 0;
  const warn = (line: number, message: string) => diagnostics.push({ line, col: 1, message, severity: 'warning' });
  const err = (line: number, message: string) => diagnostics.push({ line, col: 1, message, severity: 'error' });

  // ---------- architecture ----------
  const owned = ownedArchNodes(page);
  const ownedIds = new Set(owned.map((n) => n.id));
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const dslIds = new Set(doc.nodes.map((n) => n.id));
  for (const dn of doc.nodes) {
    const other = byId.get(dn.id);
    if (other && !ownedIds.has(dn.id)) { err(dn.line, `id "${dn.id}" is used by a node the text cannot edit (${other.type})`); continue; }
    if (dn.parent && !dslIds.has(dn.parent)) { err(dn.line, `unknown parent "${dn.parent}"`); continue; }
    let hit = dn.icon ? resolveIcon(dn.icon) : undefined;
    if (dn.icon && !hit) warn(dn.line, `unknown icon "${dn.icon}" (autocomplete lists the catalog)`);
    if (hit?.kind === 'cluster') { warn(dn.line, `"${dn.icon}" is a cluster profile; use an icon id`); hit = undefined; }
    const type = dn.kind === 'group' ? 'group' : 'icon';
    let n = other;
    if (!n) {
      n = { id: dn.id, type, position: { x: 0, y: 0 }, data: { label: dn.label } };
      if (type === 'group') { n.width = 360; n.height = 240; }
      page.nodes.push(n);
      byId.set(n.id, n);
      added.add(n.id);
      fresh.add(n.id);
    } else if (n.type !== type) {
      n.type = type;
      if (type === 'group') { n.width = n.width ?? 360; n.height = n.height ?? 240; }
    }
    n.data.label = dn.label;
    if (dn.sub) n.data.subtitle = dn.sub; else delete n.data.subtitle;
    const key = type === 'group' ? 'groupIcon' : 'iconId';
    delete n.data[key === 'iconId' ? 'groupIcon' : 'iconId'];
    if (hit) n.data[key] = hit.id; else delete n.data[key];
    if ((n.parentId ?? undefined) !== dn.parent) {
      if (dn.parent) n.parentId = dn.parent; else delete n.parentId;
      if (!added.has(n.id)) fresh.add(n.id); // moved into / out of a group: place it again
    }
  }
  for (const n of owned) if (!dslIds.has(n.id)) removed.push(n.id);

  // edges: k-th text edge between a pair keeps the k-th existing edge between that pair
  const oldEdges = new Map<string, CEdge[]>();
  for (const e of ownedArchEdges(existing ? { ...page, nodes: existing.nodes, edges: page.edges } : page)) oldEdges.set(`${e.source}|${e.target}`, [...(oldEdges.get(`${e.source}|${e.target}`) ?? []), e]);
  const keepEdge = new Set<string>();
  const edgeIds = new Set(page.edges.map((e) => e.id));
  const seenPair = new Map<string, number>();
  for (const de of doc.edges) {
    if (!byId.has(de.from) || !byId.has(de.to)) continue;
    const key = `${de.from}|${de.to}`;
    const k = seenPair.get(key) ?? 0;
    seenPair.set(key, k + 1);
    let e = oldEdges.get(key)?.[k];
    if (!e) {
      e = { id: uniq(`e-${de.from}-${de.to}`, edgeIds), source: de.from, target: de.to };
      page.edges.push(e);
      added.add(e.id);
    }
    keepEdge.add(e.id);
    if (de.label) e.label = de.label; else delete e.label;
    const data = { ...(e.data ?? {}) };
    if (de.arrow === '--') data.arrows = 'none'; else if (de.arrow === '<->') data.arrows = 'both'; else if (de.arrow === '<-') data.arrows = 'start'; else delete data.arrows;
    if (de.attrs.preset) data.preset = de.attrs.preset; else delete data.preset;
    if (de.attrs.dashed) { data.dashed = true; data.strokeStyle = 'dashed'; } else { delete data.dashed; if (data.strokeStyle === 'dashed') delete data.strokeStyle; }
    if (de.attrs.color) data.color = de.attrs.color;
    else if (!de.attrs.preset && data.color && existing?.edges.find((x) => x.id === e!.id)?.data?.preset) delete data.color;
    if (Object.keys(data).length) e.data = data; else delete e.data;
  }
  for (const list of oldEdges.values()) for (const e of list) if (!keepEdge.has(e.id)) removed.push(e.id);

  // ---------- ER ----------
  const tableNodes = page.nodes.filter((n) => n.type === 'table');
  const tableByName = new Map(tableNodes.map((n) => [n.data.label as string, n]));
  const dslTableNames = new Set(doc.tables.map((t) => t.name));
  const nodeIds = new Set(page.nodes.map((n) => n.id));
  const newTables: CNode[] = [];
  const resolved: { dt: DslTable; node: CNode }[] = [];
  for (const dt of doc.tables) {
    let node = tableByName.get(dt.name);
    if (!node) {
      const id = uniq(`tbl-${slug(dt.name)}`, nodeIds);
      node = { id, type: 'table', position: { x: 0, y: 0 }, data: { label: dt.name, columns: [], indexes: [], checks: [], accent: '#2f6fdb', collapsed: false } };
      page.nodes.push(node);
      newTables.push(node);
      added.add(id);
      fresh.add(id);
    }
    resolved.push({ dt, node });
  }
  for (const n of tableNodes) if (!dslTableNames.has(n.data.label)) removed.push(n.id);
  const nodeOf = new Map(resolved.map((r) => [r.dt.name, r.node]));

  // relations from inline refs + standalone refs, normalized to child -> parent
  interface Rel { child: DslRefEnd; parent: DslRefEnd; card: '1:N' | '1:1' | 'N:M'; attrs: Record<string, string> }
  const rels: Rel[] = [];
  const norm = (a: DslRefEnd, op: string, b: DslRefEnd, attrs: Record<string, string>): Rel => (op === '<' ? { child: b, parent: a, card: '1:N', attrs } : op === '-' ? { child: a, parent: b, card: '1:1', attrs } : op === '<>' ? { child: a, parent: b, card: 'N:M', attrs } : { child: a, parent: b, card: '1:N', attrs });
  for (const dt of doc.tables) for (const c of dt.columns) if (c.ref) rels.push(norm({ table: dt.name, column: c.name }, c.ref.op, c.ref.to, {}));
  for (const r of doc.refs) rels.push(norm(r.from, r.op, r.to, r.attrs));
  const fkOf = new Map<string, Rel>(); // `${table}.${col}` -> relation where it is the FK column
  for (const r of rels) if (r.card !== 'N:M') fkOf.set(`${r.child.table}.${r.child.column}`, r);

  for (const { dt, node } of resolved) {
    const oldCols = new Map<string, any>((node.data.columns ?? []).map((c: any) => [c.name, c]));
    let nextId = 0;
    for (const c of oldCols.values()) { const m = /^c(\d+)$/.exec(c.id); if (m) nextId = Math.max(nextId, Number(m[1]) + 1); }
    const cols = dt.columns.map((c) => {
      const old = oldCols.get(c.name);
      const col: any = { ...(old ?? {}), id: old?.id ?? `c${nextId++}`, name: c.name, type: c.type, pk: c.pk, unique: c.unique && !c.pk, nullable: dt.kind === 'enum' ? false : !c.notNull && !c.pk };
      if (c.default !== undefined) col.default = c.default; else delete col.default;
      if (c.increment) col.generated = 'autoincrement'; else if (col.generated === 'autoincrement') delete col.generated;
      if (c.note) col.comment = c.note; else delete col.comment;
      const rel = fkOf.get(`${dt.name}.${c.name}`);
      if (rel && nodeOf.has(rel.parent.table)) col.fk = { ...(old?.fk ?? {}), table: rel.parent.table, column: rel.parent.column, ...(rel.attrs.delete ? { onDelete: rel.attrs.delete.toUpperCase() } : {}), ...(rel.attrs.update ? { onUpdate: rel.attrs.update.toUpperCase() } : {}) };
      else delete col.fk;
      return col;
    });
    node.data.columns = cols;
    node.data.tableKind = dt.kind;
    node.data.indexes = dt.indexes.map((ix) => ({ ...(ix.name ? { name: ix.name } : {}), columns: ix.columns, unique: ix.unique }));
    if (dt.note) node.data.comment = dt.note; else delete node.data.comment;
    const size = tableSizeOf(node.data as never);
    node.width = size.width;
    node.height = size.height;
  }

  const relEdgeIds = new Set(page.edges.map((e) => e.id));
  const oldRel = new Map<string, CEdge>();
  const oldRelAll = page.edges.filter((e) => e.data?.relation && !e.data.relation.group);
  const colName = (n: CNode | undefined, id: string | undefined) => (n?.data.columns ?? []).find((c: any) => c.id === id)?.name;
  const nodeById2 = new Map(page.nodes.map((n) => [n.id, n]));
  for (const e of oldRelAll) {
    const child = nodeById2.get(e.target);
    const parent = nodeById2.get(e.source);
    const cn = colName(child, e.data!.relation.toCol);
    oldRel.set(`${parent?.data.label}|${child?.data.label}|${cn ?? ''}`, e);
  }
  const keepRel = new Set<string>();
  for (const r of rels) {
    const child = nodeOf.get(r.child.table);
    const parent = nodeOf.get(r.parent.table);
    if (!child || !parent) continue;
    const cc = (child.data.columns as any[]).find((c) => c.name === r.child.column);
    const pc = (parent.data.columns as any[]).find((c) => c.name === r.parent.column);
    if (!cc || !pc) continue;
    const key = `${r.parent.table}|${r.child.table}|${r.card === 'N:M' ? '' : r.child.column}`;
    let e = oldRel.get(key);
    const relation = { ...(e?.data?.relation ?? {}), fromCol: pc.id, toCol: cc.id, cardinality: r.card, identifying: !!cc.pk, optional: r.card === 'N:M' ? false : cc.nullable && !cc.pk };
    if (r.card === 'N:M') { delete (relation as any).fromCol; delete (relation as any).toCol; }
    const ends = relationEnds(relation);
    if (!e) {
      e = { id: uniq(`rel-${slug(r.parent.table)}-${slug(r.child.table)}-${slug(r.child.column)}`, relEdgeIds), source: parent.id, target: child.id };
      page.edges.push(e);
      added.add(e.id);
    }
    e.data = { ...(e.data ?? {}), relation, color: e.data?.color ?? REL_COLOR, arrows: 'none', startMarker: ends.start, endMarker: ends.end, strokeStyle: relation.identifying ? 'solid' : 'dashed', dashed: !relation.identifying };
    keepRel.add(e.id);
  }
  for (const e of oldRelAll) if (!keepRel.has(e.id) && (!nodeById2.get(e.source) || dslTableNames.has(nodeById2.get(e.source)!.data.label) || !dslTableNames.size || true)) removed.push(e.id);

  // ---------- sequences ----------
  const seqNodes = page.nodes.filter((n) => n.type === 'sequence');
  const dslSeqIds = new Set(doc.seqs.map((s) => s.id));
  const matchedSeq = new Set<string>();
  for (const ds of doc.seqs) {
    let node = seqNodes.find((n) => n.id === ds.id && !matchedSeq.has(n.id)) ?? seqNodes.find((n) => n.data.label === ds.title && !matchedSeq.has(n.id) && !dslSeqIds.has(n.id));
    const counter = { m: 0, n: 0, f: 0, s: 0 };
    const data = { label: ds.title, accent: node?.data.accent ?? '#2f6fdb', participants: ds.participants, items: seqItems(ds.items, counter), autonumber: ds.autonumber };
    if (!node) {
      node = { id: uniq(ds.id, nodeIds), type: 'sequence', position: { x: 0, y: 0 }, data };
      page.nodes.push(node);
      added.add(node.id);
      fresh.add(node.id);
    } else node.data = { ...node.data, ...data };
    matchedSeq.add(node.id);
    const size = seqSizeOf(node.data as never);
    node.width = size.width;
    node.height = size.height;
  }
  for (const n of seqNodes) if (!matchedSeq.has(n.id)) removed.push(n.id);

  // ---------- timing diagrams ----------
  const tmNodes = page.nodes.filter((n) => n.type === 'timing');
  const dslTmIds = new Set(doc.timings.map((x) => x.id));
  const matchedTm = new Set<string>();
  for (const dt of doc.timings) {
    let node = tmNodes.find((n) => n.id === dt.id && !matchedTm.has(n.id)) ?? tmNodes.find((n) => n.data.label === dt.title && !matchedTm.has(n.id) && !dslTmIds.has(n.id));
    const maxT = Math.max(0, ...dt.changes.map((c) => c.t), ...dt.messages.map((m) => m.t2 ?? m.t), ...dt.constraints.map((c) => c.t2));
    const data = {
      label: dt.title, accent: node?.data.accent ?? '#c2410c', unit: dt.unit, end: dt.end ?? (maxT > 0 ? maxT : 100),
      lifelines: dt.lifelines.map((l) => ({ id: l.id, name: l.name, kind: l.kind, states: l.states, ...(l.period ? { period: l.period } : {}) })),
      changes: dt.changes.map((c, i) => ({ id: `c${i + 1}`, life: c.life, t: c.t, state: c.state })),
      messages: dt.messages.map((m, i) => ({ id: `m${i + 1}`, from: m.from, to: m.to, t: m.t, ...(m.t2 !== undefined ? { t2: m.t2 } : {}), text: m.text })),
      durations: dt.constraints.map((c, i) => ({ id: `k${i + 1}`, life: c.life, t1: c.t1, t2: c.t2, text: c.text })),
    };
    if (!node) {
      node = { id: uniq(dt.id, nodeIds), type: 'timing', position: { x: 0, y: 0 }, data };
      page.nodes.push(node);
      added.add(node.id);
      fresh.add(node.id);
    } else node.data = { ...node.data, ...data };
    matchedTm.add(node.id);
    const size = timingSizeOf(data);
    node.width = size.width;
    node.height = size.height;
  }
  for (const n of tmNodes) if (!matchedTm.has(n.id)) removed.push(n.id);

  // ---------- UML: classes, states, use cases, components ----------
  const umlOwned = applyUml(page, doc, { added, removed, fresh, nodeIds, err, warn });

  // ---------- removals (a removed node takes its children and edges with it) ----------
  const gone = new Set(removed);
  let grew = true;
  while (grew) { grew = false; for (const n of page.nodes) if (n.parentId && gone.has(n.parentId) && !gone.has(n.id) && (ownedIds.has(n.id) || umlOwned.has(n.id))) (gone.add(n.id), (grew = true)); }
  page.nodes = page.nodes.filter((n) => !gone.has(n.id));
  page.edges = page.edges.filter((e) => !gone.has(e.id) && !gone.has(e.source) && !gone.has(e.target));
  for (const id of gone) { fresh.delete(id); added.delete(id); }

  // parents before children
  const order = new Map(page.nodes.map((n, i) => [n.id, i]));
  const depth = (n: CNode, seen = 0): number => (n.parentId && seen < 32 ? 1 + depth(page.nodes.find((x) => x.id === n.parentId) ?? ({ id: '' } as CNode), seen + 1) : 0);
  page.nodes.sort((a, b) => depth(a) - depth(b) || order.get(a.id)! - order.get(b.id)!);

  if (opts.layout !== false && fresh.size) placeFresh(page, fresh, hadContent);
  return { page, diagnostics, added: [...added], removed: [...gone, ...removed.filter((r) => !gone.has(r))] };
}

/** give positions to nodes that have none: lay the new blocks out and put them to the right of what is already there */
export function placeFresh(page: CPage, fresh: Set<string>, hadContent: boolean): void {
  if (!hadContent || fresh.size === page.nodes.length) {
    applyLayout(page, 'layered');
    return;
  }
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const isFreshChain = (n: CNode): boolean => fresh.has(n.id) || (!!n.parentId && isFreshChain(byId.get(n.parentId)!));
  const blockNodes = page.nodes.filter((n) => isFreshChain(n));
  const blockIds = new Set(blockNodes.map((n) => n.id));
  const settled = page.nodes.filter((n) => !blockIds.has(n.id) && !n.parentId);
  const rects = absRects({ nodes: settled });
  const right = rects.size ? Math.max(...[...rects.values()].map((r) => r.x + r.width)) : 0;
  const top = rects.size ? Math.min(...[...rects.values()].map((r) => r.y)) : 0;
  // a fresh node inside an existing group is appended after its siblings
  for (const n of blockNodes) {
    if (!n.parentId || blockIds.has(n.parentId)) continue;
    const sibs = page.nodes.filter((x) => x.parentId === n.parentId && !blockIds.has(x.id));
    const parent = byId.get(n.parentId)!;
    const x = sibs.length ? Math.max(...sibs.map((s) => s.position.x + nodeSize(s).width)) + 30 : 24;
    const y = sibs.length ? Math.min(...sibs.map((s) => s.position.y)) : 56;
    n.position = { x, y };
    const need = x + nodeSize(n).width + 24;
    if (need > nodeSize(parent).width) parent.width = need;
    blockIds.delete(n.id);
  }
  const sub: CPage = { id: page.id, name: page.name, nodes: blockNodes.filter((n) => blockIds.has(n.id) || (n.parentId && blockIds.has(n.parentId))), edges: page.edges.filter((e) => blockIds.has(e.source) && blockIds.has(e.target)) };
  if (!sub.nodes.length) return;
  const topLevel = sub.nodes.filter((n) => !n.parentId || !blockIds.has(n.parentId));
  for (const n of topLevel) if (n.parentId && !blockIds.has(n.parentId)) delete n.parentId;
  applyLayout(sub, 'layered');
  const minX = Math.min(...sub.nodes.filter((n) => !n.parentId).map((n) => n.position.x));
  const minY = Math.min(...sub.nodes.filter((n) => !n.parentId).map((n) => n.position.y));
  for (const n of sub.nodes) {
    const real = byId.get(n.id)!;
    real.position = n.parentId ? n.position : { x: n.position.x - minX + right + 120, y: n.position.y - minY + top };
    if (n.width) real.width = n.width;
    if (n.height) real.height = n.height;
  }
}

export type { DslSeq };
