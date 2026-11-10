import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Props = Record<string, (...a: never[]) => unknown> & { children?: ReactNode };
const rf = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock('@xyflow/react', async (orig) => {
  const real = await orig<typeof import('@xyflow/react')>();
  return {
    ...real,
    ReactFlow: (p: { children?: ReactNode }) => { rf.props = p as never; return <div data-testid="rf">{p.children}<div className="react-flow__node" data-id="tgt"><span data-col="id" /></div></div>; },
    ViewportPortal: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    MiniMap: (p: { style?: { bottom?: number } }) => <i data-testid="minimap" data-bottom={p.style?.bottom} />,
  };
});

const flowLayer = vi.hoisted(() => ({ visible: undefined as undefined | ((p: { edgeIds: string[] }) => boolean) }));
vi.mock('./FlowLayer', () => ({ FlowLayer: (p: { visible?: (p: { edgeIds: string[] }) => boolean }) => { flowLayer.visible = p.visible; return <b data-testid="flow-layer" />; } }));

import { Canvas } from './Canvas';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useBoardStore } from '../store/boardStore';
import { useSmart } from '../store/smartStore';
import { useEditorSession } from '../sync/status';
import { useTimeline } from '../versions/timelineStore';
import { getItem } from '../data/palette';
import '../data/bootstrap';
import { DRAG_MIME } from './Sidebar';
import { SKETCH_FILTER_NODE_LIMIT } from '../lib/sketch';
import { useSettingsStore } from '../store/settingsStore';
import type { DiagramEdge, DiagramNode } from '../types';

vi.setConfig({ testTimeout: 30000 });
const s = () => useDiagramStore.getState();
const P = () => rf.props as Props;
const node = (id: string, type: string, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}): DiagramNode =>
  ({ id, type, position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: id, ...data }, ...extra }) as unknown as DiagramNode;
const edge = (id: string, source: string, target: string, data?: Record<string, unknown>, extra: Record<string, unknown> = {}): DiagramEdge =>
  ({ id, source, target, ...(data ? { data } : {}), ...extra }) as unknown as DiagramEdge;
const put = (nodes: DiagramNode[], edges: DiagramEdge[] = []) => act(() => useDiagramStore.setState({ nodes, edges }));
const mount = () => render(<ReactFlowProvider><Canvas /></ReactFlowProvider>);
const call = <R,>(name: string, ...args: unknown[]): R => { let r: R; act(() => { r = (P()[name] as (...a: unknown[]) => R)(...args); }); return r!; };
const mev = (extra: Record<string, unknown> = {}) => ({ preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 10, clientY: 20, ...extra });
const ptr = (el: Element | Window, type: string, init: MouseEventInit = {}, extra: Record<string, unknown> = {}) => act(() => { const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }); Object.assign(ev, extra); fireEvent(el, ev); });

beforeEach(() => {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  useBoardStore.getState().reset();
  useEditorSession.setState({ readOnly: false } as never);
  useTimeline.setState({ open: false, preview: null } as never);
  document.elementsFromPoint = vi.fn(() => [document.querySelector('.react-flow__node[data-id="tgt"] span')].filter(Boolean)) as never;
  window.location.hash = '';
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); useSmart.setState({ simulating: false, simEdges: {} } as never); window.location.hash = ''; });

