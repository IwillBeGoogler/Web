import type { DiagramNode } from '../../types';
import type { ComponentData, UseCaseData } from './types';

const CHAR = 7.6;
const snap = (n: number) => Math.round(n / 10) * 10;

/** size of a use case / component node from its data (the node owns its size, like classes and states) */
export function shapeSize(type: 'usecase' | 'component', d: Record<string, unknown>): { width: number; height: number } {
  const label = String(d.label ?? '');
  if (type === 'usecase') {
    const u = d as unknown as UseCaseData;
    if (u.ucKind === 'actor') return { width: Math.max(70, snap(label.length * CHAR + 20)), height: 100 };
    const eps = u.extensionPoints ?? [];
    const epW = Math.max(0, ...eps.map((e) => e.length)) * 6.6 + 40;
    return { width: Math.max(150, snap(Math.max(label.length * CHAR + 56, epW))), height: (label.length > 28 ? 80 : 64) + (eps.length ? 22 + eps.length * 15 : 0) };
  }
  const c = d as unknown as ComponentData;
  const per = (c.ports ?? []).reduce((m, p) => { m[p.side] = (m[p.side] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const portH = 30 * Math.max(per.left ?? 0, per.right ?? 0) + 14, portW = 40 * Math.max(per.top ?? 0, per.bottom ?? 0) + 20;
  const fit = (r: { width: number; height: number }) => ({ width: Math.max(r.width, portW), height: Math.max(r.height, portH) });
  switch (c.compKind) {
    case 'provided': case 'required': return { width: 28, height: 28 };
    case 'node': return fit({ width: Math.max(150, snap(label.length * CHAR + 60)), height: 90 });
    case 'artifact': return fit({ width: Math.max(130, snap(label.length * CHAR + 50)), height: 72 });
    default: return fit({ width: Math.max(150, snap(label.length * CHAR + 70)), height: 72 });
  }
}
export function withShapeSize(n: DiagramNode): DiagramNode {
  // a component holding other components keeps the size its layout gave it
  if (n.type === 'component' && n.data.container && n.width && n.height) return n;
  const { width, height } = shapeSize(n.type as 'usecase' | 'component', n.data);
  return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
}
