import { useDiagramStore } from '../../store/diagramStore';
import { createProject } from '../project';
import { importOpenedFile, openFile } from '../../workspace/actions';
import { schemaToDiagram } from './convert';
import { withTableSize } from './geometry';
import { groupByPrefix } from './group';
import { foldJunctions } from './junction';
import { layoutTables } from './layout';
import { withRelation } from './relations';
import { parseSql } from './sqlParse';
import { relationOf, tableOf } from './tableData';
import type { DiagramEdge, DiagramNode } from '../../types';
import { absolutePosition, newId, nodeSize } from '../graph';
import type { ErSchemaDef } from './types';

/** `update`: merge into the tables already on the page (match by name, keep layout) */
export type ImportTarget = 'page' | 'newfile' | 'update';
export interface ApplyOptions {
  foldJunctions?: boolean;
  /** put tables sharing a name prefix (before the first `_`, >= 2 members) into a group */
  groupByPrefix?: boolean;
  /** update mode: remove tables that are not in the import */
  removeMissing?: boolean;
}
export interface MergeSummary { added: number; updated: number; removed: number }

/** Put an imported schema on the canvas: into the current file (free area), merged into it, or a new file. Returns the table count. */
export function applySchema(schema: ErSchemaDef, target: ImportTarget, name = 'Imported schema', opts: ApplyOptions = {}): number {
  if (target === 'update') { const m = mergeSchemaIntoPage(schema, opts); return m.added + m.updated; }
  const laid = schemaToDiagram(schema);
  const folded = opts.foldJunctions ? { ...laid, ...foldJunctions(laid.nodes, laid.edges) } : laid;
  const diagram = opts.groupByPrefix ? { ...folded, nodes: groupByPrefix(folded.nodes, '', folded.edges) } : folded;
  const st = useDiagramStore.getState();
  if (target === 'newfile') {
    const project = createProject(name);
    project.pages[0] = { ...project.pages[0], name, nodes: diagram.nodes, edges: diagram.edges };
    const r = importOpenedFile(project);
    openFile(r.fileId);
  } else st.insertContent(diagram, { select: false }); // a whole schema selected would only open the inspector over it
  return diagram.nodes.filter((n) => n.type === 'table').length; // groups are not tables
}

/**
 * Two-way SQL panel: replace the page's tables and relations by those in `sql`. Tables that keep their name keep their
 * place and colour; new ones are laid out to the right of the drawing. Returns the parse warnings, or null when nothing parsed.
 */
export function replaceTablesFromSql(sql: string): { tables: number; warnings: string[] } | null {
  const parsed = parseSql(sql);
  if (!parsed.schema.tables.length && !parsed.schema.enums.length) return null;
  const st = useDiagramStore.getState();
  const old = new Map(st.nodes.filter((n) => n.type === 'table').map((n) => [tableOf(n).label, n]));
  const fresh = schemaToDiagram(parsed.schema, { prefix: newId('s') + '_' });
  const right = Math.max(0, ...[...old.values()].map((n) => n.position.x + (n.width ?? 260))) + 120;
  const nodes = fresh.nodes.map((n) => {
    const was = n.type === 'table' ? old.get(tableOf(n).label) : undefined;
    if (!was) return { ...n, position: old.size ? { x: n.position.x + right, y: n.position.y } : n.position };
    return { ...n, position: was.position, parentId: was.parentId, data: { ...n.data, accent: tableOf(was).accent, collapsed: tableOf(was).collapsed } };
  });
  // relations that survive (same parent, child and key column) keep their hand-placed bends and style
  const label = (ns: DiagramNode[], id: string) => { const n = ns.find((x) => x.id === id); return n ? tableOf(n).label : ''; };
  const colName = (ns: DiagramNode[], id: string, col?: string) => { const n = ns.find((x) => x.id === id); return n && col ? tableOf(n).columns.find((c) => c.id === col)?.name ?? '' : ''; };
  const keyOf = (ns: DiagramNode[], e: DiagramEdge) => `${label(ns, e.source)}>${label(ns, e.target)}.${colName(ns, e.target, relationOf(e)?.toCol)}`;
  const kept = new Map(st.edges.filter((e) => relationOf(e)).map((e) => [keyOf(st.nodes, e), e]));
  const edges = fresh.edges.map((e) => {
    const was = relationOf(e) ? kept.get(keyOf(nodes, e)) : undefined;
    return was ? { ...e, data: { ...was.data, ...e.data, relation: relationOf(e), waypoints: was.data?.waypoints, manual: was.data?.manual, color: was.data?.color } } : e;
  });
  st.transform((ns, es) => {
    const gone = new Set(ns.filter((n) => n.type === 'table').map((n) => n.id));
    return { nodes: [...ns.filter((n) => !gone.has(n.id)), ...nodes], edges: [...es.filter((e) => !gone.has(e.source) && !gone.has(e.target)), ...edges] };
  });
  return { tables: parsed.schema.tables.length, warnings: parsed.warnings };
}

/**
 * Update the current page from a schema: tables are matched by name. Matched tables keep position, colour and collapsed state and take
 * the new columns / indexes / foreign keys (columns keep their id by name, so surviving relations stay attached); new tables are
 * laid out to the right of the drawing; tables missing from the import are removed only with `removeMissing`.
 */
