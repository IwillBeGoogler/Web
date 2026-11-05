import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { seedProject, openPalette } from '../test/workspace';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const node = (id: string, x = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y: 0 }, width: 100, height: 60, data: { label: id, iconId: 'service' }, ...extra });
const group = (id: string): DiagramNode => ({ id, type: 'group', position: { x: 0, y: 300 }, width: 300, height: 200, data: { label: id } });

function open() {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  const p = seedProject('Del');
  const r = render(<App initialProjectId={p.projectId} />);
  openPalette();
  return r;
}
const el = (id: string) => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)!;
const ids = () => s().nodes.map((n) => n.id);

describe('store: deleteSelection with explicit ids', () => {
  beforeEach(() => s().reset());
  it('deletes exactly the given nodes/edges regardless of selection flags', () => {
    for (const n of [node('a'), node('b', 200), node('c', 400)]) s().addNode(n);
    s().addEdge({ source: 'a', target: 'b' });
    s().deleteSelection({ nodes: ['c'] });
    expect(ids()).toEqual(['a', 'b']);
    s().deleteSelection({ edges: [s().edges[0].id] });
    expect(s().edges).toHaveLength(0);
    s().deleteSelection({ nodes: [] });
    expect(ids()).toEqual(['a', 'b']);
  });
  it('without ids it deletes the selected elements; multiple nodes, a group and its children', () => {
    for (const n of [node('a', 0, { selected: true }), node('b', 200, { selected: true }), node('c', 400)]) s().addNode(n);
    s().deleteSelection();
    expect(ids()).toEqual(['c']);
    s().reset();
    s().addNode({ ...group('g'), selected: true });
    s().addNode(node('in', 10, { position: { x: 10, y: 330 } }));
    expect(s().nodes.find((n) => n.id === 'in')!.parentId).toBe('g');
    s().deleteSelection();
    expect(ids()).toEqual([]);
  });
  it('locked nodes survive', () => {
    s().addNode(node('a', 0, { selected: true, data: { label: 'a', locked: true } }));
    s().deleteSelection();
    s().deleteSelection({ nodes: ['a'] });
    expect(ids()).toEqual(['a']);
  });
});

describe('keyboard delete in the real component tree', () => {
  it('click a node, press Backspace -> gone; Delete works too', () => {
    open();
    act(() => { s().addNode(node('a')); s().addNode(node('b', 300)); });
    fireEvent.click(el('a'));
    expect(s().nodes.find((n) => n.id === 'a')!.selected).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Backspace' });
    expect(ids()).toEqual(['b']);
    fireEvent.click(el('b'));
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(ids()).toEqual([]);
  });
  it('delete works right after editing a label in the inspector (focus returns to the canvas)', () => {
    open();
    act(() => { s().addNode(node('a')); s().addNode(node('b', 300)); });
    fireEvent.click(el('a'));
    const label = screen.getByLabelText('Label') as HTMLInputElement;
    label.focus();
    fireEvent.change(label, { target: { value: 'renamed' } });
    fireEvent.keyDown(label, { key: 'Enter' });
    expect(s().nodes.find((n) => n.id === 'a')!.data.label).toBe('renamed');
    // while the input has focus the key must edit text, not delete the node
    fireEvent.keyDown(label, { key: 'Backspace' });
    expect(ids()).toContain('a');
    // clicking the canvas moves focus away from the input; delete must work again
    fireEvent.pointerDown(el('a'));
    fireEvent.click(el('a'));
    expect(document.activeElement).not.toBe(label);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Backspace' });
    expect(ids()).toEqual(['b']);
  });
  it('a selection of several nodes is deleted in one undoable step', () => {
    open();
    act(() => { for (const n of [node('a'), node('b', 200), node('c', 400)]) s().addNode(n); s().selectAll(); });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(ids()).toEqual([]);
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(ids()).toHaveLength(3);
  });
});

describe('context-menu Delete', () => {
  const openMenu = (target: { type: 'node' | 'edge'; id: string }) => act(() => useUiStore.getState().openMenu({ x: 10, y: 10, target }));
  it('node', () => {
    open();
    act(() => { s().addNode(node('a')); s().addNode(node('b', 300)); });
    fireEvent.contextMenu(el('a'));
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete/ }));
    expect(ids()).toEqual(['b']);
  });
  it('the menu target wins even when the selection is something else', () => {
    open();
    act(() => { s().addNode(node('a')); s().addNode(node('b', 300)); s().selectOnly('node', 'a'); });
    openMenu({ type: 'node', id: 'b' });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete/ }));
    expect(ids()).toEqual(['a']);
  });
  it('edge', () => {
    open();
    act(() => { s().addNode(node('a')); s().addNode(node('b', 300)); s().addEdge({ source: 'a', target: 'b' }); });
    openMenu({ type: 'edge', id: s().edges[0].id });
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete/ }));
    expect(s().edges).toHaveLength(0);
    expect(ids()).toEqual(['a', 'b']);
  });
  it('group: "Delete group only" keeps the children, "with children" removes them', () => {
    open();
    act(() => { s().addNode(group('g')); s().addNode(node('in', 10, { position: { x: 10, y: 330 } })); });
    openMenu({ type: 'node', id: 'g' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete group only' }));
    expect(ids()).toEqual(['in']);
    expect(s().nodes[0].parentId).toBeUndefined();
    act(() => { s().undo(); });
    openMenu({ type: 'node', id: 'g' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete group with children' }));
    expect(ids()).toEqual([]);
  });
});

describe('native browser context menu is suppressed', () => {
  const fire = (target: Element) => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 60 });
    act(() => void target.dispatchEvent(ev));
    return ev;
  };
  it('right-click on a node and on a group shows our menu and prevents the native one', () => {
    open();
    act(() => { s().addNode(node('a')); s().addNode(group('g')); });
    for (const id of ['a', 'g']) {
      act(() => useUiStore.getState().closeMenu());
      const ev = fire(el(id));
      expect(ev.defaultPrevented, id).toBe(true);
      expect(screen.getByTestId('context-menu'), id).toBeInTheDocument();
    }
  });
  it('right-click on the empty canvas / any non-input area is prevented and opens the pane menu', async () => {
    open();
    const ev = fire(document.querySelector('.react-flow__pane')!);
    expect(ev.defaultPrevented).toBe(true);
    expect(await screen.findByRole('menuitem', { name: /Select all/ })).toBeInTheDocument();
  });
  it('the guard opens a fallback menu when no React Flow handler did (e.g. over the selection box)', async () => {
    open();
    act(() => { s().addNode(node('a')); s().addNode(node('b', 300)); s().selectAll(); });
    const box = document.createElement('div');
    box.className = 'react-flow__nodesselection';
    document.querySelector('.react-flow')!.appendChild(box);
    const ev = fire(box);
    expect(ev.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.getByTestId('context-menu')).toBeInTheDocument());
    expect(screen.getByRole('menuitem', { name: /^Layout/ })).toBeInTheDocument();
  });
  it('right-click on the multi-selection opens the selection menu', () => {
    open();
    act(() => { s().addNode(node('a')); s().addNode(node('b', 300)); s().selectAll(); });
    act(() => useUiStore.getState().openMenu({ x: 5, y: 5, target: { type: 'selection' } }));
    const menu = screen.getByTestId('context-menu');
    expect(within(menu).getByRole('menuitem', { name: /^Layout/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Group/ })).toBeInTheDocument();
  });
  it('inside a real text input the native menu stays (copy / paste)', () => {
    open();
    const input = screen.getByPlaceholderText(/search components/i);
    expect(fire(input).defaultPrevented).toBe(false);
  });
});
