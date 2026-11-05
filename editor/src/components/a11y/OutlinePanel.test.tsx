import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { OutlinePanel } from './OutlinePanel';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import type { DiagramEdge, DiagramNode } from '../../types';

const node = (id: string, label: string, x = 0, y = 0): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label } });
const edge = (id: string, source: string, target: string, label?: string): DiagramEdge => ({ id, source, target, ...(label ? { label } : {}), data: {} } as DiagramEdge);

beforeEach(() => {
  useUiStore.getState().resetUi();
  useDiagramStore.getState().reset();
  useDiagramStore.getState().loadDiagram({ nodes: [node('a', 'API'), node('b', 'Database', 300, 0)], edges: [edge('e1', 'a', 'b', 'reads')] });
});

describe('OutlinePanel', () => {
  it('is hidden by default', () => {
    render(<OutlinePanel />);
    expect(screen.queryByRole('tree')).toBeNull();
    expect(screen.queryByRole('complementary', { name: /outline/i })).toBeNull();
  });

  it('shows pages > nodes > connections as a tree once toggled on', () => {
    useUiStore.getState().setDesign({ outlineOpen: true });
    render(<OutlinePanel />);
    const tree = screen.getByRole('tree', { name: 'Diagram outline' });
    const items = within(tree).getAllByRole('treeitem');
    const names = items.map((i) => i.getAttribute('aria-label') ?? i.textContent);
    expect(names.join('|')).toMatch(/Page 1/);
    expect(within(tree).getByRole('button', { name: /^API icon$/ })).toBeInTheDocument();
    expect(within(tree).getByRole('button', { name: /^Database icon$/ })).toBeInTheDocument();
    expect(within(tree).getByText('API to Database, reads')).toBeInTheDocument();
    expect(within(tree).getByText('Database from API, reads')).toBeInTheDocument();
  });

  it('activating a node selects it on the canvas', () => {
    useUiStore.getState().setDesign({ outlineOpen: true });
    render(<OutlinePanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Database icon$/ }));
    expect(useDiagramStore.getState().nodes.find((n) => n.id === 'b')?.selected).toBe(true);
    expect(useDiagramStore.getState().nodes.find((n) => n.id === 'a')?.selected).toBeFalsy();
  });

  it('activating a connection selects that edge', () => {
    useUiStore.getState().setDesign({ outlineOpen: true });
    render(<OutlinePanel />);
    fireEvent.click(screen.getAllByRole('button', { name: /API to Database, reads/ })[0]);
    expect(useDiagramStore.getState().edges.find((e) => e.id === 'e1')?.selected).toBe(true);
  });

  it('closes with its button and says so to assistive tech', () => {
    useUiStore.getState().setDesign({ outlineOpen: true });
    render(<OutlinePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Close outline' }));
    expect(useUiStore.getState().outlineOpen).toBe(false);
  });

  it('lists the other pages too', () => {
    const st = useDiagramStore.getState();
    st.addPage('Second');
    st.addNode(node('c', 'Cache'));
    st.switchPage(st.pages[0].id);
    useUiStore.getState().setDesign({ outlineOpen: true });
    render(<OutlinePanel />);
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Second' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cache icon$/ })).toBeInTheDocument();
  });
});
