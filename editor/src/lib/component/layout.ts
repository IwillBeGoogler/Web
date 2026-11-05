import { layeredPlace } from '../autoarrange/layered';
import { shapeSize } from '../uml2/sizes';
import type { ComponentPort } from '../uml2/types';
import type { ComponentModel, CompDef } from './types';

export interface Box { x: number; y: number; w: number; h: number }
export const COMP_PAD = { x: 28, top: 52, bottom: 28, gapAcross: 44, gapAlong: 110 } as const;

/** the ports of a definition: provided on the left, required on the right (clients sit left of their providers) */
export function portsOfDef(c: Pick<CompDef, 'id' | 'provides' | 'requires'>): ComponentPort[] {
  const mk = (names: string[], kind: 'provided' | 'required', side: 'left' | 'right', from: number): ComponentPort[] =>
    names.map((name, i) => ({ id: `p${from + i + 1}`, name, kind, side, offset: (i + 1) / (names.length + 1) }));
  return [...mk(c.provides, 'provided', 'left', 0), ...mk(c.requires, 'required', 'right', c.provides.length)];
}

/** pairs (client, provider) implied by the interfaces: A requires I, B provides I */
export function interfaceLinks(model: ComponentModel): { from: string; to: string; name: string }[] {
  const out: { from: string; to: string; name: string }[] = [];
  for (const r of model.comps) for (const name of r.requires) for (const p of model.comps) if (p.id !== r.id && p.provides.includes(name)) out.push({ from: r.id, to: p.id, name });
  return out;
}

/**
 * Layered left-to-right layout. Boxes of nested components are relative to their container's top left corner; a container is
 * sized around its content. `sizeOf` overrides the size of a leaf (tidy keeps the size nodes already have).
 */
export function layoutComponents(model: ComponentModel, sizeOf?: (c: CompDef) => { w: number; h: number } | undefined): Map<string, Box> {
  const out = new Map<string, Box>();
  const byId = new Map(model.comps.map((c) => [c.id, c]));
  const pairs: [string, string][] = [
    ...model.links.map((l): [string, string] => [l.from, l.to]),
    ...interfaceLinks(model).map((l): [string, string] => [l.from, l.to]),
  ];
  function scope(parent: string | undefined): { w: number; h: number } {
    const kids = model.comps.filter((c) => (c.parent && byId.has(c.parent) ? c.parent : undefined) === parent);
    if (!kids.length) return { w: 0, h: 0 };
    const size = new Map<string, { w: number; h: number }>();
    for (const k of kids) {
      const hasKids = model.comps.some((c) => c.parent === k.id);
      if (hasKids) {
        const inner = scope(k.id);
        const own = shapeSize('component', { label: k.name, compKind: k.kind, ports: portsOfDef(k) });
        const w = Math.max(inner.w + COMP_PAD.x * 2, own.width), h = inner.h + COMP_PAD.top + COMP_PAD.bottom;
        for (const c of model.comps) if (c.parent === k.id) { const b = out.get(c.id)!; out.set(c.id, { ...b, x: b.x + (w - inner.w) / 2, y: b.y + COMP_PAD.top }); }
        size.set(k.id, { w, h });
      } else {
        const own = shapeSize('component', { label: k.name, compKind: k.kind, ports: portsOfDef(k) });
        size.set(k.id, sizeOf?.(k) ?? { w: own.width, h: own.height });
      }
    }
    const top = (id: string): string | undefined => {
      let cur: CompDef | undefined = byId.get(id);
      while (cur && (cur.parent && byId.has(cur.parent) ? cur.parent : undefined) !== parent) cur = cur.parent ? byId.get(cur.parent) : undefined;
      return cur?.id;
    };
    const seen = new Set<string>();
    const edges: [string, string][] = [];
    for (const [x, y] of pairs) {
      const a = top(x), b = top(y);
      if (!a || !b || a === b || seen.has(`${a}>${b}`)) continue;
      seen.add(`${a}>${b}`);
      edges.push([a, b]);
    }
    const placed = layeredPlace(kids.map((k) => ({ id: k.id, w: size.get(k.id)!.w, h: size.get(k.id)!.h })), edges, { direction: 'LR', gapAcross: COMP_PAD.gapAcross, gapAlong: COMP_PAD.gapAlong });
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
