// model.Schema -> diagram mapping.
import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { cardinalityOf, isOptionalFk } from './cardinality';
import { withTableSize } from './geometry';
import { layoutTables } from './layout';
import { relationEdge } from './relations';
import { ACCENTS, DEFAULT_ACCENT, relationOf, tableOf, type RelationData, type TableColumn, type TableNodeData } from './tableData';
import { emptySchema, type ErColumnDef, type ErSchemaDef, type ErTableDef } from './types';

export interface ToDiagramOptions {
  /** run the ER auto-layout (default true) */
  layout?: boolean;
  origin?: { x: number; y: number };
  /** id prefix, so inserted pages never collide */
  prefix?: string;
}

/** Union-find over foreign keys: one accent colour per connected group. */
function groupAccents(s: ErSchemaDef): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  for (const t of s.tables) parent.set(t.name, t.name);
  for (const t of s.tables) for (const c of t.columns) if (c.fk && parent.has(c.fk.table)) parent.set(find(t.name), find(c.fk.table));
  const sizes = new Map<string, number>();
  for (const t of s.tables) sizes.set(find(t.name), (sizes.get(find(t.name)) ?? 0) + 1);
  const roots = [...sizes.keys()].sort((a, b) => sizes.get(b)! - sizes.get(a)! || a.localeCompare(b));
  const out = new Map<string, string>();
  for (const t of s.tables) {
    const root = find(t.name);
    out.set(t.name, sizes.get(root)! < 2 ? '#4b5563' : ACCENTS[roots.filter((r) => sizes.get(r)! >= 2).indexOf(root) % ACCENTS.length]);
  }
  return out;
}

function tableNodeFromDef(id: string, t: ErTableDef, accent: string): DiagramNode {
  const columns: TableColumn[] = t.columns.map((c, i) => ({ ...c, id: `c${i}` }));
  const data: TableNodeData = {
    label: t.name,
    ...(t.schema ? { schema: t.schema } : {}),
    tableKind: t.kind === 'view' ? 'view' : 'table',
    columns,
    indexes: t.indexes,
    checks: t.checks,
    accent: t.accent ?? accent,
    collapsed: false,
    ...(t.comment ? { comment: t.comment } : {}),
  };
  return withTableSize({ id, type: 'table', position: { x: 0, y: 0 }, data: data as unknown as DiagramNode['data'] } as DiagramNode);
}

/** ER schema -> nodes + relation edges (+ auto-layout). */
export function schemaToDiagram(schema: ErSchemaDef, opts: ToDiagramOptions = {}): Diagram {
  const pre = opts.prefix ?? '';
  const accents = groupAccents(schema);
  const nodes: DiagramNode[] = schema.tables.map((t, i) => tableNodeFromDef(`${pre}tbl_${i}`, t, accents.get(t.name) ?? DEFAULT_ACCENT));
  schema.enums.forEach((en, i) => {
    const data: TableNodeData = {
      label: en.name, tableKind: 'enum', accent: '#8e5bd6', collapsed: false, indexes: [], checks: [],
      columns: en.values.map((v, k) => ({ id: `c${k}`, name: v, type: '', pk: false, unique: false, nullable: false })),
    };
    nodes.push(withTableSize({ id: `${pre}enum_${i}`, type: 'table', position: { x: 0, y: 0 }, data: data as unknown as DiagramNode['data'] } as DiagramNode));
  });
  const byName = new Map<string, { node: DiagramNode; def: ErTableDef }>();
  schema.tables.forEach((t, i) => byName.set(t.name, { node: nodes[i], def: t }));
  const edges: DiagramEdge[] = [];
  let seq = 0;
  let groupSeq = 0;
  schema.tables.forEach((t, ti) => {
    const child = nodes[ti];
    const cd = tableOf(child);
    const done = new Set<string>();
    t.columns.forEach((c, ci) => {
      if (!c.fk || done.has(c.name)) return;
      const parent = byName.get(c.fk.table) ?? [...byName.values()].find((x) => x.def.name.toLowerCase() === c.fk!.table.toLowerCase());
      if (!parent) return;
      const members: { col: ErColumnDef; idx: number }[] = c.fk.group ? t.columns.map((col, idx) => ({ col, idx })).filter((x) => x.col.fk?.group === c.fk!.group && x.col.fk?.table === c.fk!.table) : [{ col: c, idx: ci }];
      members.forEach((m) => done.add(m.col.name));
      const pd = tableOf(parent.node);
      const pair = (m: { col: ErColumnDef; idx: number }) => {
        const pc = pd.columns.find((x) => x.name === m.col.fk!.column) ?? pd.columns.find((x) => x.name.toLowerCase() === m.col.fk!.column.toLowerCase()) ?? pd.columns.find((x) => x.pk);
        return { fromCol: pc?.id ?? '', toCol: cd.columns[m.idx].id };
      };
      const pairs = members.map(pair);
      const common = {
        cardinality: cardinalityOf(t, members.map((m) => m.col)),
        identifying: c.fk.identifying ?? members.every((m) => m.col.pk),
        optional: isOptionalFk(members.map((m) => m.col)),
        ...(c.fk.manyRequired ? { manyRequired: true } : {}),
      };
      const group = pairs.length > 1 ? `g${groupSeq++}` : undefined;
      // composite foreign key: one edge per column pair (each drawn row to row), tied together by `group`
      pairs.forEach((p, k) => {
        const rel: RelationData = {
          fromCol: p.fromCol || undefined,
          toCol: p.toCol,
          ...common,
          ...(group ? { group } : {}),
          ...(k === 0 && (c.fk!.label ?? c.fk!.name) ? { name: c.fk!.label ?? c.fk!.name } : {}),
        };
        edges.push(relationEdge(`${pre}rel_${seq++}`, parent.node.id, child.id, rel));
      });
    });
  });
  for (const l of schema.loose) {
    const a = byName.get(l.from)?.node;
    const b = byName.get(l.to)?.node;
    if (!a || !b) continue;
    edges.push(relationEdge(`${pre}rel_${seq++}`, a.id, b.id, { cardinality: l.cardinality, identifying: l.identifying, optional: false, ...(l.label ? { name: l.label } : {}) }, l.label ? { label: l.label } : {}));
  }
  if (opts.layout !== false) {
    const pos = layoutTables(nodes, edges, { origin: opts.origin });
    for (const n of nodes) n.position = pos.get(n.id) ?? n.position;
  }
  return { version: 1, nodes, edges };
}

