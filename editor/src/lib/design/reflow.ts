/** One pass after the document changed: auto-layout reflow, then child constraints of containers/frames that were resized. Pure. */
import type { DiagramNode } from '../../types';
import { nodeSize } from '../graph';
import { reflowAll } from '../autolayout/autolayout';
import { resizeWithConstraints } from '../precision/precision';

export function designPass(prev: DiagramNode[], next: DiagramNode[], o: { dragging: boolean }): DiagramNode[] | null {
  if (o.dragging) return null;
  let cur = next;
  // constraints: a frame / group whose size changed moves or stretches the children that have constraints
  const before = new Map(prev.map((n) => [n.id, n]));
  for (const n of next) {
    if (n.type !== 'frame' && n.type !== 'group') continue;
    const was = before.get(n.id);
    if (!was) continue;
    const a = nodeSize(was);
    const b = nodeSize(n);
    if (a.width === b.width && a.height === b.height) continue;
    if (n.data.autoLayout) continue; // auto layout owns its children
    const oldBox = cur.map((x) => (x.id === n.id ? { ...x, width: a.width, height: a.height } : x));
    const out = resizeWithConstraints(oldBox, n.id, a, b);
    if (out !== oldBox) cur = out.map((x) => (x.id === n.id ? cur.find((y) => y.id === n.id)! : x));
  }
  cur = reflowAll(cur);
  return cur === next ? null : cur;
}
