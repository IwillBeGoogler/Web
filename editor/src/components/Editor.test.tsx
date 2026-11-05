import { useWorkspace } from '../workspace/store';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useSettingsStore } from '../store/settingsStore';
import { listProjects, loadProject, saveProject } from '../lib/projects';
import { seedProject, openPalette } from '../test/workspace';
import type { DiagramNode } from '../types';

const node = (id: string, x = 0, y = 0): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id, iconId: 'service' } });

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  useSettingsStore.setState({ global: {} });
});

function open(seed?: (fileId: string) => void) {
  const p = seedProject('Seed');
  seed?.(p.fileId);
  return render(<App initialProjectId={p.projectId} />);
}

describe('templates (no pages: insert into the file or open as a new file)', () => {
  it('Insert goes into the current file', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /^File/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Templates/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Insert: Monitoring stack' }));
    expect(useDiagramStore.getState().pages).toHaveLength(1);
    expect(useDiagramStore.getState().nodes).toHaveLength(25);
  });
  it('"New file: ..." opens the template as a new file of the project', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /^File/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Templates/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New file: Monitoring stack' }));
    expect(useDiagramStore.getState().nodes).toHaveLength(25);
    expect(useWorkspace.getState().tree.files).toHaveLength(2);
    expect(useDiagramStore.getState().pages).toHaveLength(1);
  });
  it('there is no page UI at all', () => {
    open();
    expect(screen.queryByRole('tablist', { name: 'Pages' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add page' })).toBeNull();
    expect(screen.queryByTestId('page-pill')).toBeNull();
  });
});

describe('autosave and project switching', () => {
  it('saves the whole project (all pages) to localStorage and returns to the list', async () => {
    open();
    act(() => {
      useDiagramStore.getState().addNode(node('a'));
      useDiagramStore.getState().addPage('Two', { nodes: [node('b')], edges: [] });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    const [meta] = listProjects(localStorage);
    expect(meta.pageCount).toBe(2);
    const saved = loadProject(localStorage, meta.id)!;
    expect(saved.pages.map((p) => p.nodes.length)).toEqual([1, 1]);
    expect(screen.getByRole('heading', { name: 'Recent projects' })).toBeInTheDocument();
  });
  it('opens the stored pages of a saved project', () => {
    const p = seedProject('Saved');
    const doc = loadProject(localStorage, p.fileId)!;
    saveProject(localStorage, { ...doc, pages: [{ ...doc.pages[0], nodes: [node('x')] }] });
    render(<App initialProjectId={p.projectId} />);
    expect(useDiagramStore.getState().nodes.map((n) => n.id)).toEqual(['x']);
  });
});

describe('context menu', () => {
  it('right-click opens menu; Delete removes the node; Esc closes', () => {
    open();
    act(() => useDiagramStore.getState().addNode(node('a')));
    // simulate what the canvas does on node right-click
    act(() => {
      useDiagramStore.getState().selectOnly('node', 'a');
      useUiStore.getState().openMenu({ x: 10, y: 10, target: { type: 'node', id: 'a' } });
    });
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }));
    expect(useDiagramStore.getState().nodes).toHaveLength(0);
    expect(screen.queryByTestId('context-menu')).toBeNull();
    act(() => useUiStore.getState().openMenu({ x: 10, y: 10, target: { type: 'pane' } }));
    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('context-menu')).toBeNull();
  });
  it('items show shortcuts, disabled items cannot run, submenus open on hover', () => {
    open();
    act(() => useUiStore.getState().openMenu({ x: 10, y: 10, target: { type: 'pane' } }));
    expect(screen.getByRole('menuitem', { name: /Paste here/ })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: /Select all/ })).toHaveTextContent('⌘A');
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Add/ }).closest('li')!);
    expect(screen.getByRole('menuitem', { name: 'Rectangle' })).toBeInTheDocument();
  });
  it('clicking outside closes the menu', () => {
    open();
    act(() => useUiStore.getState().openMenu({ x: 10, y: 10, target: { type: 'pane' } }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('context-menu')).toBeNull();
  });
});

describe('tools and shortcuts', () => {
  it('keyboard letters switch tools; typing in inputs does not', () => {
    open();
    openPalette();
    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.keyDown(input, { key: 'h' });
    expect(useUiStore.getState().tool).toBe('select');
  });
  it('Delete key removes selection, Cmd+Z undoes', () => {
    open();
    act(() => {
      useDiagramStore.getState().addNode({ ...node('a'), selected: true });
    });
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(useDiagramStore.getState().nodes).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(useDiagramStore.getState().nodes).toHaveLength(1);
  });
  it('zoom bar shows a percentage', () => {
    open();
    expect(screen.getByRole('button', { name: /^Zoom \d+%$/ }).textContent).toMatch(/\d+%/);
  });
});

