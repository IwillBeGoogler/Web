import { layeredPlace } from '../autoarrange/layered';
import { deploymentSize } from './sizes';
import type { DepDef, DeploymentModel } from './types';

/** room a container reserves above its children: one more text line when it shows a stereotype («device», «execution environment», a custom one) */
export const depHeader = (c: Pick<DepDef, 'kind' | 'stereotype'>): number => DEP_PAD.top + (c.stereotype || c.kind === 'device' || c.kind === 'executionEnvironment' ? 14 : 0);

export interface Box { x: number; y: number; w: number; h: number }
export const DEP_PAD = { x: 28, top: 44, bottom: 28, gapAcross: 40, gapAlong: 100 } as const;

/**
 * Layered left-to-right layout. Boxes of nested elements are relative to their container's top left corner; a container is
 * sized around its content. `sizeOf` overrides the size of a leaf (tidy keeps the size nodes already have).
 */
export function layoutDeployment(model: DeploymentModel, sizeOf?: (c: DepDef) => { w: number; h: number } | undefined): Map<string, Box> {
  const out = new Map<string, Box>();
  const byId = new Map(model.nodes.map((c) => [c.id, c]));
  const own = (c: DepDef) => { const s = deploymentSize({ label: c.name, depKind: c.kind }); return { w: s.width, h: s.height }; };
  function scope(parent: string | undefined): { w: number; h: number } {
    const kids = model.nodes.filter((c) => (c.parent && byId.has(c.parent) ? c.parent : undefined) === parent);
    if (!kids.length) return { w: 0, h: 0 };
    const size = new Map<string, { w: number; h: number }>();
    for (const k of kids) {
      if (model.nodes.some((c) => c.parent === k.id)) {
        const inner = scope(k.id);
        const o = own(k);
        const head = depHeader(k);
        const w = Math.max(inner.w + DEP_PAD.x * 2, o.w), h = inner.h + head + DEP_PAD.bottom;
        for (const c of model.nodes) if (c.parent === k.id) { const b = out.get(c.id)!; out.set(c.id, { ...b, x: b.x + (w - inner.w) / 2, y: b.y + head }); }
        size.set(k.id, { w, h });
      } else size.set(k.id, sizeOf?.(k) ?? own(k));
    }
    const top = (id: string): string | undefined => {
      let cur: DepDef | undefined = byId.get(id);
      while (cur && (cur.parent && byId.has(cur.parent) ? cur.parent : undefined) !== parent) cur = cur.parent ? byId.get(cur.parent) : undefined;
      return cur?.id;
    };
    const seen = new Set<string>();
    const edges: [string, string][] = [];
    for (const l of model.links) {
      const a = top(l.from), b = top(l.to);
      if (!a || !b || a === b || seen.has(`${a}>${b}`)) continue;
      seen.add(`${a}>${b}`);
      edges.push([a, b]);
    }
    const placed = layeredPlace(kids.map((k) => ({ id: k.id, w: size.get(k.id)!.w, h: size.get(k.id)!.h })), edges, { direction: 'LR', gapAcross: DEP_PAD.gapAcross, gapAlong: DEP_PAD.gapAlong });
    let maxX = 0, maxY = 0, minX = Infinity, minY = Infinity;
    for (const k of kids) { const p = placed.get(k.id)!; minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); }
    for (const k of kids) {
      const p = placed.get(k.id)!, s = size.get(k.id)!;
      const box = { x: p.x - minX, y: p.y - minY, w: s.w, h: s.h };
      out.set(k.id, box);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    }
    return { w: maxX, h: maxY };
  }
  scope(undefined);
  return out;
}
