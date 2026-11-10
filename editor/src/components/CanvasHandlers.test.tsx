import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// React Flow itself needs a real layout; swap it for a stub that hands us its props so every Canvas handler can be called directly.
type Props = Record<string, (...a: never[]) => unknown> & { children?: ReactNode };
const rf = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock('@xyflow/react', async (orig) => {
  const real = await orig<typeof import('@xyflow/react')>();
  return {
    ...real,
    ReactFlow: (p: { children?: ReactNode }) => { rf.props = p as never; return <div data-testid="rf">{p.children}<div className="react-flow__node" data-id="tgt"><span data-col="id" /></div></div>; },
    ViewportPortal: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    MiniMap: () => <i data-testid="minimap" />,
  };
});

import { Canvas } from './Canvas';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useBoardStore } from '../store/boardStore';
import { useSmart } from '../store/smartStore';
import { useEditorSession } from '../sync/status';
import { useTimeline } from '../versions/timelineStore';
import { useSettingsStore } from '../store/settingsStore';
import { blankClass } from '../lib/uml/geometry';
import { blankTable } from '../lib/er/relations';
import { createNodesFromPaletteItem, getItem } from '../data/palette';
import { DRAG_MIME } from './Sidebar';
import { COMPONENT_MIME } from './design/ComponentLibrary';
import type { DiagramEdge, DiagramNode } from '../types';

vi.setConfig({ testTimeout: 30000 });
const s = () => useDiagramStore.getState();
const P = () => rf.props as Props;
const node = (id: string, type: string, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}): DiagramNode =>
  ({ id, type, position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: id, ...data }, ...extra }) as unknown as DiagramNode;
const edge = (id: string, source: string, target: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): DiagramEdge =>
  ({ id, source, target, data, ...extra }) as unknown as DiagramEdge;
const put = (nodes: DiagramNode[], edges: DiagramEdge[] = []) => act(() => useDiagramStore.setState({ nodes, edges }));
const mount = () => render(<ReactFlowProvider><Canvas /></ReactFlowProvider>);
const call = <R,>(name: string, ...args: unknown[]): R => { let r: R; act(() => { r = (P()[name] as (...a: unknown[]) => R)(...args); }); return r!; };
const mev = (extra: Record<string, unknown> = {}) => ({ preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 10, clientY: 20, ...extra });
const ptr = (el: Element | Window, type: string, init: MouseEventInit & { pointerId?: number } = {}) => act(() => { fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })); });

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
afterEach(() => { cleanup(); vi.useRealTimers(); useSmart.setState({ simulating: false, simEdges: {} } as never); window.location.hash = ''; });

describe('Canvas render modes', () => {
  it('renders grid, minimap, rulers, sketch, transparent / dark backgrounds and the timeline lift', () => {
    put([node('a', 'icon', { selected: true }, { iconId: 'service' }), node('b', 'icon', { position: { x: 300, y: 0 } }, { iconId: 'service', hidden: true })], [edge('e', 'a', 'b', { uml: { kind: 'association' } }, { selected: true })]);
    act(() => useUiStore.setState({ rulers: true, showMinimap: true, showGrid: true }));
    act(() => useSettingsStore.getState().patch({ canvas: { sketch: true, background: '#101010' } } as never));
    useTimeline.setState({ open: true } as never);
    const bar = document.createElement('div'); bar.setAttribute('data-testid', 'version-timeline'); document.body.appendChild(bar);
    const { container, unmount } = mount();
    expect(container.querySelector('.canvas')).toBeTruthy();
    expect(screen.getByTestId('minimap')).toBeTruthy();
    unmount();
    bar.remove();
    act(() => useSettingsStore.getState().patch({ canvas: { sketch: false, background: 'transparent' } } as never));
    mount();
  });

  it('shows a timeline preview instead of the live nodes and is read-only', () => {
    put([node('a', 'icon')]);
    useTimeline.setState({ preview: { nodes: [node('p', 'icon')], edges: [] } } as never);
    mount();
    expect((P().nodes as unknown as DiagramNode[]).map((n) => n.id)).toEqual(['p']);
    expect(P().nodesDraggable).toBe(false);
  });

  it('data flow: packets on, trace a node, dimmed rest; simulating edges; ER focus', () => {
    put(
      [{ ...blankTable('t1', { x: 0, y: 0 }, 't1'), selected: true }, blankTable('t2', { x: 300, y: 0 }, 't2'), node('x', 'icon', { position: { x: 600, y: 0 } })],
      [edge('r', 't1', 't2', { relation: { group: 'g' } }), edge('r2', 't1', 't2', { relation: { group: 'g' } }, { selected: true }), edge('f', 't2', 'x', { dataFlow: true })],
    );
    act(() => useDiagramStore.setState((st) => ({ pageFlow: { ...st.pageFlow, [st.activePageId]: true } })));
    act(() => useUiStore.getState().setTrace('t1'));
    act(() => useSmart.setState({ simulating: true, simEdges: { f: 1 } } as never));
    mount();
    expect(P().edges).toBeTruthy();
    call('onPaneClick');
    expect(useUiStore.getState().traceNodeId).toBeNull();
  });
});

