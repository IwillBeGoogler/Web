import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';

const rf = { zoomIn: vi.fn(), zoomOut: vi.fn(), zoomTo: vi.fn(), fitView: vi.fn() };
vi.mock('@xyflow/react', async (orig) => ({ ...(await orig<typeof import('@xyflow/react')>()), useReactFlow: () => rf }));
const exec = vi.fn();
vi.mock('../lib/actions', () => ({ executeAction: (...a: unknown[]) => exec(...a) }));
const mm = vi.hoisted(() => ({ mmPromote: vi.fn(), mmAddChild: vi.fn(), mmAddSibling: vi.fn(), mmNavigate: vi.fn(), addNextStickyFrom: vi.fn() }));
vi.mock('../lib/board/actions', () => mm);

import { useShortcuts } from './useShortcuts';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useLayoutStore } from '../store/layoutStore';
import { useCommentsStore } from '../comments/store';
import { requestFit } from '../lib/fitBus';
import type { DiagramNode } from '../types';

const nd = (id: string, type: string, selected = true): DiagramNode => ({ id, type, selected, position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: id } }) as DiagramNode;
const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => { target.dispatchEvent(ev); });
  return ev;
};
const select = (...n: DiagramNode[]) => useDiagramStore.setState({ nodes: n });

beforeEach(() => {
  vi.clearAllMocks();
  useDiagramStore.getState().reset();
  useUiStore.setState({ tool: 'select', menu: null, connectFrom: null, traceNodeId: null, iconPickerFor: null, editingId: null });
  useCommentsStore.setState({ fileId: null });
  renderHook(() => useShortcuts()); // eslint-disable-line
});

