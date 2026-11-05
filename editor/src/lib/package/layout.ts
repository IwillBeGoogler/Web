import { layeredPlace } from '../autoarrange/layered';

export interface Box { x: number; y: number; w: number; h: number }
export const PKG_PAD = { x: 28, top: 44, bottom: 28, gapAcross: 40, gapAlong: 90 } as const;
export interface PkgItem { id: string; parent?: string; w: number; h: number }

/**
 * Layered layout, dependents above what they depend on. Boxes of nested items are relative to their package's top left corner;
 * a package is sized around its content. Links between items in different packages count between the packages that hold them
 * (at the level of the scope being laid out).
 */
export function layoutPackages(items: PkgItem[], links: [string, string][]): Map<string, Box> {
  const out = new Map<string, Box>();
  const byId = new Map(items.map((c) => [c.id, c]));
  const parentOf = (c: PkgItem): string | undefined => (c.parent && byId.has(c.parent) ? c.parent : undefined);
  function scope(parent: string | undefined): { w: number; h: number } {
    const kids = items.filter((c) => parentOf(c) === parent);
    if (!kids.length) return { w: 0, h: 0 };
    const size = new Map<string, { w: number; h: number }>();
    for (const k of kids) {
      if (items.some((c) => parentOf(c) === k.id)) {
        const inner = scope(k.id);
        const w = Math.max(inner.w + PKG_PAD.x * 2, k.w), h = inner.h + PKG_PAD.top + PKG_PAD.bottom;
        for (const c of items) if (parentOf(c) === k.id) { const b = out.get(c.id)!; out.set(c.id, { ...b, x: b.x + (w - inner.w) / 2, y: b.y + PKG_PAD.top }); }
        size.set(k.id, { w, h });
      } else size.set(k.id, { w: k.w, h: k.h });
    }
    const top = (id: string): string | undefined => {
      let cur: PkgItem | undefined = byId.get(id);
      while (cur && parentOf(cur) !== parent) cur = parentOf(cur) ? byId.get(parentOf(cur)!) : undefined;
      return cur?.id;
    };
    const seen = new Set<string>();
    const edges: [string, string][] = [];
    for (const [from, to] of links) {
      const a = top(from), b = top(to);
      if (!a || !b || a === b || seen.has(`${a}>${b}`)) continue;
      seen.add(`${a}>${b}`);
      edges.push([a, b]);
    }
    const placed = layeredPlace(kids.map((k) => ({ id: k.id, w: size.get(k.id)!.w, h: size.get(k.id)!.h })), edges, { direction: 'TB', gapAcross: PKG_PAD.gapAcross, gapAlong: PKG_PAD.gapAlong });
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
