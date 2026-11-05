import { act, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiagramEdge, type EdgeUi } from './edges/DiagramEdge';
import { useDiagramStore } from '../store/diagramStore';
import { computeRoutes, createRouteCache, DEFAULT_ROUTING } from '../lib/routing';
import { resolveSettings } from '../lib/settings';
import type { DiagramNode } from '../types';

type EdgeProps = ComponentProps<typeof DiagramEdge>;
const s = () => useDiagramStore.getState();
const n = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id } });
const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
const cache = createRouteCache();

const ui = (): EdgeUi => {
  const e = s().edges[0];
  const route = computeRoutes(s().nodes, s().edges, opts, cache).get(e.id)!;
  return { route, text: '', color: '#2d3340', width: 1.6, startMarker: 'none', endMarker: 'arrow', labelBg: true, locked: false, grid: 0, waypoints: [], alignX: [], alignY: [], animate: false };
};
const view = () => (
  <ReactFlowProvider>
    <svg>
      <DiagramEdge {...({ id: s().edges[0].id, data: { ui: ui() }, selected: false } as unknown as EdgeProps)} />
    </svg>
  </ReactFlowProvider>
);
const pts = (d: string) => {
  const nums = d.replace(/[A-Za-z]/g, ' ').trim().split(/[\s,]+/).map(Number);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
};
const crosses = (p: { x: number; y: number }[], r: { x: number; y: number; w: number; h: number }) =>
  p.slice(1).some((b, i) => {
    const a = p[i];
    return Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h;
  });

/** What React Flow does while the user drags: a position change flagged `dragging`. */
const drag = (id: string, position: { x: number; y: number }, dragging = true) =>
  act(() => s().onNodesChange([{ type: 'position', id, position, dragging }]));

beforeEach(() => {
  s().reset();
  s().loadDiagram({ nodes: [n('a', 0, 0), n('b', 600, 0), n('c', 300, 300)], edges: [{ id: 'e', source: 'a', target: 'b', data: {} }] });
});

describe('dragging re-routes edges live', () => {
  it('dragging a third node onto the edge changes path d, and the new path goes around it', () => {
    const { container, rerender } = render(view());
    const d0 = container.querySelector('path.react-flow__edge-path')!.getAttribute('d')!;
    expect(d0).toBeTruthy();
    drag('c', { x: 300, y: 0 });
    rerender(view());
    const d1 = container.querySelector('path.react-flow__edge-path')!.getAttribute('d')!;
    expect(d1).not.toBe(d0);
    expect(crosses(pts(d1), { x: 300, y: 0, w: 100, h: 60 })).toBe(false);
    // and drops cleanly: releasing the node keeps it
    drag('c', { x: 300, y: 0 }, false);
    rerender(view());
    expect(container.querySelector('path.react-flow__edge-path')!.getAttribute('d')).toBe(d1);
  });
  it('dragging the target from below to the right flips the attachment sides', () => {
    s().loadDiagram({ nodes: [n('a', 400, 400), n('b', 400, 800)], edges: [{ id: 'e', source: 'a', target: 'b', data: {} }] });
    const { container, rerender } = render(view());
    expect(pts(container.querySelector('path.react-flow__edge-path')!.getAttribute('d')!)[0]).toEqual({ x: 450, y: 460 }); // bottom of a
    drag('b', { x: 800, y: 400 });
    rerender(view());
    expect(pts(container.querySelector('path.react-flow__edge-path')!.getAttribute('d')!)[0]).toEqual({ x: 500, y: 430 }); // right of a
  });
});
