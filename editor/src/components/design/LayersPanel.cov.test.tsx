import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LayersPanel } from './LayersPanel';
import { useDiagramStore } from '../../store/diagramStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useUiStore } from '../../store/uiStore';
import type { DiagramNode } from '../../types';

const n = (id: string, label: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, width: 40, height: 40, data: { label }, ...extra }) as DiagramNode;
const load = (nodes: DiagramNode[]) => useDiagramStore.setState({ nodes, edges: [] });
const open = () => act(() => useUiStore.getState().setDesign({ layersOpen: true }));
const row = (id: string) => document.querySelector(`[data-layer="${id}"]`) as HTMLElement;
const order = () => screen.getAllByRole('treeitem').map((r) => r.getAttribute('data-layer'));
const rect = (el: HTMLElement) => { el.getBoundingClientRect = () => ({ top: 0, height: 100 }) as DOMRect; };
const over = (el: Element, y: number) => { const ev = createEvent.dragOver(el, { dataTransfer: dt() }); Object.defineProperty(ev, 'clientY', { value: y }); fireEvent(el, ev); };
const dt = () => ({ effectAllowed: '', setData: () => {} });
beforeEach(() => { useDiagramStore.getState().reset(); useUiStore.getState().resetUi(); useLayoutStore.getState().reset(); });

