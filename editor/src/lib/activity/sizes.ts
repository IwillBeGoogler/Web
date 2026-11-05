import type { DiagramNode } from '../../types';
import type { ActivityData } from './types';

const CHAR = 7.6;
const snap = (n: number) => Math.round(n / 10) * 10;

/** size of an activity node from its data (the node owns its size, like use cases and states) */
export function activitySize(d: Record<string, unknown>): { width: number; height: number } {
  const a = d as unknown as ActivityData;
  const label = String(a.label ?? '');
  const longest = Math.max(0, ...label.split('\n').map((l) => l.length));
  const lines = label ? label.split('\n').length : 1;
  switch (a.actKind) {
    case 'initial': return { width: 28, height: 28 };
    case 'final': return { width: 36, height: 36 };
    case 'flowFinal': return { width: 30, height: 30 };
    case 'decision': return { width: 56, height: 56 };
    case 'fork': return a.vertical ? { width: 8, height: 120 } : { width: 120, height: 8 };
    case 'object': return { width: Math.max(110, snap(longest * CHAR + 32)), height: a.objectState ? 62 : 46 };
    case 'send': case 'accept': return { width: Math.max(130, snap(longest * CHAR + 56)), height: 48 };
    case 'note': return { width: Math.max(140, snap(longest * 6.8 + 28)), height: Math.max(56, 28 + lines * 17) };
    default: return { width: Math.max(120, snap(longest * CHAR + 36)), height: Math.max(48, 24 + lines * 20) };
  }
}
export function withActivitySize(n: DiagramNode): DiagramNode {
  const { width, height } = activitySize(n.data);
  return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
}
