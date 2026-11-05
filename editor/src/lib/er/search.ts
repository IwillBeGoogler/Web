import type { DiagramNode } from '../../types';
import { fuzzyScore } from '../commands';
import { tableOf } from './tableData';

export interface TableHit {
  nodeId: string;
  kind: 'table' | 'column';
  title: string;
  detail: string;
  score: number;
}

/** Find tables and columns on a page: "orders" -> the table, "user_id" / "orders.user" -> columns (best matches first). */
export function searchTables(nodes: DiagramNode[], query: string, limit = 12): TableHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const hits: TableHit[] = [];
  for (const n of nodes) {
    if (n.type !== 'table') continue;
    const d = tableOf(n);
    const t = fuzzyScore(q, d.label);
    if (t >= 0) hits.push({ nodeId: n.id, kind: 'table', title: d.label, detail: `${d.columns.length} columns${d.schema ? ` · ${d.schema}` : ''}`, score: t + 40 });
    for (const c of d.columns) {
      const s = Math.max(fuzzyScore(q, c.name), fuzzyScore(q, `${d.label}.${c.name}`) - 20);
      if (s >= 0) hits.push({ nodeId: n.id, kind: 'column', title: `${d.label}.${c.name}`, detail: c.type || 'value', score: s });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}