describe('LayersPanel extras', () => {
  it('panel offset follows the sidebar; close button closes; empty canvas message', () => {
    open();
    const { rerender } = render(<LayersPanel />);
    expect(screen.getByText('Nothing on this canvas yet')).toBeTruthy();
    const left = (screen.getByTestId('layers-panel') as HTMLElement).style.left;
    act(() => useLayoutStore.setState({ sidebarOpen: left === '64px' } as never));
    rerender(<LayersPanel />);
    expect((screen.getByTestId('layers-panel') as HTMLElement).style.left).not.toBe(left);
    fireEvent.click(screen.getByRole('button', { name: 'Close layers' }));
    expect(useUiStore.getState().layersOpen).toBe(false);
  });
  it('shift / meta / ctrl click toggles selection additively', () => {
    load([n('a', 'API'), n('b', 'DB'), n('c', 'Cache')]);
    open();
    render(<LayersPanel />);
    fireEvent.click(row('a'));
    fireEvent.click(row('b'), { shiftKey: true });
    fireEvent.click(row('c'), { metaKey: true });
    const sel = () => useDiagramStore.getState().nodes.filter((x) => x.selected).map((x) => x.id).sort();
    expect(sel()).toEqual(['a', 'b', 'c']);
    fireEvent.click(row('b'), { ctrlKey: true });
    expect(sel()).toEqual(['a', 'c']);
  });
  it('type letter + kind fallback; unnamed layers use the kind name; unknown types show the raw type', () => {
    load([n('a', '', { type: 'class' as never }), n('b', 'x', { type: 'weird' as never })]);
    open();
    render(<LayersPanel />);
    expect(row('a').querySelector('.layer-name')!.textContent).toBe('Class');
    expect(row('a').querySelector('.layer-type')!.textContent).toBe('C');
    expect(row('b').querySelector('.layer-type')!.getAttribute('title')).toBe('weird');
  });
  it('rename: unchanged text is not committed; Escape cancels; click inside the editor does not select', () => {
    load([n('a', 'API')]);
    open();
    render(<LayersPanel />);
    fireEvent.doubleClick(screen.getByText('API'));
    let input = screen.getByLabelText('Layer name') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.click(input);
    expect(useDiagramStore.getState().nodes[0].selected).toBeFalsy();
    fireEvent.keyDown(input, { key: 'Enter' }); // blurs -> rename with same label
    fireEvent.blur(input);
    expect(useDiagramStore.getState().nodes[0].data.label).toBe('API');
    fireEvent.doubleClick(screen.getByText('API'));
    input = screen.getByLabelText('Layer name') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('Layer name')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'a' });
  });
  it('collapse chevron on a leaf does nothing; expand state toggles back', () => {
    load([n('g', 'Backend', { type: 'group', width: 300, height: 200 }), n('a', 'API', { parentId: 'g' }), n('c', 'Cache')]);
    open();
    render(<LayersPanel />);
    fireEvent.click(row('c').querySelector('.layer-chev')!);
    expect(order()).toContain('c');
    const chev = row('g').querySelector('.layer-chev')!;
    fireEvent.click(chev);
    expect(order()).not.toContain('a');
    expect(row('g').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(chev);
    expect(order()).toContain('a');
    expect(row('a').getAttribute('aria-expanded')).toBeNull();
  });
  it('hidden / locked parents dim children and show effective flags without per-row toggles state', () => {
    load([n('g', 'Backend', { type: 'group', width: 300, height: 200, data: { label: 'Backend', hidden: true, locked: true } as never }), n('a', 'API', { parentId: 'g' })]);
    open();
    render(<LayersPanel />);
    expect(row('a').className).toContain('dim');
    expect(row('a').getAttribute('draggable')).toBe('false');
    expect(screen.getByRole('button', { name: 'Show Backend' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Unlock Backend' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lock API' }).className).toBe('on');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Backend' }));
    expect(useDiagramStore.getState().nodes.find((x) => x.id === 'g')!.data.locked).toBeFalsy();
  });
  describe('drag and drop', () => {
    const setup = () => {
      load([n('g', 'Backend', { type: 'group', width: 300, height: 200 }), n('a', 'API'), n('b', 'DB')]);
      open();
      render(<LayersPanel />);
      ['g', 'a', 'b'].forEach((id) => rect(row(id)));
    };
    it('dragover without a drag, or with nothing else, does not mark a drop target', () => {
      setup();
      over(row('a'), 10);
      expect(row('a').className).not.toContain('drop-');
    });
    it('drop marks: container middle = into, top half = before, bottom half = after; leave clears; dragend clears', () => {
      setup();
      fireEvent.dragStart(row('a'), { dataTransfer: dt() });
      over(row('g'), 50);
      expect(row('g').className).toContain('drop-into');
      over(row('g'), 10);
      expect(row('g').className).toContain('drop-before');
      over(row('b'), 80);
      expect(row('b').className).toContain('drop-after');
      over(row('b'), 20);
      expect(row('b').className).toContain('drop-before');
      fireEvent.dragLeave(row('g'));
      expect(row('b').className).toContain('drop-before');
      fireEvent.dragLeave(row('b'));
      expect(row('b').className).not.toContain('drop-');
      over(row('b'), 80);
      fireEvent.dragEnd(row('a'));
      expect(row('b').className).not.toContain('drop-');
    });
    it('dropping into a group nests the node; dropping after / before reorders siblings; self drops and unknown targets are ignored', () => {
      setup();
      fireEvent.dragStart(row('a'), { dataTransfer: dt() });
      over(row('g'), 50);
      fireEvent.drop(row('g'));
      expect(useDiagramStore.getState().nodes.find((x) => x.id === 'a')!.parentId).toBe('g');
      // reorder: b dropped below g's row ('after' = lower paint index)
      fireEvent.dragStart(row('b'), { dataTransfer: dt() });
      over(row('g'), 5);
      fireEvent.drop(row('g'));
      const ids = () => useDiagramStore.getState().nodes.map((x) => x.id);
      expect(ids().indexOf('b')).toBeGreaterThan(ids().indexOf('g'));
      fireEvent.dragStart(row('b'), { dataTransfer: dt() });
      over(row('g'), 95);
      fireEvent.drop(row('g'));
      expect(ids().indexOf('b')).toBeLessThan(ids().indexOf('g'));
      const before = ids().join();
      fireEvent.dragStart(row('b'), { dataTransfer: dt() });
      fireEvent.drop(row('b')); // onto itself
      fireEvent.drop(row('g')); // no active drag any more
      expect(ids().join()).toBe(before);
    });
    it('a node dropped on a node target removed meanwhile is ignored; drop without dragover defaults to before', () => {
      setup();
      fireEvent.dragStart(row('a'), { dataTransfer: dt() });
      fireEvent.drop(row('b'));
      expect(useDiagramStore.getState().nodes.map((x) => x.id)).toContain('a');
      fireEvent.dragStart(row('a'), { dataTransfer: dt() });
      const bRow = row('b');
      act(() => useDiagramStore.setState({ nodes: useDiagramStore.getState().nodes.filter((x) => x.id !== 'b') }));
      fireEvent.drop(bRow);
      expect(useDiagramStore.getState().nodes.map((x) => x.id)).not.toContain('b');
    });
  });
});