describe('minimap lift above the version timeline', () => {
  it('measures the bar, re-measures through a ResizeObserver and waits for a bar that appears late', () => {
    const observers: { cb: () => void; observed: Element[] }[] = [];
    vi.stubGlobal('ResizeObserver', class { observed: Element[] = []; constructor(public cb: () => void) { observers.push(this); } observe(el: Element) { this.observed.push(el); } disconnect() {} });
    const bar = document.createElement('div');
    bar.setAttribute('data-testid', 'version-timeline');
    let barTop = 400;
    bar.getBoundingClientRect = () => ({ top: barTop, bottom: barTop + 100, left: 0, right: 0, width: 0, height: 100, x: 0, y: barTop, toJSON() {} });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('canvas') ? ({ top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600, x: 0, y: 0, toJSON() {} } as DOMRect) : ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect);
    });
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    useTimeline.setState({ open: true } as never);
    act(() => useUiStore.setState({ showMinimap: true }));
    mount();
    expect(screen.getByTestId('minimap').getAttribute('data-bottom')).toBe('280'); // no bar yet: default lift
    document.body.appendChild(bar);
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByTestId('minimap').getAttribute('data-bottom')).toBe(String(200 + 12));
    expect(observers.length).toBe(1);
    barTop = 300;
    act(() => observers[0].cb());
    expect(screen.getByTestId('minimap').getAttribute('data-bottom')).toBe(String(300 + 12));
    barTop = 700; // bar below the canvas: no change
    act(() => observers[0].cb());
    expect(screen.getByTestId('minimap').getAttribute('data-bottom')).toBe(String(300 + 12));
    act(() => useTimeline.setState({ open: false } as never));
    expect(screen.getByTestId('minimap').getAttribute('data-bottom')).toBe('76');
    bar.remove();
  });
  it('works without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const bar = document.createElement('div');
    bar.setAttribute('data-testid', 'version-timeline');
    document.body.appendChild(bar);
    useTimeline.setState({ open: true } as never);
    act(() => useUiStore.setState({ showMinimap: true }));
    mount();
    expect(screen.getByTestId('minimap').getAttribute('data-bottom')).toBe('280');
    bar.remove();
  });
});

describe('initial viewport and misc', () => {
  it('uses the real client size when the wrapper has one', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
    put([node('a', 'icon')]);
    mount();
    expect(s().viewports[s().activePageId]).toBeTruthy();
  });
  it('snapping rounds a dropped palette item to half the grid', () => {
    act(() => useUiStore.setState({ snap: true } as never));
    mount();
    const item = getItem('service')!;
    call('onDrop', mev({ clientX: 33, clientY: 47, dataTransfer: { getData: (k: string) => (k === DRAG_MIME ? item.id : '') } }));
    const n = s().nodes[s().nodes.length - 1];
    expect(n.position.x % 10).toBe(0);
    expect(n.position.y % 10).toBe(0);
  });
  it('without snapping a dropped item keeps the raw pointer position', () => {
    act(() => useUiStore.setState({ snap: false } as never));
    mount();
    const item = getItem('service')!;
    call('onDrop', mev({ clientX: 33, clientY: 47, dataTransfer: { getData: (k: string) => (k === DRAG_MIME ? item.id : '') } }));
    const n = s().nodes[s().nodes.length - 1];
    expect(n.position.x % 10).not.toBe(0);
  });
  it('dropping a cluster profile opens the wizard instead of adding nodes', () => {
    mount();
    const prof = getItem('cluster-kafka');
    expect(prof?.profileId).toBeTruthy();
    const before = s().nodes.length;
    call('onDrop', mev({ dataTransfer: { getData: (k: string) => (k === DRAG_MIME ? prof!.id : '') } }));
    expect(s().nodes.length).toBe(before);
    expect(useUiStore.getState().wizard?.profileId).toBe(prof!.profileId);
  });
  it('hand tool pans with any drag; select tool pans with the middle button only', () => {
    mount();
    expect(P().panOnDrag).toEqual([1]);
    cleanup();
    act(() => useUiStore.getState().setTool('hand'));
    mount();
    expect(P().panOnDrag).toBe(true);
    expect(P().elementsSelectable).toBe(false);
  });
  it('very large sketch pages drop the sketch filter', () => {
    act(() => useSettingsStore.getState().patch({ canvas: { sketch: true } } as never));
    put(Array.from({ length: SKETCH_FILTER_NODE_LIMIT + 1 }, (_, i) => node(`n${i}`, 'icon', { position: { x: i * 10, y: 0 } })));
    const { container } = mount();
    expect(container.querySelector('.canvas-sketch.sketch-nofilter')).toBeTruthy();
  });
  it('viewport callbacks after unmount are harmless', () => {
    const { unmount } = mount();
    const props = P();
    unmount();
    expect(() => act(() => { (props.onMoveStart as (e?: unknown) => void)(undefined); (props.onMoveEnd as (...a: unknown[]) => void)({}, { x: 0, y: 0, zoom: 1 }); })).not.toThrow();
  });
  it('pane click without a trace does nothing; ctrl-click follows a link', () => {
    mount();
    call('onPaneClick');
    expect(useUiStore.getState().traceNodeId).toBeNull();
    const pd = vi.fn();
    call('onNodeClick', { preventDefault: pd, ctrlKey: true }, { id: 'a', type: 'icon', data: { link: { fileId: 'zzz' } } });
    expect(pd).toHaveBeenCalled();
    const pd2 = vi.fn();
    call('onNodeClick', { preventDefault: pd2 }, { id: 'a', type: 'icon', data: { link: { fileId: 'zzz' } } });
    expect(pd2).not.toHaveBeenCalled();
  });
});