export function mergeSchemaIntoPage(schema: ErSchemaDef, opts: ApplyOptions = {}): MergeSummary {
  const st = useDiagramStore.getState();
  const pre = newId('s') + '_';
  const fresh = schemaToDiagram(schema, { prefix: pre, layout: false });
  const old = new Map(st.nodes.filter((n) => n.type === 'table').map((n) => [tableOf(n).label, n]));
  const nodeMap = new Map<string, string>(); // fresh node id -> final id
  const colMap = new Map<string, string>(); // `${fresh node id}:${fresh column id}` -> final column id
  const matched = new Map<string, DiagramNode>(); // final id -> merged node
  const added: DiagramNode[] = [];
  for (const n of fresh.nodes) {
    const fd = tableOf(n);
    const was = old.get(fd.label);
    nodeMap.set(n.id, was ? was.id : n.id);
    if (!was) { added.push(n); continue; }
    const od = tableOf(was);
    const byName = new Map(od.columns.map((c) => [c.name, c.id]));
    const taken = new Set(fd.columns.map((c) => byName.get(c.name)).filter((x): x is string => !!x));
    let k = 0;
    const columns = fd.columns.map((c) => {
      let id = byName.get(c.name);
      if (!id) { while (taken.has(`c${k}`)) k++; id = `c${k}`; taken.add(id); }
      colMap.set(`${n.id}:${c.id}`, id);
      return { ...c, id };
    });
    matched.set(was.id, withTableSize({ ...was, data: { ...was.data, ...fd, columns, comment: fd.comment, accent: od.accent, collapsed: od.collapsed } as unknown as DiagramNode['data'] }));
  }
  const inImport = new Set(schema.tables.map((t) => t.name).concat(schema.enums.map((e) => e.name)));
  const removedIds = new Set(opts.removeMissing ? [...old].filter(([label]) => !inImport.has(label)).map(([, n]) => n.id) : []);
  // new tables: free area to the right of everything, optionally grouped by prefix
  const addedIds = new Set(added.map((n) => n.id));
  const keep = st.nodes.filter((n) => !removedIds.has(n.id));
  const abs = keep.map((n) => ({ ...absolutePosition(st.nodes, n), ...nodeSize(n) }));
  const origin = abs.length ? { x: Math.max(...abs.map((r) => r.x + r.width)) + 120, y: Math.min(...abs.map((r) => r.y)) } : { x: 0, y: 0 };
  const pos = layoutTables(added, fresh.edges.filter((e) => addedIds.has(e.source) && addedIds.has(e.target)), { origin });
  let placed = added.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
  if (opts.groupByPrefix) placed = groupByPrefix(placed, pre);
  const finalNodes = [...keep.map((n) => matched.get(n.id) ?? n), ...placed];
  // relations: those between imported tables are rebuilt from the schema (keeping hand-placed bends / style), the rest stay
  const label = (ns: DiagramNode[], id: string) => { const n = ns.find((x) => x.id === id); return n ? tableOf(n).label : ''; };
  const colName = (ns: DiagramNode[], id: string, col?: string) => { const n = ns.find((x) => x.id === id); return n && col ? tableOf(n).columns.find((c) => c.id === col)?.name ?? '' : ''; };
  const keyOf = (ns: DiagramNode[], e: DiagramEdge) => `${label(ns, e.source)}>${label(ns, e.target)}.${colName(ns, e.target, relationOf(e)?.toCol)}`;
  const covered = new Set(matched.keys());
  const wasEdges = new Map(st.edges.filter((e) => relationOf(e) && covered.has(e.source) && covered.has(e.target)).map((e) => [keyOf(st.nodes, e), e]));
  const newEdges = fresh.edges.map((e) => {
    const r = relationOf(e)!;
    const re = withRelation(
      { ...e, source: nodeMap.get(e.source)!, target: nodeMap.get(e.target)! },
      { fromCol: r.fromCol ? colMap.get(`${e.source}:${r.fromCol}`) ?? r.fromCol : undefined, toCol: r.toCol ? colMap.get(`${e.target}:${r.toCol}`) ?? r.toCol : undefined },
    );
    const was = wasEdges.get(keyOf(finalNodes, re));
    return was ? { ...re, data: { ...re.data, waypoints: was.data?.waypoints, manual: was.data?.manual, color: was.data?.color } } : re;
  });
  const colsOf = new Map(finalNodes.filter((n) => n.type === 'table').map((n) => [n.id, new Set(tableOf(n).columns.map((c) => c.id))]));
  const keptEdges = st.edges.filter((e) => {
    if (removedIds.has(e.source) || removedIds.has(e.target)) return false;
    const r = relationOf(e);
    if (!r) return true;
    if (covered.has(e.source) && covered.has(e.target)) return false;
    return (!r.fromCol || !!colsOf.get(e.source)?.has(r.fromCol)) && (!r.toCol || !!colsOf.get(e.target)?.has(r.toCol));
  });
  st.transform(() => ({ nodes: finalNodes, edges: [...keptEdges, ...newEdges] }));
  return { added: added.length, updated: matched.size, removed: removedIds.size };
}
