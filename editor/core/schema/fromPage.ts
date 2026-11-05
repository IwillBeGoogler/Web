import type { CPage } from '../types';
import type { Schema, SchemaColumn, SchemaTable } from './types';

/** the ER tables of a page as a schema (views and enums included, relations folded into the foreign keys of their columns) */
export function pageToSchema(page: Pick<CPage, 'nodes' | 'edges'>): Schema {
  const out: Schema = { tables: [], enums: [] };
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  for (const n of page.nodes) {
    if (n.type !== 'table') continue;
    const d = n.data as any;
    if (d.tableKind === 'enum') { out.enums.push({ name: d.label, values: (d.columns ?? []).map((c: any) => c.name) }); continue; }
    const cols: SchemaColumn[] = (d.columns ?? []).map((c: any) => {
      return { ...c };
    });
    const t: SchemaTable = { id: n.id, ...(d.schema ? { schema: d.schema } : {}), name: d.label, kind: d.tableKind === 'view' ? 'view' : 'table', columns: cols, indexes: (d.indexes ?? []).map((i: any) => ({ ...(i.name ? { name: i.name } : {}), columns: [...i.columns], unique: !!i.unique })), checks: (d.checks ?? []).map((c: any) => ({ ...c })), ...(d.comment ? { comment: d.comment } : {}) };
    out.tables.push(t);
  }
  // relations that exist only as edges (no `fk` on the column) still count as foreign keys
  for (const e of page.edges) {
    const r = e.data?.relation;
    if (!r?.toCol || !r.fromCol) continue;
    const parent = byId.get(e.source), child = byId.get(e.target);
    if (!parent || !child || parent.type !== 'table' || child.type !== 'table') continue;
    const ct = out.tables.find((t) => t.name === child.data.label);
    const col = ct?.columns.find((c) => (child.data.columns ?? []).find((x: any) => x.id === r.toCol)?.name === c.name);
    const pcol = (parent.data.columns ?? []).find((x: any) => x.id === r.fromCol);
    if (col && pcol && !col.fk) col.fk = { table: parent.data.label, column: pcol.name };
  }
  return out;
}
