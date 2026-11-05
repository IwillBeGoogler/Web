import type { DiagramNode } from '../../types';

export interface RegionDivider { axis: 'x' | 'y'; pos: number }

const sizeOf = (n: DiagramNode): { w: number; h: number } => ({
  w: n.width ?? (n.style?.width as number | undefined) ?? 0,
  h: n.height ?? (n.style?.height as number | undefined) ?? 0,
});

/**
 * Dashed dividers between the concurrent regions of a composite state, in the composite's own coordinates. Regions sit side by side
 * (vertical dividers) or stacked (horizontal ones, left to right diagrams); the line runs through the gap between two regions.
 * Entry / exit points are pinned to the border and never count.
 */
export function regionDividers(children: DiagramNode[]): RegionDivider[] {
  const byRegion = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
  for (const n of children) {
    if (n.type === 'state' && ((n.data as { stateKind?: string }).stateKind === 'entryPoint' || (n.data as { stateKind?: string }).stateKind === 'exitPoint')) continue;
    const r = (n.data as { region?: number }).region ?? 0;
    const { w, h } = sizeOf(n);
    const b = byRegion.get(r) ?? { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    byRegion.set(r, { x0: Math.min(b.x0, n.position.x), x1: Math.max(b.x1, n.position.x + w), y0: Math.min(b.y0, n.position.y), y1: Math.max(b.y1, n.position.y + h) });
  }
  const regs = [...byRegion.keys()].sort((a, b) => a - b).map((r) => byRegion.get(r)!);
  const out: RegionDivider[] = [];
  for (let i = 0; i + 1 < regs.length; i++) {
    const a = regs[i], b = regs[i + 1];
    if (b.x0 >= a.x1) out.push({ axis: 'x', pos: (a.x1 + b.x0) / 2 });
    else if (b.y0 >= a.y1) out.push({ axis: 'y', pos: (a.y1 + b.y0) / 2 });
  }
  return out;
}
