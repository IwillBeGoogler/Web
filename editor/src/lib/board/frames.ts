/** Frames: named areas of the canvas you can link to and present. Pure helpers over the node list. */
import type { DiagramNode } from '../../types';
import { nodeSize } from '../graph';

export interface FrameRect { x: number; y: number; width: number; height: number }

export function createFrame(id: string, r: FrameRect, label: string): DiagramNode {
  return { id, type: 'frame', position: { x: r.x, y: r.y }, width: r.width, height: r.height, zIndex: -1, data: { label } };
}
export const isFrame = (n: DiagramNode): boolean => n.type === 'frame';
export const frameRect = (n: DiagramNode): FrameRect => ({ ...n.position, ...nodeSize(n) });

export function nextFrameName(nodes: DiagramNode[]): string {
  return `Frame ${nodes.filter(isFrame).length + 1}`;
}

/** explicit `data.order` first (ascending), then the rest top to bottom and left to right */
export function orderedFrames(nodes: DiagramNode[]): DiagramNode[] {
  const frames = nodes.filter(isFrame);
  const ord = (n: DiagramNode) => (typeof n.data.order === 'number' ? (n.data.order as number) : Infinity);
  return frames.sort((a, b) => {
    const oa = ord(a);
    const ob = ord(b);
    if (oa !== ob) return oa === Infinity ? 1 : ob === Infinity ? -1 : oa - ob;
    const ra = Math.round(a.position.y / 100);
    const rb = Math.round(b.position.y / 100);
    return ra !== rb ? ra - rb : a.position.x - b.position.x;
  });
}

/** move frame `id` to position `to` in the presentation order; returns the new `order` of every frame (empty if unknown) */
export function reorderFrames(nodes: DiagramNode[], id: string, to: number): Map<string, number> {
  const list = orderedFrames(nodes).map((f) => f.id);
  const from = list.indexOf(id);
  const out = new Map<string, number>();
  if (from < 0) return out;
  list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, id);
  list.forEach((fid, i) => out.set(fid, i));
  return out;
}

/** `https://host/path#frame=<id>` (an existing hash is replaced) */
export function frameLink(base: string, id: string): string {
  const i = base.indexOf('#');
  return `${i < 0 ? base : base.slice(0, i)}#frame=${encodeURIComponent(id)}`;
}
export function parseFrameHash(hash: string): string | null {
  const m = /^#?frame=(.+)$/.exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** nodes (not frames) whose centre lies inside the frame */
export function contentInFrame(nodes: DiagramNode[], frame: DiagramNode): DiagramNode[] {
  const r = frameRect(frame);
  return nodes.filter((n) => {
    if (n.id === frame.id || isFrame(n) || n.parentId) return false;
    const s = nodeSize(n);
    const cx = n.position.x + s.width / 2;
    const cy = n.position.y + s.height / 2;
    return cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height;
  });
}
