import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { seedProject, openPalette } from '../test/workspace';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const node = (id: string, x = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y: 0 }, width: 100, height: 60, data: { label: id, iconId: 'service' }, ...extra });

function open() {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  const p = seedProject('Grp');
  render(<App initialProjectId={p.projectId} />);
  openPalette();
}

describe('context-menu Group', () => {
  for (const target of [{ type: 'selection' as const }, { type: 'node' as const, id: 'a' }]) {
    it(`groups the selected shapes from the ${target.type} menu`, () => {
      open();
      act(() => { s().addNode(node('a', 0, { selected: true })); s().addNode(node('b', 300, { selected: true })); s().addEdge({ source: 'a', target: 'b' }); });
      act(() => useUiStore.getState().openMenu({ x: 10, y: 10, target }));
      fireEvent.click(screen.getByRole('menuitem', { name: /^Group/ }));
      const g = s().nodes.find((n) => n.type === 'group');
      expect(g).toBeTruthy();
      expect(s().nodes.filter((n) => n.parentId === g!.id).map((n) => n.id).sort()).toEqual(['a', 'b']);
    });
  }
  it('groups selected groups / clusters whole, members riding along', () => {
    open();
    act(() => {
      s().addNode({ id: 'c1', type: 'cluster', position: { x: 0, y: 0 }, width: 300, height: 200, selected: true, data: { label: 'Mongo' } });
      s().addNode({ id: 'g1', type: 'group', position: { x: 0, y: 400 }, width: 300, height: 200, selected: true, data: { label: 'Pg' } });
      s().addNode(node('m', 40, { parentId: 'c1', selected: true }));
    });
    act(() => useUiStore.getState().openMenu({ x: 10, y: 10, target: { type: 'selection' } }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Group/ }));
    const g = s().nodes.find((n) => n.type === 'group' && n.id !== 'g1')!;
    expect(s().nodes.filter((n) => n.parentId === g.id).map((n) => n.id).sort()).toEqual(['c1', 'g1']);
    expect(s().nodes.find((n) => n.id === 'm')!.parentId).toBe('c1');
  });
});
