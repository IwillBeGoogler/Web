import type { DiagramEdge, DiagramNode } from '../../types';
import { newId } from '../graph';
import { relationEdge } from './relations';
import { relationOf, tableOf } from './tableData';

export interface JunctionInfo {
  tableId: string;
  /** the two referenced tables (source ends of the two foreign-key edges) */
  a: string;
  b: string;
  /** edge ids of the two foreign keys */
  edgeIds: [string, string];
  /** true when the table holds nothing but the two keys (no payload columns) */
  pure: boolean;
}

/** foreign-key edges that point INTO a table (its own foreign keys): the child end of 1:N / 1:1, the source of N:1 */
function foreignKeysOf(edges: DiagramEdge[], tableId: string): DiagramEdge[] {
  return edges.filter((e) => {
    const r = relationOf(e);
    if (!r || r.via || r.cardinality === 'N:M') return false;
    return (r.cardinality === 'N:1' ? e.source : e.target) === tableId && e.source !== e.target;
  });
}

/**
 * Tables that only exist to join two others: exactly two foreign keys (to two different tables) and a composite primary key
 * made of exactly those key columns. `pure` marks the ones with no further columns.
 */
export function findJunctions(nodes: DiagramNode[], edges: DiagramEdge[]): JunctionInfo[] {
  const out: JunctionInfo[] = [];
  for (const n of nodes) {
    if (n.type !== 'table') continue;
    const d = tableOf(n);
    if (d.tableKind === 'enum' || d.tableKind === 'view') continue;
    const fks = foreignKeysOf(edges, n.id).filter((e) => !e.hidden || n.hidden);
    if (fks.length !== 2) continue;
    const fkCols = new Set(fks.flatMap((e) => { const r = relationOf(e)!; return [r.cardinality === 'N:1' ? r.fromCol : r.toCol, ...(r.pairs ?? []).map((p) => (r.cardinality === 'N:1' ? p.fromCol : p.toCol))]; }).filter((x): x is string => !!x));
    const pk = d.columns.filter((c) => c.pk);
    if (pk.length < 2 || pk.length !== fkCols.size || !pk.every((c) => fkCols.has(c.id))) continue;
    const parents = fks.map((e) => (e.source === n.id ? e.target : e.source));
    if (parents[0] === parents[1]) continue;
    out.push({ tableId: n.id, a: parents[0], b: parents[1], edgeIds: [fks[0].id, fks[1].id], pure: d.columns.every((c) => fkCols.has(c.id)) });
  }
  return out;
}

/** Display a junction table as one many-to-many edge: the table and its two foreign-key edges are hidden (nothing is lost). */
export function showAsManyToMany(nodes: DiagramNode[], edges: DiagramEdge[], tableId: string, genId: (p: string) => string = newId): { nodes: DiagramNode[]; edges: DiagramEdge[]; edgeId: string } | null {
  const j = findJunctions(nodes, edges).find((x) => x.tableId === tableId);
  if (!j) return null;
  const jn = nodes.find((n) => n.id === tableId)!;
  const hide = new Set<string>(edges.filter((e) => j.edgeIds.includes(e.id) || (relationOf(e)?.group && j.edgeIds.some((id) => relationOf(edges.find((x) => x.id === id)!)?.group === relationOf(e)!.group && e.source === edges.find((x) => x.id === id)!.source && e.target === edges.find((x) => x.id === id)!.target))).map((e) => e.id));
  const edgeId = genId('rel');
  const nm = relationEdge(edgeId, j.a, j.b, { cardinality: 'N:M', identifying: false, optional: false, via: tableId, name: tableOf(jn).label }, { label: tableOf(jn).label });
  return {
    nodes: nodes.map((n) => (n.id === tableId ? { ...n, hidden: true, selected: false } : n)),
    edges: [...edges.map((e) => (hide.has(e.id) ? { ...e, hidden: true, selected: false } : e)), nm],
    edgeId,
  };
}

/** Undo `showAsManyToMany`: bring the junction table and its foreign keys back and drop the N:M edge. */
export function expandManyToMany(nodes: DiagramNode[], edges: DiagramEdge[], edgeId: string): { nodes: DiagramNode[]; edges: DiagramEdge[]; tableId: string } | null {
  const e = edges.find((x) => x.id === edgeId);
  const via = e && relationOf(e)?.via;
  if (!e || !via) return null;
  const hidden = new Set(edges.filter((x) => x.hidden && (x.source === via || x.target === via)).map((x) => x.id));
  return {
    nodes: nodes.map((n) => (n.id === via ? { ...n, hidden: false } : n)),
    edges: edges.filter((x) => x.id !== edgeId).map((x) => (hidden.has(x.id) ? { ...x, hidden: false } : x)),
    tableId: via,
  };
}

/** Show every pure junction table as an N:M edge (import option). Returns how many were folded. */
export function foldJunctions(nodes: DiagramNode[], edges: DiagramEdge[], genId: (p: string) => string = newId): { nodes: DiagramNode[]; edges: DiagramEdge[]; folded: number } {
  let ns = nodes;
  let es = edges;
  let folded = 0;
  for (const j of findJunctions(nodes, edges)) {
    if (!j.pure) continue;
    const r = showAsManyToMany(ns, es, j.tableId, genId);
    if (r) { ns = r.nodes; es = r.edges; folded++; }
  }
  return { nodes: ns, edges: es, folded };
}
