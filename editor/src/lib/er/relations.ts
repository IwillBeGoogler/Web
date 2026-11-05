// edge menu / changeCardinality (app.js ~L3658-3737) and relation-column drag (~L826-857).
import type { DiagramEdge, DiagramNode } from '../../types';
import { newId, styleEdge } from '../graph';
import { relationEnds, flipCardinality } from './cardinality';
import { nextColumnId, withTableSize } from './geometry';
import { relationOf, tableOf, type RelationData, type TableColumn, type TableNodeData, DEFAULT_ACCENT } from './tableData';
import type { Cardinality } from './types';

/** mid-gray: readable on white and on dark canvases */
export const REL_COLOR = '#7b8499';

/** Build a relation edge (crow's-foot markers and line style derive from the relation). Source = referenced (parent) table. */
export function relationEdge(id: string, source: string, target: string, relation: RelationData, extra: Partial<DiagramEdge> = {}): DiagramEdge {
  const ends = relationEnds(relation);
  return styleEdge({
    id,
    source,
    target,
    ...extra,
    data: {
      ...(extra.data ?? {}),
      relation,
      color: REL_COLOR,
      arrows: 'none',
      startMarker: ends.start,
      endMarker: ends.end,
      strokeStyle: relation.identifying ? 'solid' : 'dashed',
      dashed: !relation.identifying,
    },
  } as DiagramEdge);
}

/** Re-derive markers / dash from an edge's relation after the relation changed. */
export function withRelation(e: DiagramEdge, patch: Partial<RelationData>): DiagramEdge {
  const rel = { ...relationOf(e)!, ...patch };
  const ends = relationEnds(rel);
  return styleEdge({ ...e, data: { ...e.data, relation: rel, startMarker: ends.start, endMarker: ends.end, strokeStyle: rel.identifying ? 'solid' : 'dashed', dashed: !rel.identifying } });
}

export const setCardinality = (e: DiagramEdge, c: Cardinality): DiagramEdge => withRelation(e, { cardinality: c, ...(c === 'N:M' ? { fromCol: undefined, toCol: undefined, optional: false } : {}) });

/** Swap source and target (parent and child); cardinality flips with them so the meaning stays. */
export function reverseRelation(e: DiagramEdge): DiagramEdge {
  const r = relationOf(e);
  if (!r) return e;
  const flipped: RelationData = {
    ...r,
    fromCol: r.toCol,
    toCol: r.fromCol,
    pairs: r.pairs?.map((p) => ({ fromCol: p.toCol, toCol: p.fromCol })),
    cardinality: flipCardinality(r.cardinality),
  };
  return withRelation({ ...e, source: e.target, target: e.source, sourceHandle: undefined, targetHandle: undefined }, flipped);
}

const tableNode = (nodes: DiagramNode[], id: string) => nodes.find((n) => n.id === id && n.type === 'table');
const updateTable = (nodes: DiagramNode[], id: string, fn: (d: TableNodeData) => TableNodeData): DiagramNode[] =>
  nodes.map((n) => (n.id === id ? withTableSize({ ...n, data: fn(tableOf(n)) as unknown as DiagramNode['data'] }) : n));

/** Which column ids on a table node are foreign keys right now (from its relation edges). */
export function fkColumnIds(edges: DiagramEdge[], tableId: string): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    const r = relationOf(e);
    if (!r || r.cardinality === 'N:M') continue;
    const [child, cols] = r.cardinality === 'N:1' ? [e.source, [r.fromCol, ...(r.pairs ?? []).map((p) => p.fromCol)]] : [e.target, [r.toCol, ...(r.pairs ?? []).map((p) => p.toCol)]];
    if (child === tableId) for (const c of cols) if (c) out.add(c);
  }
  return out;
}

