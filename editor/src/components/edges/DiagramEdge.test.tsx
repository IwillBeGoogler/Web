import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import { DiagramEdge, type EdgeUi } from './DiagramEdge';
import { useDiagramStore } from '../../store/diagramStore';
import { computeRoutes, DEFAULT_ROUTING } from '../../lib/routing';
import { isOrthogonal, nearestT } from '../../lib/routing/geometry';
import { resolveSettings } from '../../lib/settings';
import type { DiagramNode } from '../../types';

type EdgeProps = ComponentProps<typeof DiagramEdge>;
const props = (p: { id: string; data: { ui: EdgeUi }; selected: boolean }) => p as unknown as EdgeProps;
const s = () => useDiagramStore.getState();
const n = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id } });
const edgeDefaults = resolveSettings(undefined, undefined).edge;
const opts = { ...DEFAULT_ROUTING, edgeDefaults };

function ui(): EdgeUi {
  const e = s().edges[0];
  const route = computeRoutes(s().nodes, s().edges, opts).get(e.id)!;
  return { route, text: typeof e.label === 'string' ? e.label : '', color: '#2d3340', width: 1.6, startMarker: 'none', endMarker: 'arrow', labelBg: true, locked: false, grid: 0, waypoints: e.data?.waypoints ?? [], alignX: [], alignY: [] };
}
const mount = (selected = true) =>
  render(
    <ReactFlowProvider>
      <svg>
        <DiagramEdge {...props({ id: s().edges[0].id, data: { ui: ui() }, selected })} />
      </svg>
    </ReactFlowProvider>,
  );

beforeEach(() => {
  s().reset();
  s().addNode(n('a', 0, 0));
  s().addNode(n('b', 400, 200));
  s().addEdge({ source: 'a', target: 'b', label: 'Traces' });
});

describe('DiagramEdge manual editing', () => {
  it('draws the routed path and shows handles only when selected', () => {
    const { container, unmount } = mount(true);
    expect(container.querySelector('path.react-flow__edge-path')!.getAttribute('d')).toBe(ui().route.d);
    expect(screen.getByTestId('endpoint-source')).toBeInTheDocument();
    expect(screen.getByTestId('endpoint-target')).toBeInTheDocument();
    unmount();
    mount(false);
    expect(screen.queryByTestId('endpoint-source')).toBeNull();
    expect(screen.queryByTestId('segment-handle-1')).toBeNull();
  });
  it('dragging a segment handle moves the segment, marks the edge manual and the path stays orthogonal', () => {
    mount(true);
    const before = ui().route.points;
    const handle = screen.getByTestId('segment-handle-1'); // the vertical middle segment of the Z route
    const x0 = before[1].x;
    fireEvent.pointerDown(handle, { clientX: x0, clientY: 100 });
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: x0 + 40, clientY: 100 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: x0 + 40, clientY: 100 }));
    });
    const e = s().edges[0];
    expect(e.data?.manual).toBe(true);
    const after = computeRoutes(s().nodes, s().edges, opts).get(e.id)!.points;
    expect(isOrthogonal(after)).toBe(true);
    expect(after.some((p) => Math.abs(p.x - (x0 + 40)) < 1e-6)).toBe(true);
    expect(after[0]).toEqual(before[0]);
    expect(after[after.length - 1]).toEqual(before[before.length - 1]);
    // one drag = one undo step
    s().undo();
    expect(s().edges[0].data?.manual).toBeUndefined();
  });
  it('straight edges: the midpoint handle adds a waypoint on drag; double-click on a waypoint removes it', () => {
    s().updateEdges([s().edges[0].id], { lineType: 'straight' });
    const { rerender } = mount(true);
    fireEvent.pointerDown(screen.getByTestId('add-waypoint-0'), { clientX: 250, clientY: 130 });
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 260, clientY: 40 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 260, clientY: 40 }));
    });
    expect(s().edges[0].data?.waypoints).toEqual([{ x: 260, y: 40 }]);
    rerender(
      <ReactFlowProvider>
        <svg>
          <DiagramEdge {...props({ id: s().edges[0].id, data: { ui: ui() }, selected: true })} />
        </svg>
      </ReactFlowProvider>,
    );
    fireEvent.doubleClick(screen.getByTestId('waypoint-0'));
    expect(s().edges[0].data?.waypoints).toEqual([]);
  });
  it('locked edges show no editing handles', () => {
    const u = ui();
    render(
      <ReactFlowProvider>
        <svg>
          <DiagramEdge {...props({ id: s().edges[0].id, data: { ui: { ...u, locked: true } }, selected: true })} />
        </svg>
      </ReactFlowProvider>,
    );
    expect(screen.queryByTestId('endpoint-source')).toBeNull();
  });
});

