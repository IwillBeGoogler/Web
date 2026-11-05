import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { readProject, writeProject, type YEntity, type YProject } from '../../collab/yproject';
import { createFrame } from './frames';
import { createSticky } from './sticky';
import { createStrokeNode, decodePoints } from './freehand';
import { addChild, createRoot } from './mindmap';
import type { DiagramNode } from '../../types';

const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
};
const proj = (nodes: DiagramNode[], edges: YEntity[] = []): YProject => ({ version: 2, id: 'f', name: 'Board', createdAt: 1, updatedAt: 2, activePageId: 'p', pages: [{ id: 'p', name: 'P', nodes: nodes as unknown as YEntity[], edges }] });
const nodesOf = (d: Y.Doc) => readProject(d, { id: 'f' }).pages[0].nodes as unknown as DiagramNode[];

describe('Board kinds over Yjs (two in-memory docs)', () => {
  const frame = { ...createFrame('fr', { x: 0, y: 0, width: 500, height: 400 }, 'Intro'), data: { label: 'Intro', order: 0 } };
  const sticky = createSticky('sk', { x: 100, y: 100 }, { color: 'blue', author: 'Ann', private: true, label: 'hi' });
  const stroke = createStrokeNode('dr', [0, 1, 2, 3, 4].map((i) => ({ x: i * 9, y: i * 4, p: 0.4 + i / 10 })), { color: '#f00', size: 4, brush: 'pen' })!;
  const root = createRoot('mm', { x: 0, y: 700 }, 'Idea');
  const child = addChild([root], [], 'mm', 'mm2', 'me', 'Child');
  const stamp: DiagramNode = { id: 'st', type: 'stamp', position: { x: 5, y: 5 }, width: 56, height: 56, data: { label: '', emoji: '🎉' } };
  const all = [frame, sticky, stroke, root, child.node, stamp];

  it('every new kind survives write -> sync -> read byte for byte', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    writeProject(a, proj(all, [child.edge as unknown as YEntity]), 'x');
    sync(a, b);
    const out = nodesOf(b);
    expect(out.map((n) => n.id)).toEqual(all.map((n) => n.id));
    for (const n of all) expect(out.find((o) => o.id === n.id)).toEqual(n);
    expect(decodePoints(out.find((n) => n.id === 'dr')!.data.pts as string)).toHaveLength(5);
    expect(readProject(b, { id: 'f' }).pages[0].edges[0]).toMatchObject({ source: 'mm', target: 'mm2' });
  });

  it('concurrent edits of different fields merge: one peer reveals the sticky, the other reorders the frame', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    writeProject(a, proj(all), 'x');
    sync(a, b);
    const edit = (d: Y.Doc, fn: (n: DiagramNode[]) => DiagramNode[]) => writeProject(d, proj(fn(nodesOf(d))), 'x');
    edit(a, (ns) => ns.map((n) => (n.id === 'sk' ? { ...n, data: { ...n.data, private: undefined } } : n)));
    edit(b, (ns) => ns.map((n) => (n.id === 'fr' ? { ...n, data: { ...n.data, order: 3 } } : n)));
    sync(a, b);
    for (const d of [a, b]) {
      const ns = nodesOf(d);
      expect(ns.find((n) => n.id === 'sk')!.data.private).toBeUndefined();
      expect(ns.find((n) => n.id === 'fr')!.data.order).toBe(3);
    }
    expect(nodesOf(a)).toEqual(nodesOf(b));
  });

  it('a stroke drawn by one peer and a stamp placed by another both arrive', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    writeProject(a, proj([frame]), 'x');
    sync(a, b);
    writeProject(a, proj([frame, stroke]), 'x');
    writeProject(b, proj([frame, stamp]), 'x');
    sync(a, b);
    expect(nodesOf(a).map((n) => n.id).sort()).toEqual(['dr', 'fr', 'st']);
    expect(nodesOf(b).map((n) => n.id).sort()).toEqual(['dr', 'fr', 'st']);
  });

  it('erasing a stroke on one peer deletes it on the other', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    writeProject(a, proj([frame, stroke]), 'x');
    sync(a, b);
    writeProject(b, proj([frame]), 'x');
    sync(a, b);
    expect(nodesOf(a).map((n) => n.id)).toEqual(['fr']);
  });
});
