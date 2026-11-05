import type { DiagramNode } from '../../types';
import { objectTitle, type ObjectData } from './types';

/** size of an object from its data (mirrors core/dsl/build2.ts objSizeOf) */
export function objectSize(d: Record<string, unknown>): { width: number; height: number } {
  const o = d as unknown as ObjectData;
  const slots = o.slots ?? [];
  let w = objectTitle(o).length * 7.6 + 32;
  for (const s of slots) w = Math.max(w, `${s.name}${s.value ? ` = ${s.value}` : ''}`.length * 6.9 + 28);
  return { width: Math.round(Math.min(420, Math.max(150, w)) / 10) * 10, height: 36 + (slots.length ? 8 + slots.length * 22 : 0) + 2 };
}
export function withObjectSize(n: DiagramNode): DiagramNode {
  const { width, height } = objectSize(n.data);
  return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
}