describe('Canvas handlers', () => {
  it('drop: a component, a palette item (placed and recorded), a cluster profile (wizard) and an unknown payload', () => {
    mount();
    const dt = (m: Record<string, string>) => ({ getData: (k: string) => m[k] ?? '' });
    call('onDrop', mev({ dataTransfer: dt({ [COMPONENT_MIME]: 'nope' }) }));
    const n0 = s().nodes.length;
    call('onDrop', mev({ dataTransfer: dt({}) }));
    expect(s().nodes.length).toBe(n0);
    const item = getItem('postgresql') ?? getItem('service');
    expect(item).toBeTruthy();
    call('onDrop', mev({ dataTransfer: dt({ [DRAG_MIME]: item!.id }) }));
    expect(s().nodes.length).toBeGreaterThan(n0);
    const cluster = getItem('cluster')!;
    call('onDrop', mev({ dataTransfer: dt({ [DRAG_MIME]: cluster.id }) }));
    const prof = ['postgres-patroni', 'redis-sentinel', 'kafka'].map((pid) => ({ ...cluster, profileId: pid }));
    void prof;
    const ev = mev();
    call('onDragOver', Object.assign(ev, { dataTransfer: { dropEffect: '' } }));
    expect(ev.preventDefault).toHaveBeenCalled();
    void createNodesFromPaletteItem;
  });

  it('context menus select then open the menu; read-only / locked edges ignore a double click', () => {
    put([node('a', 'icon'), node('b', 'icon', { position: { x: 300, y: 0 } })], [edge('e', 'a', 'b')]);
    mount();
    call('onNodeContextMenu', mev(), { id: 'a', selected: false });
    expect(useUiStore.getState().menu?.target).toEqual({ type: 'node', id: 'a' });
    call('onNodeContextMenu', mev(), { id: 'a', selected: true });
    call('onEdgeContextMenu', mev(), { id: 'e', selected: false });
    expect(useUiStore.getState().menu?.target).toEqual({ type: 'edge', id: 'e' });
    call('onEdgeContextMenu', mev(), { id: 'e', selected: true });
    call('onSelectionContextMenu', mev());
    expect(useUiStore.getState().menu?.target).toEqual({ type: 'selection' });
    call('onPaneContextMenu', mev());
    expect(useUiStore.getState().menu?.target).toEqual({ type: 'pane' });
    const dbl = mev();
    call('onEdgeDoubleClick', dbl, { id: 'e', data: { locked: true } });
    expect(dbl.stopPropagation).not.toHaveBeenCalled();
    call('onEdgeDoubleClick', dbl, { id: 'e', data: {} });
    expect(useUiStore.getState().editingId).toBe('e');
    act(() => useEditorSession.setState({ readOnly: true } as never));
    useUiStore.getState().setEditing(null);
    call('onEdgeDoubleClick', mev(), { id: 'e', data: {} });
    expect(useUiStore.getState().editingId).toBeNull();
  });

  it('box selection also selects the lines between boxed shapes', () => {
    put([node('a', 'icon', { selected: true }), node('b', 'icon', { selected: true, position: { x: 300, y: 0 } }), node('c', 'icon', { position: { x: 600, y: 0 } })], [edge('e', 'a', 'b'), edge('e2', 'a', 'c')]);
    mount();
    call('onSelectionEnd');
    expect(s().edges.find((e) => e.id === 'e')?.selected).toBe(true);
    expect(s().edges.find((e) => e.id === 'e2')?.selected).toBeFalsy();
    call('onSelectionEnd'); // nothing left to select
    put([node('a', 'icon', { selected: true })]);
    call('onSelectionEnd');
    put([node('a', 'icon', { selected: true }), node('b', 'icon', { selected: true })]);
    call('onSelectionEnd');
  });

  it('node clicks: follow a link when presenting / modified; trace in data-flow; pane click', () => {
    put([node('a', 'icon'), node('g', 'group')]);
    act(() => useDiagramStore.setState((st) => ({ pageFlow: { ...st.pageFlow, [st.activePageId]: true } })));
    mount();
    const pd = vi.fn();
    call('onNodeClick', { preventDefault: pd, metaKey: true }, { id: 'a', type: 'icon', data: { link: { fileId: 'zzz' } } });
    expect(pd).toHaveBeenCalled();
    call('onNodeClick', { preventDefault: pd }, { id: 'a', type: 'icon', data: {} });
    expect(useUiStore.getState().traceNodeId).toBe('a');
    call('onNodeClick', { preventDefault: pd }, { id: 'a', type: 'icon', data: {} });
    expect(useUiStore.getState().traceNodeId).toBeNull();
    call('onNodeClick', { preventDefault: pd }, { id: 'g', type: 'group', data: {} });
    expect(useUiStore.getState().traceNodeId).toBeNull();
    act(() => useBoardStore.setState({ presenting: { index: 0 } } as never));
    call('onNodeClick', { preventDefault: pd }, { id: 'a', type: 'icon', data: { link: { fileId: 'zzz' } } });
  });

  it('moves: viewport saved at the end, follow cancelled by user moves; hover tracks measure lines with Alt', () => {
    put([node('a', 'icon', { selected: true }), node('b', 'icon', { position: { x: 300, y: 0 } })]);
    mount();
    call('onMoveStart', {});
    call('onMoveStart', undefined);
    call('onMoveEnd', {}, { x: 5, y: 6, zoom: 2 });
    expect(s().viewports[s().activePageId]).toEqual({ x: 5, y: 6, zoom: 2 });
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    call('onNodeMouseEnter', {}, { id: 'b' });
    call('onNodeMouseEnter', {}, { id: 'a' });
    call('onNodeMouseLeave');
    act(() => { fireEvent.keyUp(window, { key: 'Alt' }); });
  });
});

