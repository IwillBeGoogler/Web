import type { DiagramNode } from '../../types';
import { fuzzyScore } from '../commands';
import { classOf } from './geometry';
import { displayName, formatAttribute, formatOperation } from './member';

export interface ClassHit {
  nodeId: string;
  kind: 'class' | 'member';
  title: string;
  detail: string;
  score: number;
}

/** Find classes and their attributes / operations on a page ("Order" -> the class, "total" / "Order.tot" -> members). */
export function searchClasses(nodes: DiagramNode[], query: string, limit = 12): ClassHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const hits: ClassHit[] = [];
  for (const n of nodes) {
    if (n.type !== 'class') continue;
    const d = classOf(n);
    const t = fuzzyScore(q, d.label);
    if (t >= 0) hits.push({ nodeId: n.id, kind: 'class', title: d.label, detail: `${d.kind}${d.generics ? ` · ${displayName(d)}` : ''} · ${d.attributes.length} attributes, ${d.operations.length} operations`, score: t + 40 });
    const members = [...d.attributes.map((m) => ({ m, text: formatAttribute(m) })), ...d.operations.map((m) => ({ m, text: formatOperation(m) }))];
    for (const { m, text } of members) {
      const s = Math.max(fuzzyScore(q, m.name), fuzzyScore(q, `${d.label}.${m.name}`) - 20);
      if (s >= 0) hits.push({ nodeId: n.id, kind: 'member', title: `${d.label}.${m.name}`, detail: text, score: s });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}
