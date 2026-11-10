import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useContextMenuGuard } from './useContextMenuGuard';
import { useUiStore } from '../store/uiStore';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramNode } from '../types';

const nd = (id: string, selected = false): DiagramNode => ({ id, type: 'service', selected, position: { x: 0, y: 0 }, data: { label: id } }) as DiagramNode;
let hook: ReturnType<typeof renderHook>;

beforeEach(() => {
  vi.useFakeTimers();
  useDiagramStore.getState().reset();
  useUiStore.setState({ menu: null });
  hook = renderHook(() => useContextMenuGuard());
});
afterEach(() => { hook.unmount(); vi.useRealTimers(); document.body.innerHTML = ''; });

function ctx(el: Element, x = 5, y = 6) {
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y });
  el.dispatchEvent(ev);
  act(() => { vi.runAllTimers(); });
  return ev;
}
const html = (s: string) => { document.body.innerHTML = s; return document.body; };

describe('useContextMenuGuard', () => {
  it('lets text fields keep the native menu', () => {
    const b = html('<div class="canvas"><input id="i"/></div>');
    expect(ctx(b.querySelector('#i')!).defaultPrevented).toBe(false);
    expect(useUiStore.getState().menu).toBeNull();
  });
  it('prevents the native menu everywhere else, but only opens ours on the canvas', () => {
    const b = html('<p id="p">x</p>');
    expect(ctx(b.querySelector('#p')!).defaultPrevented).toBe(true);
    expect(useUiStore.getState().menu).toBeNull();
  });
  it('ignores targets without closest (document)', () => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    vi.runAllTimers();
    expect(useUiStore.getState().menu).toBeNull();
  });
  it('empty canvas opens the pane menu at the pointer', () => {
    const b = html('<div class="react-flow"><div id="t"></div></div>');
    ctx(b.querySelector('#t')!, 11, 22);
    expect(useUiStore.getState().menu).toMatchObject({ x: 11, y: 22, target: { type: 'pane' } });
  });
  it('does nothing when a handler already opened a menu', () => {
    const b = html('<div class="react-flow"><div id="t"></div></div>');
    const pre = { x: 1, y: 1, target: { type: 'selection' } } as never;
    useUiStore.setState({ menu: pre });
    ctx(b.querySelector('#t')!);
    expect(useUiStore.getState().menu).toBe(pre);
  });
  it('node: selects it if not selected and opens a node menu', () => {
    useDiagramStore.setState({ nodes: [nd('n1'), nd('n2', true)] });
    const b = html('<div class="react-flow"><div class="react-flow__node" data-id="n1"><span id="t"></span></div></div>');
    ctx(b.querySelector('#t')!);
    expect(useUiStore.getState().menu?.target).toEqual({ type: 'node', id: 'n1' });
    const sel = useDiagramStore.getState().nodes.filter((n) => n.selected).map((n) => n.id);
    expect(sel).toEqual(['n1']);
  });
  it('node already selected keeps the multi selection', () => {
    useDiagramStore.setState({ nodes: [nd('n1', true), nd('n2', true)] });
    const b = html('<div class="react-flow"><div class="react-flow__node" data-id="n1"><span id="t"></span></div></div>');
    ctx(b.querySelector('#t')!);
    expect(useDiagramStore.getState().nodes.filter((n) => n.selected)).toHaveLength(2);
    expect(useUiStore.getState().menu?.target).toEqual({ type: 'node', id: 'n1' });
  });
  it('edge via data-id and via data-edge-id; no id means no menu', () => {
    useDiagramStore.setState({ edges: [{ id: 'e1', source: 'a', target: 'b' } as never, { id: 'e2', source: 'a', target: 'b' } as never] });
    let b = html('<div class="react-flow"><svg><g class="react-flow__edge" data-id="e1"><path id="t"/></g></svg></div>');
    ctx(b.querySelector('#t')!);
    expect(useUiStore.getState().menu?.target).toEqual({ type: 'edge', id: 'e1' });
    useUiStore.setState({ menu: null });
    b = html('<div class="react-flow"><div data-edge-id="e2"><i id="t"></i></div></div>');
    ctx(b.querySelector('#t')!);
    expect(useUiStore.getState().menu?.target).toEqual({ type: 'edge', id: 'e2' });
    useUiStore.setState({ menu: null });
    b = html('<div class="react-flow"><div class="react-flow__edge-interaction" id="t"></div></div>');
    ctx(b.querySelector('#t')!);
    expect(useUiStore.getState().menu).toBeNull();
  });
  it('selection box opens the selection menu', () => {
    const b = html('<div class="react-flow"><div class="react-flow__nodesselection"><i id="t"></i></div></div>');
    ctx(b.querySelector('#t')!);
    expect(useUiStore.getState().menu?.target).toEqual({ type: 'selection' });
  });
});