describe('settings modal', () => {
  it('opens from the gear, edits global defaults (persisted), project scope overrides, apply defaults confirm', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Filled' }));
    expect(useSettingsStore.getState().global.node?.background).toBe('filled');
    expect(JSON.parse(localStorage.getItem('sdd:settings')!).node.background).toBe('filled');
    fireEvent.click(within(dialog).getByRole('button', { name: 'This project' }));
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Node background' })).getByRole('button', { name: 'Transparent' }));
    expect(useDiagramStore.getState().projectSettings.node?.background).toBe('transparent');
    // apply defaults needs inline confirm
    act(() => useDiagramStore.getState().addNode({ ...node('a'), data: { label: 'a', fill: '#abc' } }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Apply defaults/ }));
    expect(useDiagramStore.getState().nodes[0].data.fill).toBe('#abc');
    const ask = await screen.findByRole('alertdialog', { name: 'Apply defaults?' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(useDiagramStore.getState().nodes[0].data.fill).toBeUndefined());
    act(() => useDiagramStore.getState().undo());
    expect(useDiagramStore.getState().nodes[0].data.fill).toBe('#abc');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull());
  });
  it('Settings > Edges has an arrowhead size S/M/L (default M)', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const group = within(dialog).getByRole('group', { name: 'Arrowhead size' });
    expect(within(group).getByRole('button', { name: 'M' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByRole('button', { name: 'L' }));
    expect(useSettingsStore.getState().global.edge?.arrowSize).toBe('L');
    expect(within(group).getByRole('button', { name: 'L' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('theme setting applies data-theme', () => {
    open();
    act(() => useSettingsStore.getState().patch({ theme: 'dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => useSettingsStore.getState().patch({ theme: 'light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('properties panel', () => {
  it('sections are accordions; style edits apply to all selected nodes (undoable)', () => {
    open();
    act(() => {
      useDiagramStore.getState().addNode({ ...node('a'), selected: true });
      useDiagramStore.getState().addNode({ ...node('b', 200), selected: true });
    });
    const panel = within(screen.getByLabelText('Properties'));
    const style = panel.getByRole('button', { name: /^Style/ });
    expect(style).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(panel.getByRole('button', { name: 'Filled' }));
    expect(useDiagramStore.getState().nodes.every((n) => n.data.background === 'filled')).toBe(true);
    fireEvent.change(panel.getByLabelText('Opacity'), { target: { value: '40' } });
    expect(useDiagramStore.getState().nodes.every((n) => n.data.opacity === 40)).toBe(true);
    fireEvent.click(style);
    expect(style).toHaveAttribute('aria-expanded', 'false');
    act(() => useDiagramStore.getState().undo());
    expect(useDiagramStore.getState().nodes.every((n) => n.data.opacity === undefined)).toBe(true);
  });
  it('edge options', () => {
    open();
    act(() => {
      useDiagramStore.getState().addNode(node('a'));
      useDiagramStore.getState().addNode(node('b', 200));
      useDiagramStore.getState().addEdge({ source: 'a', target: 'b', selected: true });
    });
    const panel = within(screen.getByLabelText('Properties'));
    fireEvent.click(panel.getByRole('button', { name: 'Curved' }));
    fireEvent.click(panel.getByRole('button', { name: 'Both' }));
    fireEvent.click(panel.getByRole('button', { name: 'Dotted' }));
    expect(useDiagramStore.getState().edges[0].data).toMatchObject({ lineType: 'curved', arrows: 'both', strokeStyle: 'dotted' });
  });
});

describe('line style hint', () => {
  it('Settings > Edges shows how many edges use a custom style, keep-buses option, and warns about waypoints', async () => {
    open();
    act(() => useDiagramStore.getState().loadDiagram({ nodes: [node('a'), { ...node('b'), position: { x: 300, y: 0 } }], edges: [{ id: 'e1', source: 'a', target: 'b', data: { lineType: 'straight' } }, { id: 'e2', source: 'a', target: 'b', data: { manual: true, waypoints: [{ x: 5, y: 5 }] } }] }));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(within(dialog).getByTestId('line-style-overrides').textContent).toMatch(/2 edges use a custom style/);
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Line style' })).getByRole('button', { name: 'Curved' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply to all edges' }));
    const ask = await screen.findByRole('alertdialog', { name: 'Apply to all edges?' });
    expect(ask.textContent).toMatch(/Waypoints of 1 hand-routed edge will be cleared/);
    fireEvent.click(within(ask).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(useDiagramStore.getState().edges.every((e) => e.data?.lineType === 'curved' && !e.data.waypoints)).toBe(true));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Keep buses orthogonal/ }));
    expect(useSettingsStore.getState().global.edge?.keepBusesOrthogonal).toBe(true);
  });
});