describe('DiagramEdge: endpoint reconnect, label drag, reset route, jumps', () => {
  const remount = (selected = true) =>
    render(
      <ReactFlowProvider>
        <svg>
          <DiagramEdge {...props({ id: s().edges[0].id, data: { ui: ui() }, selected })} />
        </svg>
      </ReactFlowProvider>,
    );
  it('dragging an endpoint handle onto another node reconnects that end (one undo step)', () => {
    s().addNode(n('c', 400, 500));
    const el = document.createElement('div');
    el.className = 'react-flow__node';
    el.setAttribute('data-id', 'c');
    document.body.appendChild(el);
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [el];
    remount();
    fireEvent.pointerDown(screen.getByTestId('endpoint-target'), { clientX: 400, clientY: 230 });
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 450, clientY: 530 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 450, clientY: 530 }));
    });
    expect(s().edges[0].target).toBe('c');
    expect(s().edges[0].source).toBe('a');
    s().undo();
    expect(s().edges[0].target).toBe('b');
    el.remove();
  });
  it('label drag: the pointer position maps to a position along the REAL route (labelT) and persists', () => {
    const id = s().edges[0].id;
    const route = computeRoutes(s().nodes, s().edges, opts).get(id)!;
    const pts = route.points;
    // what DiagramEdge's onDrag does: nearest point on the path -> t -> store
    const nearSource = nearestT(pts, { x: pts[0].x + 5, y: pts[0].y + 1 });
    const nearTarget = nearestT(pts, { x: pts[pts.length - 1].x - 5, y: pts[pts.length - 1].y });
    expect(nearSource).toBeLessThan(0.2);
    expect(nearTarget).toBeGreaterThan(0.8);
    s().snapshot();
    s().setLabelPosition(id, nearTarget, undefined, false);
    expect(s().edges[0].data?.labelT).toBeCloseTo(nearTarget, 5);
    const moved = computeRoutes(s().nodes, s().edges, opts).get(id)!;
    expect(moved.labelPt.x).not.toBeCloseTo(route.labelPt.x, 0);
    s().undo();
    expect(s().edges[0].data?.labelT).toBeUndefined();
  });
  it('reset route clears waypoints and label offsets (undoable)', () => {
    s().setEdgeRoute(s().edges[0].id, [{ x: 200, y: -50 }]);
    s().setLabelPosition(s().edges[0].id, 0.25);
    expect(s().edges[0].data?.manual).toBe(true);
    s().resetRoute(s().edges[0].id);
    expect(s().edges[0].data?.manual).toBeUndefined();
    expect(s().edges[0].data?.labelT).toBeUndefined();
    s().undo();
    expect(s().edges[0].data?.manual).toBe(true);
  });
  it('line jumps: a hop arc appears where two orthogonal edges cross, and only when enabled', () => {
    s().reset();
    s().addNode(n('a', 0, 100));
    s().addNode(n('b', 500, 100));
    s().addNode(n('c', 250, -200));
    s().addNode(n('d', 250, 400));
    s().connect({ source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left' });
    s().connect({ source: 'c', target: 'd', sourceHandle: 'bottom', targetHandle: 'top' });
    const off = computeRoutes(s().nodes, s().edges, { ...opts, jumps: false });
    const on = computeRoutes(s().nodes, s().edges, { ...opts, jumps: true });
    const d = (m: typeof on) => [...m.values()].map((r) => r.d).join(' ');
    expect(d(off)).not.toMatch(/A/);
    expect(d(on)).toMatch(/A/);
  });
});
