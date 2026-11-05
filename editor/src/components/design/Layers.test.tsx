import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LayersPanel } from './LayersPanel';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import type { DiagramNode } from '../../types';

const n = (id: string, label: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, width: 40, height: 40, data: { label }, ...extra }) as DiagramNode;
const load = (nodes: DiagramNode[]) => useDiagramStore.setState({ nodes, edges: [] });
beforeEach(() => { useDiagramStore.getState().reset(); useUiStore.getState().resetUi(); });

describe('LayersPanel', () => {
  it('is not rendered until opened (collapsed by default)', () => {
    render(<LayersPanel />);
    expect(screen.queryByTestId('layers-panel')).toBeNull();
    act(() => useUiStore.getState().setDesign({ layersOpen: true }));
    expect(screen.getByTestId('layers-panel')).toBeTruthy();
  });
  it('lists the tree (groups show their children, collapsible), top layer first', () => {
    load([n('g', 'Backend', { type: 'group', width: 300, height: 200 }), n('a', 'API', { parentId: 'g' }), n('b', 'DB', { parentId: 'g' }), n('c', 'Cache')]);
    act(() => useUiStore.getState().setDesign({ layersOpen: true }));
    render(<LayersPanel />);
    expect(screen.getAllByRole('treeitem').map((r) => r.getAttribute('data-layer'))).toEqual(['c', 'g', 'b', 'a']);
    fireEvent.click(within(screen.getByRole('treeitem', { name: /Backend/ })).getByRole('button', { name: 'Collapse' }));
    expect(screen.getAllByRole('treeitem').map((r) => r.getAttribute('data-layer'))).toEqual(['c', 'g']);
  });
  it('click selects the node on the canvas; the canvas selection shows in the panel', () => {
    load([n('a', 'API'), n('b', 'DB')]);
    act(() => useUiStore.getState().setDesign({ layersOpen: true }));
    render(<LayersPanel />);
    fireEvent.click(screen.getByText('API'));
    expect(useDiagramStore.getState().nodes.find((x) => x.id === 'a')!.selected).toBe(true);
    act(() => useDiagramStore.getState().selectOnly('node', 'b'));
    expect(screen.getByRole('treeitem', { name: /DB/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('treeitem', { name: /API/ })).toHaveAttribute('aria-selected', 'false');
  });
  it('double-click renames inline (one undo step)', () => {
    load([n('a', 'API')]);
    act(() => useUiStore.getState().setDesign({ layersOpen: true }));
    render(<LayersPanel />);
    fireEvent.doubleClick(screen.getByText('API'));
    const input = screen.getByLabelText('Layer name');
    fireEvent.change(input, { target: { value: 'Gateway' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useDiagramStore.getState().nodes[0].data.label).toBe('Gateway');
    act(() => useDiagramStore.getState().undo());
    expect(useDiagramStore.getState().nodes[0].data.label).toBe('API');
  });
  it('the eye hides a layer and the lock locks it', () => {
    load([n('a', 'API')]);
    act(() => useUiStore.getState().setDesign({ layersOpen: true }));
    render(<LayersPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide API' }));
    expect(useDiagramStore.getState().nodes[0].data.hidden).toBe(true);
    expect(screen.getByRole('button', { name: 'Show API' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lock API' }));
    expect(useDiagramStore.getState().nodes[0].data.locked).toBe(true);
  });
  it('the filter keeps matches and their parents', () => {
    load([n('g', 'Backend', { type: 'group', width: 300, height: 200 }), n('a', 'API', { parentId: 'g' }), n('c', 'Cache')]);
    act(() => useUiStore.getState().setDesign({ layersOpen: true }));
    render(<LayersPanel />);
    fireEvent.change(screen.getByLabelText('Filter layers'), { target: { value: 'api' } });
    expect(screen.getAllByRole('treeitem').map((r) => r.getAttribute('data-layer'))).toEqual(['g', 'a']);
    fireEvent.change(screen.getByLabelText('Filter layers'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching layers')).toBeTruthy();
  });
  it('dragging a row onto a group moves it into the group; onto a sibling reorders', () => {
    load([n('c', 'Cache'), n('g', 'Backend', { type: 'group', width: 300, height: 200 }), n('a', 'API')]);
    act(() => useUiStore.getState().setDesign({ layersOpen: true }));
    render(<LayersPanel />);
    const rect = { top: 0, height: 100, bottom: 100, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON() {} };
    const over = (el: Element, y: number, dt: DataTransfer) => { const ev = createEvent.dragOver(el, { dataTransfer: dt }); Object.defineProperty(ev, 'clientY', { value: y }); fireEvent(el, ev); };
    const dt = { setData() {}, effectAllowed: '' } as unknown as DataTransfer;
    const g = screen.getByRole('treeitem', { name: /Backend/ });
    g.getBoundingClientRect = () => rect as DOMRect;
    fireEvent.dragStart(screen.getByRole('treeitem', { name: /Cache/ }), { dataTransfer: dt });
    over(g, 50, dt);
    fireEvent.drop(g, { dataTransfer: dt });
    expect(useDiagramStore.getState().nodes.find((x) => x.id === 'c')!.parentId).toBe('g');
    // reorder: API above Backend
    const api = screen.getByRole('treeitem', { name: /API/ });
    api.getBoundingClientRect = () => rect as DOMRect;
    const g2 = screen.getByRole('treeitem', { name: /Backend/ });
    g2.getBoundingClientRect = () => rect as DOMRect;
    fireEvent.dragStart(g2, { dataTransfer: dt });
    over(api, 10, dt);
    fireEvent.drop(api, { dataTransfer: dt });
    const ids = useDiagramStore.getState().nodes.map((x) => x.id);
    expect(ids.indexOf('g')).toBeGreaterThan(ids.indexOf('a'));
  });
});