describe('useShortcuts', () => {
  it('fit requests fit the given nodes with a 300ms animation', async () => {
    requestFit(['a', 'b']);
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(rf.fitView).toHaveBeenCalledWith(expect.objectContaining({ nodes: [{ id: 'a' }, { id: 'b' }], duration: 300, maxZoom: 1 }));
  });
  it('ignores keys typed into inputs', () => {
    const inp = document.createElement('input');
    document.body.appendChild(inp);
    const ev = press('r', {}, inp);
    expect(ev.defaultPrevented).toBe(false);
    expect(useUiStore.getState().tool).toBe('select');
    inp.remove();
  });
  it('tool letters switch the tool; comment tool only with a server file', () => {
    expect(press('r').defaultPrevented).toBe(true);
    expect(useUiStore.getState().tool).toBe('rect');
    press('c');
    expect(useUiStore.getState().tool).toBe('rect');
    useCommentsStore.setState({ fileId: 'f' });
    press('c');
    expect(useUiStore.getState().tool).toBe('comment');
  });
  it('panel toggles', () => {
    useLayoutStore.setState({ sidebarOpen: false, inspectorOpen: false });
    press('\\', { ctrlKey: true });
    press('.', { ctrlKey: true });
    expect(useLayoutStore.getState().sidebarOpen).toBe(true);
    expect(useLayoutStore.getState().inspectorOpen).toBe(true);
  });
  it('nudge moves the selection', () => {
    select(nd('a', 'service'));
    press('ArrowRight', { shiftKey: true });
    expect(useDiagramStore.getState().nodes[0].position.x).toBe(10);
  });
  it('undo / redo (ctrl+z, ctrl+shift+z)', () => {
    const undo = vi.spyOn(useDiagramStore.getState(), 'undo');
    const redo = vi.spyOn(useDiagramStore.getState(), 'redo');
    press('z', { ctrlKey: true });
    press('z', { ctrlKey: true, shiftKey: true });
    expect(undo).toHaveBeenCalled();
    expect(redo).toHaveBeenCalled();
  });
  it('zoom in / out / reset', () => {
    press('=', { ctrlKey: true });
    press('-', { ctrlKey: true });
    press('0', { ctrlKey: true });
    expect(rf.zoomIn).toHaveBeenCalledWith({ duration: 100 });
    expect(rf.zoomOut).toHaveBeenCalledWith({ duration: 100 });
    expect(rf.zoomTo).toHaveBeenCalledWith(1, { duration: 100 });
  });
  it('escape peels layers in order', () => {
    const close = vi.fn();
    useUiStore.setState({ menu: { x: 0, y: 0, target: { type: 'pane' } } as never, closeMenu: close, connectFrom: 'a', traceNodeId: 't', iconPickerFor: 'i', tool: 'rect' });
    press('Escape');
    expect(close).toHaveBeenCalled();
    useUiStore.setState({ menu: null });
    press('Escape');
    expect(useUiStore.getState().connectFrom).toBeNull();
    press('Escape');
    expect(useUiStore.getState().traceNodeId).toBeNull();
    press('Escape');
    expect(useUiStore.getState().iconPickerFor).toBeNull();
    press('Escape');
    expect(useUiStore.getState().tool).toBe('select');
    select(nd('a', 'service'));
    press('Escape');
    expect(useDiagramStore.getState().nodes[0].selected).toBeFalsy();
  });
  it('actions get the selected node / edge id and a fit callback', () => {
    select(nd('a', 'service'));
    press('d', { ctrlKey: true });
    expect(exec).toHaveBeenLastCalledWith('duplicate', expect.objectContaining({ nodeId: 'a', edgeId: undefined }));
    exec.mock.calls[0][1].fitView();
    expect(rf.fitView).toHaveBeenCalledWith(expect.objectContaining({ duration: 200 }));
    select();
    useDiagramStore.setState({ edges: [{ id: 'e1', source: 'a', target: 'b', selected: true } as never] });
    press('Delete');
    expect(exec).toHaveBeenLastCalledWith('delete', expect.objectContaining({ nodeId: undefined, edgeId: 'e1' }));
  });
  it('file ops and unmapped keys are left alone', () => {
    expect(press('s', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press('q', { altKey: true }).defaultPrevented).toBe(false);
  });
  describe('board keys', () => {
    it('mind map: Tab child, Shift+Tab promote, Enter sibling', () => {
      select(nd('m', 'mindmap'));
      expect(press('Tab').defaultPrevented).toBe(true);
      press('Tab', { shiftKey: true });
      press('Enter');
      expect(mm.mmAddChild).toHaveBeenCalledWith('m');
      expect(mm.mmPromote).toHaveBeenCalledWith('m');
      expect(mm.mmAddSibling).toHaveBeenCalledWith('m');
    });
    it('sticky: Tab goes right, Shift+Enter below, Enter edits', () => {
      select(nd('s', 'sticky'));
      press('Tab');
      press('Enter', { shiftKey: true });
      expect(mm.addNextStickyFrom).toHaveBeenNthCalledWith(1, 's', 'right');
      expect(mm.addNextStickyFrom).toHaveBeenNthCalledWith(2, 's', 'below');
      press('Enter');
      expect(useUiStore.getState().editingId).toBe('s');
    });
    it('frame: Enter edits its title', () => {
      select(nd('fr', 'frame'));
      press('Enter');
      expect(useUiStore.getState().editingId).toBe('fr');
    });
    it('Enter on a service falls through; Tab/Enter on a button is a control press', () => {
      select(nd('a', 'service'));
      press('Enter');
      expect(useUiStore.getState().editingId).toBeNull();
      select(nd('m', 'mindmap'));
      const b = document.createElement('button');
      document.body.appendChild(b);
      press('Enter', {}, b);
      expect(mm.mmAddSibling).not.toHaveBeenCalled();
      b.remove();
    });
    it('mind map: arrows navigate, F2 edits, typing replaces text; shift-arrow, ?, ! fall through', () => {
      select(nd('m', 'mindmap'));
      press('ArrowUp');
      expect(mm.mmNavigate).toHaveBeenCalledWith('m', 'up');
      press('F2');
      expect(useUiStore.getState().editingId).toBe('m');
      useUiStore.setState({ editingId: null });
      press('x');
      expect(useUiStore.getState().editingId).toBe('m');
      expect(useUiStore.getState().editSeed).toBe('x');
      useUiStore.setState({ editingId: null, editSeed: null });
      mm.mmNavigate.mockClear();
      press('ArrowDown', { shiftKey: true });
      expect(mm.mmNavigate).not.toHaveBeenCalled();
      press('?');
      expect(useUiStore.getState().editingId).toBeNull();
      expect(exec).toHaveBeenLastCalledWith('show-help', expect.anything());
    });
  });
  it('Tab with several nodes selected builds nothing', () => {
    select(nd('a', 'sticky'), nd('b', 'sticky'));
    press('Tab');
    expect(mm.addNextStickyFrom).not.toHaveBeenCalled();
  });
  it('a11y keyboard handling short-circuits the command lookup (Alt+arrow focuses a node)', () => {
    select(nd('a', 'service', false), nd('b', 'service', false));
    const ev = press('ArrowRight', { altKey: true });
    expect(ev.defaultPrevented).toBe(true);
    expect(exec).not.toHaveBeenCalled();
    expect(useDiagramStore.getState().nodes.some((n) => n.selected)).toBe(true);
  });
  it('removes its listener on unmount', () => {
    const h = renderHook(() => useShortcuts());
    h.unmount();
    const before = exec.mock.calls.length;
    press('?');
    expect(exec.mock.calls.length - before).toBe(1); // only the still-mounted instance from beforeEach
  });
});
