import type { InfraEdgeRaw, InfraModel, InfraRes } from './types';
import { dedupeEdges } from './util';

/**
 * Turn the raw parse into the final model: hidden resources are contracted (A -> hidden -> B becomes A -> B), edges into groups are
 * dropped, duplicate edges are merged, and groups that end up empty are removed.
 */
export function finalizeModel(model: InfraModel): InfraModel {
  const byId = new Map(model.resources.map((r) => [r.id, r]));
  let edges = dedupeEdges(model.edges, new Set(byId.keys()));
  // contract hidden resources one by one
  for (const h of model.resources.filter((r) => r.hidden)) {
    const ins = edges.filter((e) => e.to === h.id);
    const outs = edges.filter((e) => e.from === h.id);
    edges = edges.filter((e) => e.to !== h.id && e.from !== h.id);
    for (const a of ins) for (const b of outs) if (a.from !== b.to) edges.push({ from: a.from, to: b.to, label: a.label ?? b.label });
  }
  edges = dedupeEdges(edges);
  let resources = model.resources.filter((r) => !r.hidden);
  const alive = new Set(resources.map((r) => r.id));
  // groups never carry edges
  const groupIds = new Set(resources.filter((r) => r.group).map((r) => r.id));
  edges = edges.filter((e) => alive.has(e.from) && alive.has(e.to) && !groupIds.has(e.from) && !groupIds.has(e.to));
  // a member of a removed group falls back to that group's parent
  const parentOf = (r: InfraRes): string | undefined => {
    let g = r.groupOf;
    for (let i = 0; g && !alive.has(g) && i < 16; i++) g = byId.get(g)?.groupOf;
    return g && alive.has(g) ? g : undefined;
  };
  resources = resources.map((r) => ({ ...r, groupOf: parentOf(r) }));
  // remove groups without any visible content, repeatedly (a group of empty groups is empty too)
  for (;;) {
    const used = new Set(resources.map((r) => r.groupOf).filter((g): g is string => !!g));
    const next = resources.filter((r) => !r.group || used.has(r.id));
    if (next.length === resources.length) break;
    const keep = new Set(next.map((r) => r.id));
    resources = next.map((r) => (r.groupOf && !keep.has(r.groupOf) ? { ...r, groupOf: undefined } : r));
  }
  return { ...model, resources, edges: edges as InfraEdgeRaw[] };
}