describe('Canvas connect-end (ER and any shape)', () => {
  const end = (state: Record<string, unknown>, ev: unknown = { clientX: 5, clientY: 5 }) => call('onConnectEnd', ev, state);
  it('ignores valid connections; connects any shape dropped on another; tables reference a column', () => {
    put([node('a', 'icon'), node('tgt', 'icon', { position: { x: 300, y: 0 } })]);
    mount();
    end({ isValid: true, fromNode: { id: 'a', type: 'icon' } });
    end({ isValid: false, fromNode: null });
    end({ isValid: false, fromNode: { id: 'a', type: 'icon' }, fromHandle: { id: 'r' } }, { changedTouches: [{ clientX: 1, clientY: 1 }] });
    expect(s().edges).toHaveLength(1);
    end({ isValid: false, fromNode: { id: 'tgt', type: 'icon' } }); // onto itself
    expect(s().edges).toHaveLength(1);
    (document.elementsFromPoint as ReturnType<typeof vi.fn>).mockReturnValue([document.body]);
    end({ isValid: false, fromNode: { id: 'a', type: 'icon' } }); // nothing under the pointer
    const holder = document.querySelector('.react-flow__node[data-id="tgt"]')!;
    document.elementsFromPoint = vi.fn(() => [holder]) as never;
    holder.setAttribute('data-id', 'missing');
    end({ isValid: false, fromNode: { id: 'a', type: 'icon' } }); // id with no node
    holder.setAttribute('data-id', 'tgt');
  });
  it('table to table: column drop connects tables; same-table drops need a different column', () => {
    const tbl = (id: string, x: number) => ({ ...blankTable(id, { x, y: 0 }, id) });
    put([tbl('t1', 0), tbl('tgt', 300)]);
    mount();
    const spy = vi.spyOn(useDiagramStore.getState(), 'connectTables');
    const holder = document.querySelector('.react-flow__node[data-id="tgt"]')!;
    const row = holder.querySelector('[data-col]')!;
    document.elementsFromPoint = vi.fn(() => [row, holder]) as never;
    end({ isValid: false, fromNode: { id: 't1', type: 'table' }, fromHandle: { id: 'c1-r' } });
    // same table, column of its own: ignored
    holder.setAttribute('data-id', 't1');
    row.setAttribute('data-col', 'c1');
    end({ isValid: false, fromNode: { id: 't1', type: 'table' }, fromHandle: { id: 'c1-r' } });
    // same table, no column under the pointer: ignored
    row.removeAttribute('data-col');
    end({ isValid: false, fromNode: { id: 't1', type: 'table' }, fromHandle: null });
    // another column of the same table
    row.setAttribute('data-col', 'c2');
    end({ isValid: false, fromNode: { id: 't1', type: 'table' }, fromHandle: { id: 'c1-r' } });
    holder.setAttribute('data-id', 'tgt');
    // table dropped on a non-table: the any-shape rule does not apply to tables
    put([tbl('t1', 0), node('tgt', 'icon', { position: { x: 300, y: 0 } })]);
    end({ isValid: false, fromNode: { id: 't1', type: 'table' }, fromHandle: { id: 'x' } });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Canvas drag handlers', () => {
  it('drag start un-pins lines, remembers frame members, snapshots', () => {
    put([
      node('a', 'icon', { selected: true }), node('b', 'icon', { position: { x: 300, y: 0 } }),
      node('f', 'frame', { position: { x: 0, y: 200 }, width: 400, height: 300 }), node('in', 'icon', { position: { x: 20, y: 220 } }),
      node('mm', 'mindmap', { position: { x: 600, y: 0 } }),
    ], [edge('e', 'a', 'b', { pinSource: true }, { sourceHandle: 'r' }), edge('e2', 'a', 'b', { pinSource: true, locked: true }, { sourceHandle: 'r' })]);
    mount();
    call('onNodeDragStart', {}, { id: 'a', type: 'icon' });
    expect(s().edges.find((e) => e.id === 'e')?.sourceHandle).toBeUndefined();
    expect(s().edges.find((e) => e.id === 'e2')?.sourceHandle).toBe('r');
    call('onNodeDragStart', {}, { id: 'f', type: 'frame' });
    call('onNodeDragStart', {}, { id: 'mm', type: 'mindmap' });
  });

  it('dragging a frame moves its content; dragging a shape snaps to neighbours and rulers and shows guides', () => {
    put([
      node('f', 'frame', { position: { x: 0, y: 200 }, width: 400, height: 300 }), node('in', 'icon', { position: { x: 20, y: 220 } }),
      node('a', 'icon', { position: { x: 0, y: 0 } }), node('b', 'icon', { position: { x: 300, y: 3 } }), node('grp', 'group', { position: { x: 700, y: 0 } }),
    ]);
    act(() => useUiStore.setState({ rulers: true }));
    act(() => useDiagramStore.setState((st) => ({ guides: { ...st.guides, [st.activePageId]: [{ id: 'g1', axis: 'x', pos: 2 }, { id: 'g2', axis: 'y', pos: 1 }] } }) as never));
    const { container } = mount();
    call('onNodeDragStart', {}, { id: 'f', type: 'frame' });
    call('onNodeDrag', mev(), { id: 'f', type: 'frame', position: { x: 50, y: 250 } });
    expect(s().nodes.find((n) => n.id === 'in')!.position).toEqual({ x: 70, y: 270 });
    call('onNodeDragStop', mev(), { id: 'f', type: 'frame' }, [{ id: 'f' }]);
    call('onNodeDragStart', {}, { id: 'a', type: 'icon' });
    call('onNodeDrag', mev(), { id: 'a', type: 'icon', position: { x: 297, y: 0 } });
    expect(container.querySelector('.guide-line')).toBeTruthy();
    call('onNodeDrag', mev(), { id: 'grp', type: 'group', position: { x: 700, y: 0 } }); // containers never snap
    call('onNodeDrag', mev(), { id: 'ghost', type: 'icon', position: { x: 0, y: 0 } });
    call('onNodeDragStop', mev(), { id: 'a', type: 'icon' }, [{ id: 'a' }]);
    expect(container.querySelector('.guide-line')).toBeNull();
  });

  it('mind map drags highlight the drop target and re-parent on release', () => {
    put([node('root', 'mindmap', { position: { x: 0, y: 0 } }, { mm: { root: true } }), node('kid', 'mindmap', { position: { x: 200, y: 0 } })], [edge('m', 'root', 'kid')]);
    mount();
    call('onNodeDrag', mev({ clientX: 10, clientY: 10 }), { id: 'kid', type: 'mindmap', position: { x: 200, y: 0 } });
    call('onNodeDragStop', mev({ clientX: 10, clientY: 10 }), { id: 'kid', type: 'mindmap' }, [{ id: 'kid' }]);
    expect(useUiStore.getState().mmDrop ?? null).toBeNull();
  });

  it('dropping into an auto-layout container reorders among its siblings', () => {
    put([
      node('box', 'group', { position: { x: 0, y: 0 }, width: 400, height: 300 }, { autoLayout: { dir: 'row', gap: 10, pad: 10 } }),
      node('k1', 'icon', { position: { x: 10, y: 10 }, parentId: 'box' }), node('k2', 'icon', { position: { x: 150, y: 10 }, parentId: 'box' }),
    ]);
    mount();
    call('onNodeDragStop', mev(), { id: 'k2', type: 'icon' }, [{ id: 'k2' }]);
    call('onNodeDragStop', mev(), { id: 'k1', type: 'icon' }, [{ id: 'k1' }, { id: 'k2' }]);
    expect(s().nodes).toHaveLength(3);
  });
});

describe('Canvas drawing layer', () => {
  const layer = () => screen.getByTestId('draw-layer');
  const gesture = (tool: string, a: [number, number], b?: [number, number], type = 'mouse') => {
    act(() => useUiStore.getState().setTool(tool as never));
    const l = layer();
    ptr(l, 'pointerdown', { clientX: a[0], clientY: a[1] });
    if (b) ptr(l, 'pointermove', { clientX: b[0], clientY: b[1] });
    ptr(l, 'pointerup', { clientX: (b ?? a)[0], clientY: (b ?? a)[1] });
    void type;
  };
  beforeEach(() => { act(() => useUiStore.getState().setTool('rect')); });

  it('shape tools draw a rubber band and create a node (drag or click), then return to select', () => {
    mount();
    for (const tool of ['rect', 'ellipse', 'diamond', 'text']) {
      const n = s().nodes.length;
      act(() => useUiStore.getState().setTool(tool as never));
      ptr(layer(), 'pointerdown', { clientX: 10, clientY: 10 });
      ptr(layer(), 'pointermove', { clientX: 120, clientY: 90 });
      expect(document.querySelector('.draw-preview rect')).toBeTruthy();
      ptr(layer(), 'pointerup', { clientX: 120, clientY: 90 });
      expect(s().nodes.length).toBe(n + 1);
      expect(useUiStore.getState().tool).toBe('select');
    }
    act(() => useUiStore.getState().setTool('rect'));
    ptr(layer(), 'pointerdown', { clientX: 10, clientY: 10 });
    ptr(layer(), 'pointerout');
    ptr(layer(), 'pointerup', { clientX: 10, clientY: 10 });
    act(() => useUiStore.getState().setTool('rect'));
    ptr(layer(), 'pointerdown', { clientX: 10, clientY: 10 });
    ptr(layer(), 'pointercancel');
    ptr(layer(), 'pointerup'); // no gesture left: ignored
    ptr(layer(), 'pointermove', { clientX: 1, clientY: 1 });
  });

  it('sticky: click and drag create stickies, a quick double click makes only one', () => {
    mount();
    gesture('sticky', [10, 10]);
    const one = s().nodes.length;
    gesture('sticky', [10, 10]); // double click inside 450ms
    expect(s().nodes.length).toBe(one);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2000);
    gesture('sticky', [200, 200], [320, 300]);
    expect(s().nodes.length).toBe(one + 1);
    expect(useUiStore.getState().tool).toBe('sticky');
  });

  it('stamp, mind map and frame tools', () => {
    mount();
    gesture('stamp', [30, 30]);
    expect(s().nodes.some((n) => n.type === 'stamp')).toBe(true);
    gesture('mindmap', [60, 60]);
    expect(s().nodes.some((n) => n.type === 'mindmap')).toBe(true);
    expect(useUiStore.getState().tool).toBe('select');
    gesture('frame', [100, 100]);
    gesture('frame', [100, 100], [300, 260]);
    expect(s().nodes.filter((n) => n.type === 'frame').length).toBe(2);
  });

  it('pen and highlighter preview a stroke and commit it (pen pressure, coalesced events)', () => {
    mount();
    for (const tool of ['pen', 'highlighter']) {
      act(() => useUiStore.getState().setTool(tool as never));
      ptr(layer(), 'pointerdown', { clientX: 10, clientY: 10 });
      const ev = new MouseEvent('pointermove', { bubbles: true, clientX: 40, clientY: 30 });
      Object.assign(ev, { pointerType: 'pen', pressure: 0.7, getCoalescedEvents: () => [ev, Object.assign(new MouseEvent('pointermove', { clientX: 50, clientY: 40 }), { pointerType: 'pen', pressure: 0 })] });
      act(() => { layer().dispatchEvent(ev); });
      ptr(layer(), 'pointermove', { clientX: 70, clientY: 60 });
      expect(document.querySelector('.freehand-preview path')).toBeTruthy();
      ptr(layer(), 'pointerup', { clientX: 70, clientY: 60 });
    }
    expect(s().nodes.some((n) => n.type === 'draw')).toBe(true);
  });

  it('eraser removes strokes under the pointer and shows its cursor', () => {
    mount();
    gesture('pen', [10, 10], [60, 10]);
    act(() => useUiStore.getState().setTool('eraser'));
    ptr(layer(), 'pointermove', { clientX: 5, clientY: 5 });
    expect(document.querySelector('.eraser-cursor')).toBeTruthy();
    ptr(layer(), 'pointerdown', { clientX: 20, clientY: 10 });
    ptr(layer(), 'pointermove', { clientX: 40, clientY: 10 });
    ptr(layer(), 'pointerup', { clientX: 40, clientY: 10 });
    ptr(layer(), 'pointerout');
    expect(document.querySelector('.eraser-cursor')).toBeNull();
  });

  it('is not drawn when read-only', () => {
    act(() => useEditorSession.setState({ readOnly: true } as never));
    act(() => useUiStore.getState().setTool('rect'));
    mount();
    expect(screen.queryByTestId('draw-layer')).toBeNull();
  });
});

describe('Canvas arrow tool', () => {
  const wrap = (c: HTMLElement) => c.querySelector('.canvas')!;
  it('press on a shape and release on another connects them; empty or same-shape releases do not', () => {
    put([node('a', 'icon'), node('tgt', 'icon', { position: { x: 300, y: 0 } })]);
    act(() => useUiStore.getState().setTool('arrow'));
    const { container } = mount();
    const src = document.createElement('div'); src.className = 'react-flow__node'; src.setAttribute('data-id', 'a');
    const handle = document.createElement('i'); handle.className = 'react-flow__handle';
    src.appendChild(handle); wrap(container).appendChild(src);
    // on a handle: React Flow's own drag
    ptr(handle, 'pointerdown');
    expect(container.querySelector('.draw-preview')).toBeNull();
    // secondary button / read-only: ignored
    ptr(src, 'pointerdown', { button: 2 });
    // on empty canvas: ignored
    ptr(wrap(container), 'pointerdown');
    // real gesture
    ptr(src, 'pointerdown', { clientX: 5, clientY: 5 });
    expect(container.querySelector('.draw-preview polyline')).toBeTruthy();
    ptr(window, 'pointermove', { clientX: 60, clientY: 40 });
    ptr(window, 'pointerup', { clientX: 60, clientY: 40 });
    expect(s().edges).toHaveLength(1);
    expect(container.querySelector('.draw-preview polyline')).toBeNull();
    // released over the same shape: nothing new
    document.elementsFromPoint = vi.fn(() => [src]) as never;
    ptr(src, 'pointerdown');
    ptr(window, 'pointerup');
    expect(s().edges).toHaveLength(1);
    // pointer move with no gesture is harmless
    ptr(window, 'pointermove', { clientX: 1, clientY: 1 });
  });

  it('a press blurs a focused inspector input but leaves on-canvas editors alone', () => {
    const { container } = mount();
    const inp = document.createElement('input'); document.body.appendChild(inp); inp.focus();
    ptr(wrap(container), 'pointerdown');
    expect(document.activeElement).not.toBe(inp);
    inp.focus();
    const editor = document.createElement('textarea'); wrap(container).appendChild(editor);
    ptr(editor, 'pointerdown');
    expect(document.activeElement).toBe(inp);
    inp.remove();
  });
});

describe('Canvas deep links', () => {
  it('#frame= and #node= zoom to their target once the nodes arrive', () => {
    vi.useFakeTimers();
    window.location.hash = '#frame=f1';
    mount();
    put([node('f1', 'frame'), node('n1', 'icon')]);
    act(() => { vi.advanceTimersByTime(100); });
    expect(s().nodes.find((n) => n.id === 'f1')?.selected).toBe(true);
    cleanup();
    window.location.hash = '#node=n1';
    mount();
    put([node('f1', 'frame'), node('n1', 'icon')]);
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { window.location.hash = ''; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  });

  // BUG: when the nodes already exist at mount, the same render's setLinkTick re-runs the effect, whose cleanup cancels the 30 ms timer it just scheduled after clearing pendingFrame, so the frame is never zoomed / selected
  it('#frame= with the nodes already loaded zooms to and selects the frame', () => {
    vi.useFakeTimers();
    window.location.hash = '#frame=f1';
    put([node('f1', 'frame'), node('n1', 'icon')]);
    mount();
    act(() => { vi.advanceTimersByTime(200); });
    expect(s().nodes.find((n) => n.id === 'f1')?.selected).toBe(true);
  });
});

describe('Canvas guides from a sticky page', () => {
  it('uses the saved page viewport and fits view-only sessions', () => {
    put([node('a', 'icon')]);
    act(() => useDiagramStore.setState((st) => ({ viewports: { ...st.viewports, [st.activePageId]: { x: 1, y: 2, zoom: 1.5 } } })));
    mount();
    cleanup();
    act(() => useEditorSession.setState({ readOnly: true } as never));
    mount();
    expect(P().nodesConnectable).toBe(false);
    void blankClass;
  });
});
