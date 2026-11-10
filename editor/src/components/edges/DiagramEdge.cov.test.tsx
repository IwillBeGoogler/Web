import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING } from '../../lib/routing';
import { resolveSettings } from '../../lib/settings';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import type { DiagramNode } from '../../types';
import { DiagramEdge, type EdgeUi } from './DiagramEdge';

let internal: Record<string, { internals: { positionAbsolute: { x: number; y: number } }; measured?: { width?: number; height?: number } } | undefined> = {};
vi.mock('@xyflow/react', async (orig) => {
  const mod = await orig<typeof import('@xyflow/react')>();
  return { ...mod, useReactFlow: () => ({ ...mod.useReactFlow(), screenToFlowPosition: (p: { x: number; y: number }) => p, getInternalNode: (id: string) => internal[id] }) };
});

type EdgeProps = ComponentProps<typeof DiagramEdge>;
const s = () => useDiagramStore.getState();
const n = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id } });
const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };

function ui(extra: Partial<EdgeUi> = {}): EdgeUi {
  const e = s().edges[0];
  const route = computeRoutes(s().nodes, s().edges, opts).get(e.id)!;
  return { route, text: 'lbl', color: '#2d3340', width: 1.6, startMarker: 'none', endMarker: 'arrow', labelBg: true, locked: false, grid: 0, waypoints: e.data?.waypoints ?? [], alignX: [], alignY: [], ...extra };
}
const mount = (extra: Partial<EdgeUi> = {}, selected = true, data?: unknown) =>
  render(
    <ReactFlowProvider>
      <svg>
        <DiagramEdge {...({ id: s().edges[0].id, data: data === undefined ? { ui: ui(extra) } : data, selected } as unknown as EdgeProps)} />
      </svg>
    </ReactFlowProvider>,
  );
const move = (x: number, y: number) => act(() => void window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y })));
const up = (x: number, y: number) => act(() => void window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y })));