/** Keep `fk` hints on columns in step with the relation edges (clears the hint when its edge is gone). */
export function pruneFks(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramNode[] {
  let changed = false;
  const next = nodes.map((n) => {
    if (n.type !== 'table') return n;
    const d = tableOf(n);
    if (!d.columns.some((c) => c.fk)) return n;
    const live = fkColumnIds(edges, n.id);
    if (d.columns.every((c) => !c.fk || live.has(c.id))) return n;
    changed = true;
    return withTableSize({ ...n, data: { ...d, columns: d.columns.map((c) => (c.fk && !live.has(c.id) ? { ...c, fk: undefined } : c)) } as unknown as DiagramNode['data'] });
  });
  return changed ? next : nodes;
}

export interface CreateRelationInput {
  /** table holding the foreign key */
  childId: string;
  /** existing FK column id on the child; omitted = create a new FK column */
  childCol?: string;
  parentId: string;
  /** referenced column id on the parent; omitted = the parent's primary key (or its first column) */
  parentCol?: string;
}
export interface RelationResult {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  edgeId: string;
  fkColumnId: string;
  created: boolean;
}

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
const singular = (s: string) => (/ies$/i.test(s) ? s.replace(/ies$/i, 'y') : /(ss|us)$/i.test(s) ? s : s.replace(/s$/i, ''));
/** FK type for a referenced column: serials become plain integers */
export const fkTypeFor = (type: string): string => (/^bigserial$/i.test(type) ? 'bigint' : /^smallserial$/i.test(type) ? 'smallint' : /^serial$/i.test(type) ? 'integer' : type.replace(/\s+unsigned/i, (m) => m) || 'integer');

/** Drag a column onto another table: reference the parent's key from the child (creating the FK column when needed). */
export function createRelation(nodes: DiagramNode[], edges: DiagramEdge[], input: CreateRelationInput, genId: (p: string) => string = newId): RelationResult | null {
  input = orientDrag(nodes, input);
  const child = tableNode(nodes, input.childId);
  const parent = tableNode(nodes, input.parentId);
  if (!child || !parent) return null;
  const pd = tableOf(parent);
  const cd = tableOf(child);
  const pcol: TableColumn | undefined = (input.parentCol ? pd.columns.find((c) => c.id === input.parentCol) : undefined) ?? pd.columns.find((c) => c.pk) ?? pd.columns[0];
  if (!pcol && pd.tableKind !== 'enum') return null;
  let fkId = input.childCol;
  let created = false;
  let outNodes = nodes;
  if (!fkId || !cd.columns.some((c) => c.id === fkId)) {
    // new FK column: <parent>_<key> (self reference: parent_<key>)
    const base = parent === child ? 'parent' : singular(snake(pd.label));
    let name = `${base}_${pcol?.name ?? 'id'}`;
    const used = new Set(cd.columns.map((c) => c.name));
    for (let i = 2; used.has(name); i++) name = `${base}_${pcol?.name ?? 'id'}_${i}`;
    fkId = nextColumnId(cd);
    const col: TableColumn = { id: fkId, name, type: fkTypeFor(pcol?.type ?? 'integer'), pk: false, unique: false, nullable: true, fk: { table: pd.label, column: pcol?.name ?? '' } };
    outNodes = updateTable(nodes, child.id, (d) => ({ ...d, columns: [...d.columns, col] }));
    created = true;
  } else {
    outNodes = updateTable(nodes, child.id, (d) => ({ ...d, columns: d.columns.map((c) => (c.id === fkId ? { ...c, fk: { ...(c.fk ?? {}), table: pd.label, column: pcol?.name ?? '' } } : c)) }));
  }
  const fkCol = tableOf(outNodes.find((n) => n.id === child.id)!).columns.find((c) => c.id === fkId)!;
  const relation: RelationData = {
    fromCol: pcol?.id,
    toCol: fkId,
    cardinality: fkCol.unique || fkCol.pk && cd.columns.filter((c) => c.pk).length === 1 ? '1:1' : '1:N',
    identifying: fkCol.pk,
    optional: fkCol.nullable && !fkCol.pk,
  };
  const edgeId = genId('rel');
  // a repeated drop onto the same pair of columns must not stack a duplicate edge
  const dup = edges.find((e) => e.source === parent.id && e.target === child.id && relationOf(e)?.toCol === fkId && relationOf(e)?.fromCol === relation.fromCol);
  if (dup) return { nodes: outNodes, edges, edgeId: dup.id, fkColumnId: fkId, created };
  return { nodes: outNodes, edges: [...edges, relationEdge(edgeId, parent.id, child.id, relation)], edgeId, fkColumnId: fkId, created };
}

/**
 * A drag that starts on a table's sole primary key reads as "reference this key": the dragged table is the parent, and the
 * drop target gets the foreign key (the dropped-on column, or a new one) — unless the drop lands on the target's own sole key.
 */
function orientDrag(nodes: DiagramNode[], input: CreateRelationInput): CreateRelationInput {
  const from = tableNode(nodes, input.childId);
  const to = tableNode(nodes, input.parentId);
  if (!from || !to || from === to || !input.childCol) return input;
  const solePk = (d: TableNodeData, id?: string) => { const pk = d.columns.filter((c) => c.pk); return pk.length === 1 && pk[0].id === id; };
  const fd = tableOf(from);
  const td = tableOf(to);
  if (td.tableKind === 'enum' || !solePk(fd, input.childCol)) return input;
  const dropCol = input.parentCol ?? undefined;
  if (dropCol && solePk(td, dropCol)) return input;
  return { childId: to.id, childCol: dropCol, parentId: from.id, parentCol: input.childCol };
}

/** Replace an N:M edge by a junction table with two foreign keys (composite primary key). */
export function createJunction(nodes: DiagramNode[], edges: DiagramEdge[], edgeId: string, genId: (p: string) => string = newId): { nodes: DiagramNode[]; edges: DiagramEdge[]; junctionId: string } | null {
  const e = edges.find((x) => x.id === edgeId);
  const r = e && relationOf(e);
  if (!e || !r || r.cardinality !== 'N:M') return null;
  const a = tableNode(nodes, e.source);
  const b = tableNode(nodes, e.target);
  if (!a || !b) return null;
  const ad = tableOf(a);
  const bd = tableOf(b);
  const aKey = ad.columns.find((c) => c.id === r.fromCol) ?? ad.columns.find((c) => c.pk) ?? ad.columns[0];
  const bKey = bd.columns.find((c) => c.id === r.toCol) ?? bd.columns.find((c) => c.pk) ?? bd.columns[0];
  const self = a.id === b.id;
  const nameA = singular(snake(ad.label));
  const nameB = self ? `related_${singular(snake(bd.label))}` : singular(snake(bd.label));
  const colA = self ? `${nameA}_${aKey?.name ?? 'id'}` : `${nameA}_${aKey?.name ?? 'id'}`;
  const colB = `${nameB}_${bKey?.name ?? 'id'}`;
  const jd: TableNodeData = {
    label: `${snake(ad.label)}_${snake(bd.label)}`,
    tableKind: 'table',
    accent: ad.accent ?? DEFAULT_ACCENT,
    collapsed: false,
    indexes: [],
    checks: [],
    columns: [
      { id: 'c0', name: colA, type: fkTypeFor(aKey?.type ?? 'integer'), pk: true, unique: false, nullable: false, fk: { table: ad.label, column: aKey?.name ?? '' } },
      { id: 'c1', name: colB, type: fkTypeFor(bKey?.type ?? 'integer'), pk: true, unique: false, nullable: false, fk: { table: bd.label, column: bKey?.name ?? '' } },
    ],
  };
  const ap = a.position;
  const bp = b.position;
  const jid = genId('n');
  const junction = withTableSize({
    id: jid,
    type: 'table',
    position: { x: Math.round((ap.x + bp.x) / 2 + (self ? 280 : 0)), y: Math.round((ap.y + bp.y) / 2 + (self ? 0 : 40)) },
    data: jd as unknown as DiagramNode['data'],
  } as DiagramNode);
  const mk = (src: DiagramNode, key: TableColumn | undefined, toCol: string) =>
    relationEdge(genId('rel'), src.id, jid, { fromCol: key?.id, toCol, cardinality: '1:N', identifying: true, optional: false });
  const rest = edges.filter((x) => x.id !== edgeId);
  return { nodes: [...nodes, junction], edges: [...rest, mk(a, aKey, 'c0'), mk(b, bKey, 'c1')], junctionId: jid };
}

/** Schema-less helper for the palette: a blank table node. */
export function blankTable(id: string, position: { x: number; y: number }, label = 'table_name', variant: TableNodeData['tableKind'] = 'table'): DiagramNode {
  const cols: TableColumn[] =
    variant === 'enum'
      ? [{ id: 'c0', name: 'value_1', type: '', pk: false, unique: false, nullable: false }, { id: 'c1', name: 'value_2', type: '', pk: false, unique: false, nullable: false }]
      : variant === 'view'
        ? [{ id: 'c0', name: 'id', type: 'integer', pk: false, unique: false, nullable: true }, { id: 'c1', name: 'name', type: 'text', pk: false, unique: false, nullable: true }]
        : [{ id: 'c0', name: 'id', type: 'integer', pk: true, unique: false, nullable: false, generated: 'identity' }, { id: 'c1', name: 'name', type: 'text', pk: false, unique: false, nullable: false }];
  return withTableSize({
    id,
    type: 'table',
    position,
    data: { label, tableKind: variant, accent: variant === 'enum' ? '#8e5bd6' : variant === 'view' ? '#0f9d8f' : DEFAULT_ACCENT, collapsed: false, columns: cols, indexes: [], checks: [] } as unknown as DiagramNode['data'],
  } as DiagramNode);
}

/** A table node with a junction look: two key columns. */
export function blankJunction(id: string, position: { x: number; y: number }): DiagramNode {
  const n = blankTable(id, position, 'a_b');
  const d = tableOf(n);
  return withTableSize({ ...n, data: { ...d, accent: '#e8710a', columns: [
    { id: 'c0', name: 'a_id', type: 'integer', pk: true, unique: false, nullable: false },
    { id: 'c1', name: 'b_id', type: 'integer', pk: true, unique: false, nullable: false },
  ] } as unknown as DiagramNode['data'] });
}

// ---- column editing (pure; the node component and tests use the same functions) ----
export const addColumn = (d: TableNodeData, name = 'column', type = 'text'): TableNodeData => ({ ...d, columns: [...d.columns, { id: nextColumnId(d), name: uniqueName(d, name), type, pk: false, unique: false, nullable: true }] });
function uniqueName(d: TableNodeData, name: string): string {
  const used = new Set(d.columns.map((c) => c.name));
  if (!used.has(name)) return name;
  for (let i = 2; ; i++) if (!used.has(`${name}_${i}`)) return `${name}_${i}`;
}
export const removeColumn = (d: TableNodeData, id: string): TableNodeData => ({ ...d, columns: d.columns.filter((c) => c.id !== id) });
export function moveColumn(d: TableNodeData, id: string, to: number): TableNodeData {
  const from = d.columns.findIndex((c) => c.id === id);
  if (from < 0) return d;
  const cols = [...d.columns];
  const [c] = cols.splice(from, 1);
  cols.splice(Math.max(0, Math.min(cols.length, to)), 0, c);
  return { ...d, columns: cols };
}
export const patchColumn = (d: TableNodeData, id: string, patch: Partial<TableColumn>): TableNodeData => ({ ...d, columns: d.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

/** Edges that point at columns that no longer exist are dropped (the relation is gone with its column). */
export function dropDanglingRelations(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramEdge[] {
  const cols = new Map(nodes.filter((n) => n.type === 'table').map((n) => [n.id, new Set(tableOf(n).columns.map((c) => c.id))]));
  return edges.filter((e) => {
    const r = relationOf(e);
    if (!r) return true;
    const a = cols.get(e.source);
    const b = cols.get(e.target);
    if (!a || !b) return true;
    return (!r.fromCol || a.has(r.fromCol)) && (!r.toCol || b.has(r.toCol));
  });
}