/** Diagram -> ER schema (for exports and round trips). Only table nodes and relation edges take part. */
export function diagramToSchema(nodes: DiagramNode[], edges: DiagramEdge[]): ErSchemaDef {
  const schema = emptySchema();
  const tableNodes = nodes.filter((n) => n.type === 'table');
  const nameOf = new Map(tableNodes.map((n) => [n.id, tableOf(n).label]));
  const defs = new Map<string, ErTableDef>();
  for (const n of tableNodes) {
    const d = tableOf(n);
    if (d.tableKind === 'enum') { schema.enums.push({ name: d.label, values: d.columns.map((c) => c.name) }); continue; }
    const def: ErTableDef = {
      ...(d.schema ? { schema: d.schema } : {}),
      name: d.label,
      kind: d.tableKind === 'view' ? 'view' : 'table',
      columns: d.columns.map((c) => {
        const { id: _id, fk: _fk, ...rest } = c;
        void _id; void _fk;
        return { ...rest } as ErColumnDef;
      }),
      indexes: d.indexes.map((i) => ({ ...i })),
      checks: d.checks.map((c) => ({ ...c })),
      ...(d.comment ? { comment: d.comment } : {}),
      accent: d.accent,
    };
    defs.set(n.id, def);
  }
  let group = 0;
  // one logical relation per edge, except that the edges of a composite key (same group) are merged into one
  const logical: { e: DiagramEdge; r: RelationData }[] = [];
  const byGroup = new Map<string, { e: DiagramEdge; r: RelationData }>();
  for (const e of edges) {
    const rel = relationOf(e);
    if (!rel || rel.via) continue;
    if (rel.group) {
      const key = `${rel.group}|${e.source}|${e.target}`;
      const hit = byGroup.get(key);
      if (hit) { hit.r = { ...hit.r, pairs: [...(hit.r.pairs ?? []), { fromCol: rel.fromCol ?? '', toCol: rel.toCol ?? '' }] }; continue; }
      const item = { e, r: { ...rel } };
      byGroup.set(key, item);
      logical.push(item);
      continue;
    }
    logical.push({ e, r: rel });
  }
  for (const { e, r } of logical) {
    const src = nodes.find((n) => n.id === e.source);
    const dst = nodes.find((n) => n.id === e.target);
    if (!src || !dst || src.type !== 'table' || dst.type !== 'table') continue;
    if (r.cardinality === 'N:M') {
      schema.loose.push({ from: nameOf.get(e.source)!, to: nameOf.get(e.target)!, cardinality: 'N:M', identifying: r.identifying, ...(e.label ? { label: String(e.label) } : r.name ? { label: r.name } : {}) });
      continue;
    }
    const childIsSource = r.cardinality === 'N:1';
    const child = childIsSource ? src : dst;
    const parent = childIsSource ? dst : src;
    const cdef = defs.get(child.id);
    const pdata = tableOf(parent);
    const cdata = tableOf(child);
    if (!cdef) continue;
    const pairs = [{ fromCol: r.fromCol, toCol: r.toCol }, ...(r.pairs ?? [])].map((p) => (childIsSource ? { fromCol: p.toCol, toCol: p.fromCol } : p));
    const g = pairs.length > 1 ? `g${group++}` : undefined;
    for (const p of pairs) {
      const ccol = cdata.columns.find((c) => c.id === p.toCol);
      const pcol = pdata.columns.find((c) => c.id === p.fromCol) ?? pdata.columns.find((c) => c.pk);
      if (!ccol) continue;
      const target = cdef.columns.find((c) => c.name === ccol.name);
      if (!target) continue;
      target.fk = {
        ...(ccol.fk ?? {}),
        table: pdata.label,
        column: pcol?.name ?? '',
        identifying: r.identifying,
        ...(r.manyRequired ? { manyRequired: true } : {}),
        ...(r.name ? { label: r.name } : {}),
        ...(g ? { group: g } : {}),
      };
    }
  }
  // keep hints for foreign keys whose relation edge is not on this page
  for (const n of tableNodes) {
    const def = defs.get(n.id);
    if (!def) continue;
    tableOf(n).columns.forEach((c, i) => {
      if (c.fk && !def.columns[i].fk && [...nameOf.values()].includes(c.fk.table) === false) def.columns[i].fk = c.fk;
    });
  }
  schema.tables = tableNodes.filter((n) => tableOf(n).tableKind !== 'enum').map((n) => defs.get(n.id)!);
  return schema;
}