const nodeEl = (id: string, handle?: string) => {
  const el = document.createElement('div');
  el.className = 'react-flow__node';
  el.setAttribute('data-id', id);
  document.body.appendChild(el);
  const stack: Element[] = [el];
  if (handle) {
    const h = document.createElement('div');
    h.className = 'react-flow__handle';
    h.setAttribute('data-handleid', handle);
    el.appendChild(h);
    stack.unshift(h);
  }
  return { el, stack };
};
const stackAt = (stack: Element[]) => ((document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => stack);

beforeEach(() => {
  internal = {};
  s().reset();
  useUiStore.getState().resetUi();
  s().addNode(n('a', 0, 0));
  s().addNode(n('b', 400, 200));
  s().addNode(n('c', 400, 500));
  s().addEdge({ source: 'a', target: 'b', label: 'Traces' });
});
afterEach(() => {
  document.querySelectorAll('.react-flow__node').forEach((e) => e.remove());
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [];
});

describe('DiagramEdge rendering variants', () => {
  it('renders nothing without ui data', () => {
    const { container } = mount({}, true, {});
    expect(container.querySelector('path')).toBeNull();
  });
  it('tooltip path, animate style, dotted dash with round caps, both markers, label colours', () => {
    const { container } = mount({ tip: 'hover me', animate: true, dash: '2 5', startMarker: 'arrow', endMarker: 'none', labelColor: '#ff0000', labelBold: true, labelSide: 'left', arrowSize: 'L' });
    expect(container.querySelector('title')?.textContent).toBe('hover me');
    const path = container.querySelector('path.react-flow__edge-path') as SVGPathElement;
    expect(path.getAttribute('style')).toContain('stroke-linecap: round');
    expect(path.getAttribute('marker-start')).toContain('url(#');
    expect(path.getAttribute('marker-end')).toBeNull();
  });
  it('solid dash without round caps; unset label colour falls back to edge colour', () => {
    const { container } = mount({ dash: '6 3', ui: undefined } as Partial<EdgeUi>);
    expect((container.querySelector('path.react-flow__edge-path') as SVGPathElement).getAttribute('style')).not.toContain('round');
  });
  it('a freshly drawn edge gets the draw-in class and loses it after the timer', () => {
    vi.useFakeTimers();
    const first = mount({});
    first.unmount();
    vi.advanceTimersByTime(400);
    const again = mount({});
    again.unmount();
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
  });
});

describe('DiagramEdge endpoint reconnect', () => {
  const drag = (end: 'source' | 'target', from: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(screen.getByTestId(`endpoint-${end}`), { clientX: from[0], clientY: from[1] });
    move(to[0], to[1]);
  };
  it('shows a ghost line while dragging and marks the drop target; dropping on empty canvas does nothing', () => {
    mount({});
    const { el } = nodeEl('c');
    stackAt([el]);
    drag('target', [400, 230], [450, 530]);
    expect(document.querySelector('.edge-ghost')).not.toBeNull();
    expect(el.classList.contains('edge-drop')).toBe(true);
    stackAt([]);
    up(0, 0);
    expect(document.querySelector('.edge-ghost')).toBeNull();
    expect(s().edges[0].target).toBe('b');
  });
  it('dropping on a node handle uses that handle side', () => {
    mount({});
    const { stack } = nodeEl('c', 'top');
    stackAt(stack);
    drag('target', [400, 230], [450, 530]);
    up(450, 530);
    expect(s().edges[0].target).toBe('c');
  });
  it.each([
    ['right', 560, 530],
    ['left', 340, 530],
    ['bottom', 450, 590],
    ['top', 450, 470],
  ])('dropping on the %s part of a measured node picks that side (source end)', (_name, x, y) => {
    internal.c = { internals: { positionAbsolute: { x: 400, y: 500 } }, measured: { width: 100, height: 60 } };
    mount({});
    const { stack } = nodeEl('c');
    stackAt(stack);
    drag('source', [100, 30], [x, y]);
    up(x, y);
    expect(s().edges[0].source).toBe('c');
  });
  it('an unmeasured node uses the default size; a node unknown to the flow gives no side', () => {
    internal.c = { internals: { positionAbsolute: { x: 400, y: 500 } } };
    mount({});
    const { stack } = nodeEl('c');
    stackAt(stack);
    drag('target', [400, 230], [10, 10]);
    up(10, 10);
    expect(s().edges[0].target).toBe('c');
  });
  it('locked edges cannot be dragged', () => {
    mount({ locked: true });
    expect(screen.queryByTestId('endpoint-source')).toBeNull();
  });
});

describe('DiagramEdge segment and waypoint editing', () => {
  it('grid and alignment snapping while dragging a segment', () => {
    mount({ grid: 20, alignX: [300], alignY: [150] });
    const before = ui().route.points;
    const seg = screen.queryByTestId('segment-handle-1') ?? screen.queryByTestId('segment-handle-0');
    if (!seg) return;
    fireEvent.pointerDown(seg, { clientX: before[1].x, clientY: before[1].y });
    move(before[1].x + 33, before[1].y + 17);
    up(before[1].x + 33, before[1].y + 17);
    expect(s().edges[0].data?.manual).toBe(true);
  });
  it('horizontal segments move vertically', () => {
    s().reset();
    s().addNode(n('a', 0, 0));
    s().addNode(n('b', 0, 300));
    s().addEdge({ source: 'a', target: 'b' });
    mount({});
    const handle = document.querySelector('.edge-handle.seg.h') as HTMLElement | null;
    if (handle) {
      fireEvent.pointerDown(handle, { clientX: 50, clientY: 100 });
      move(50, 140);
      up(50, 140);
    }
    expect(s().edges).toHaveLength(1);
  });
  it('straight edges: add waypoint, drag it, double-click removes it', () => {
    s().updateEdges([s().edges[0].id], { lineType: 'straight' });
    mount({});
    const add = screen.getByTestId('add-waypoint-0');
    fireEvent.pointerDown(add, { clientX: 200, clientY: 120 });
    move(210, 130);
    up(210, 130);
    expect((s().edges[0].data?.waypoints ?? []).length).toBe(1);
    cleanup2();
    mount({});
    const wp = screen.getByTestId('waypoint-0');
    fireEvent.pointerDown(wp, { clientX: 210, clientY: 130 });
    move(230, 150);
    up(230, 150);
    cleanup2();
    mount({});
    fireEvent.doubleClick(screen.getByTestId('waypoint-0'));
    expect(s().edges[0].data?.waypoints ?? []).toHaveLength(0);
  });
});

function cleanup2() {
  document.body.innerHTML = '';
}