describe('edges without data and junction joins', () => {
  it('data-less edges render, including through a junction bus', () => {
    put(
      [node('a', 'icon', {}, { iconId: 'service' }), node('b', 'icon', { position: { x: 400, y: 0 } }, { iconId: 'service' }), node('c', 'icon', { position: { x: 200, y: 300 } }, { iconId: 'service' }), node('j', 'junction', { position: { x: 195, y: 25 }, width: 10, height: 10 })],
      [edge('e1', 'a', 'j'), edge('e2', 'j', 'b'), edge('e3', 'j', 'c')],
    );
    mount();
    const display = P().edges as unknown as { id: string; data: { ui: { color: string } } }[];
    expect(display.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(typeof display[0].data.ui.color).toBe('string');
  });
});

describe('data-flow trace', () => {
  it('tracing a node dims everything outside its path', () => {
    put([node('a', 'icon', {}, { iconId: 'service' }), node('b', 'icon', { position: { x: 300, y: 0 } }, { iconId: 'service' }), node('z', 'icon', { position: { x: 300, y: 300 } }, { iconId: 'service' })], [edge('e', 'a', 'b', { dataFlow: true }), edge('f', 'z', 'z', {})]);
    act(() => useDiagramStore.setState((st) => ({ pageFlow: { ...st.pageFlow, [st.activePageId]: true } })));
    act(() => useUiStore.getState().setTrace('a'));
    mount();
    const shown = P().nodes as unknown as DiagramNode[];
    expect(shown.find((n) => n.id === 'a')!.className).toContain('flow-trace-root');
    expect(shown.find((n) => n.id === 'z')!.className).toContain('flow-dim');
    expect(screen.getByTestId('flow-layer')).toBeTruthy();
    expect(flowLayer.visible!({ edgeIds: ['e'] })).toBe(true);
    expect(flowLayer.visible!({ edgeIds: ['f'] })).toBe(false);
  });
});

describe('measure lines', () => {
  it('hovering a node that no longer exists shows nothing', () => {
    put([node('a', 'icon', { selected: true }), node('b', 'icon', { position: { x: 300, y: 0 } })]);
    mount();
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    call('onNodeMouseEnter', {}, { id: 'ghost' });
    expect(document.querySelectorAll('.measure-line').length).toBe(0);
    act(() => { fireEvent.keyUp(window, { key: 'Alt' }); });
  });
});

describe('pen pressure and arrow release', () => {
  it('a pen stroke starts with the pen pressure', () => {
    mount();
    act(() => useUiStore.getState().setTool('pen'));
    const layer = screen.getByTestId('draw-layer');
    ptr(layer, 'pointerdown', { clientX: 10, clientY: 10 }, { pointerType: 'pen', pressure: 0.01 });
    ptr(layer, 'pointermove', { clientX: 40, clientY: 40 });
    ptr(layer, 'pointerup', { clientX: 40, clientY: 40 });
    expect(s().nodes.some((n) => n.type === 'draw')).toBe(true);
  });
  it('releasing the arrow over empty canvas connects nothing', () => {
    put([node('a', 'icon')]);
    act(() => useUiStore.getState().setTool('arrow'));
    const { container } = mount();
    const src = document.createElement('div'); src.className = 'react-flow__node'; src.setAttribute('data-id', 'a');
    container.querySelector('.canvas')!.appendChild(src);
    document.elementsFromPoint = vi.fn(() => []) as never;
    ptr(src, 'pointerdown', { clientX: 5, clientY: 5 });
    ptr(window, 'pointerup', { clientX: 99, clientY: 99 });
    expect(s().edges).toHaveLength(0);
  });
});

describe('connect-end with table source', () => {
  it('a table dropped on a non-table shape never draws a plain connection', () => {
    const tbl = node('t1', 'table', {}, { columns: [], indexes: [], checks: [] });
    put([tbl, node('tgt', 'icon', { position: { x: 300, y: 0 } })]);
    mount();
    document.elementsFromPoint = vi.fn(() => [document.querySelector('.react-flow__node[data-id="tgt"]')]) as never;
    call('onConnectEnd', { clientX: 5, clientY: 5 }, { isValid: false, fromNode: { id: 't1', type: 'table' }, fromHandle: { id: 'x' } });
    expect(s().edges).toHaveLength(0);
  });
});

describe('connect-end from a shape without a handle', () => {
  it('dropping a handle-less connection on another shape still connects them', () => {
    put([node('a', 'icon'), node('tgt', 'icon', { position: { x: 300, y: 0 } })]);
    mount();
    call('onConnectEnd', { clientX: 5, clientY: 5 }, { isValid: false, fromNode: { id: 'a', type: 'icon' }, fromHandle: null });
    expect(s().edges).toHaveLength(1);
    expect(s().edges[0]).toMatchObject({ source: 'a', target: 'tgt' });
  });
});

describe('drag handlers', () => {
  it('drag start un-pins lines whose TARGET moves', () => {
    put([node('a', 'icon'), node('b', 'icon', { position: { x: 300, y: 0 } })], [edge('e', 'a', 'b', { pinTarget: 'left' }, { targetHandle: 'l' })]);
    mount();
    call('onNodeDragStart', {}, { id: 'b', type: 'icon' });
    expect(s().edges[0].targetHandle).toBeUndefined();
    expect((s().edges[0].data as { pinTarget?: string }).pinTarget).toBeUndefined();
    put([node('a', 'icon'), node('b', 'icon', { position: { x: 300, y: 0 } })], [edge('e', 'a', 'b', {}, { targetHandle: 'l' })]);
    call('onNodeDragStart', {}, { id: 'b', type: 'icon' });
    expect(s().edges[0].targetHandle).toBe('l');
  });
  it('a mind map node dragged over an unrelated node highlights it as the new parent', () => {
    put([node('root', 'mindmap', {}, { mm: { root: true } }), node('kid', 'mindmap', { position: { x: 200, y: 0 } }), node('other', 'mindmap', { position: { x: 500, y: 0 } })], [edge('m', 'root', 'kid')]);
    mount();
    call('onNodeDrag', mev({ clientX: 520, clientY: 10 }), { id: 'kid', type: 'mindmap', position: { x: 200, y: 0 } });
    expect(useUiStore.getState().mmDrop).toBe('other');
    call('onNodeDragStop', mev({ clientX: 10, clientY: 10 }), { id: 'kid', type: 'mindmap' }, [{ id: 'kid' }]);
    expect(useUiStore.getState().mmDrop ?? null).toBeNull();
  });
  it('shape drag: rulers without guides on the page, a vertical-only snap, and no snap at all', () => {
    put([node('a', 'icon', { position: { x: 0, y: 0 } }), node('b', 'icon', { position: { x: 300, y: 3 } }), node('c', 'icon', { position: { x: 0, y: 600 } })]);
    act(() => useUiStore.setState({ rulers: true }));
    mount();
    call('onNodeDrag', mev(), { id: 'a', type: 'icon', position: { x: 0, y: 0 } });
    expect(s().nodes.find((n) => n.id === 'a')!.position.y).toBe(3); // y snaps onto b, x stays
    const before = s().nodes.find((n) => n.id === 'c')!.position;
    act(() => useUiStore.setState({ rulers: false }));
    put([node('a', 'icon', { position: { x: 0, y: 0 } }), node('far', 'icon', { position: { x: 900, y: 777 } })]);
    call('onNodeDrag', mev(), { id: 'a', type: 'icon', position: { x: 0, y: 0 } });
    expect(s().nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 0, y: 0 });
    void before;
  });
});
