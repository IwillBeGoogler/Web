import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useSettingsStore } from '../store/settingsStore';
import { createStoredProject, saveProject, loadProject } from '../lib/projects';
import { executeAction } from '../lib/actions';
import { computeMixedEdges } from '../lib/bulkStyle';
import { resolveSettings } from '../lib/settings';
import { FlowLayer } from './FlowLayer';
import { ReactFlowProvider } from '@xyflow/react';
import type { DiagramEdge, DiagramNode } from '../types';

const node = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id, iconId: 'service' } });
const edge = (id: string, s: string, t: string, data: DiagramEdge['data'] = {}): DiagramEdge => ({ id, source: s, target: t, data: { arrows: 'end', ...data } });

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  useSettingsStore.setState({ global: {} });
});

function open() {
  const p = createStoredProject(localStorage, 'Flow');
  const full = loadProject(localStorage, p.id)!;
  full.pages[0].nodes = [node('a', 0, 0), node('b', 300, 0), node('c', 600, 0), node('x', 300, 200)];
  full.pages[0].edges = [edge('e1', 'a', 'b', { preset: 'metrics' }), edge('e2', 'b', 'c'), edge('e3', 'x', 'b')];
  saveProject(localStorage, full);
  return render(<App initialProjectId={p.id} />);
}

describe('Data flow mode', () => {
  it('toolbar button toggles per-page flow mode and mounts / unmounts the overlay', () => {
    open();
    const item = () => screen.getByRole('menuitemcheckbox', { name: /Data flow/ });
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(item()).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('flow-layer')).toBeNull();
    fireEvent.click(item());
    expect(useDiagramStore.getState().pageFlow[useDiagramStore.getState().activePageId]).toBe(true);
    expect(screen.getByTestId('flow-layer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(item()).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(item());
    expect(screen.queryByTestId('flow-layer')).toBeNull();
  });
  it('Shift+F toggles; the command palette entry exists', () => {
    open();
    fireEvent.keyDown(window, { key: 'F', code: 'KeyF', shiftKey: true });
    expect(useDiagramStore.getState().pageFlow[useDiagramStore.getState().activePageId]).toBe(true);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'data flow' } });
    expect(screen.getByText(/Toggle data flow/)).toBeInTheDocument();
  });
  it('the flag is per page and is saved in the project', () => {
    open();
    executeAction('toggle-flow');
    const st = useDiagramStore.getState();
    const second = st.addPage('Two');
    expect(useDiagramStore.getState().pageFlow[second]).toBeUndefined();
    const saved = useDiagramStore.getState().toProject();
    expect(saved.pages.map((p) => !!p.flow)).toEqual([true, false]);
  });
  it('trace path: Esc clears; turning flow off clears too', () => {
    open();
    executeAction('toggle-flow');
    act(() => useUiStore.getState().setTrace('b'));
    expect(useUiStore.getState().traceNodeId).toBe('b');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().traceNodeId).toBeNull();
    act(() => useUiStore.getState().setTrace('b'));
    executeAction('toggle-flow');
    expect(useUiStore.getState().traceNodeId).toBeNull();
  });
  it('per-edge controls reach the store (speed / density / style / direction / on-off) and bulk mixed detection works', () => {
    open();
    const st = useDiagramStore.getState();
    st.updateEdges(['e1', 'e2'], { flowSpeed: 'slow', flowDensity: 3, flowStyle: 'pulse', flowDir: 'both', dataFlow: false });
    let es = useDiagramStore.getState().edges;
    expect(es[0].data).toMatchObject({ flowSpeed: 'slow', flowDensity: 3, flowStyle: 'pulse', flowDir: 'both', dataFlow: false });
    useDiagramStore.getState().updateEdges(['e1'], { dataFlow: undefined as never });
    es = useDiagramStore.getState().edges;
    expect('dataFlow' in (es[0].data ?? {})).toBe(false);
    const m = computeMixedEdges(es, resolveSettings(undefined, undefined));
    expect(m.dataFlow!.mixed).toBe(true);
    expect(m.flowSpeed).toMatchObject({ mixed: true }); // e1 slow, e3 preset-less normal
  });
  it('inspector shows the Data flow section for a selected edge', () => {
    open();
    act(() => useDiagramStore.getState().selectOnly('edge', 'e1'));
    expect(screen.getByTestId('flow-controls')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fast' }));
    expect(useDiagramStore.getState().edges[0].data?.flowSpeed).toBe('fast');
  });
});

describe('FlowLayer without a 2D canvas (jsdom) and with reduced motion', () => {
  it('renders its canvas and does not throw', () => {
    render(<ReactFlowProvider><div><FlowLayer paths={[]} /></div></ReactFlowProvider>);
    expect(screen.getByTestId('flow-layer')).toBeInTheDocument();
  });
});

describe('packet colour lift', () => {
  it('dark edge colours are lightened, bright ones untouched', async () => {
    const { lift } = await import('./FlowLayer');
    expect(lift('#2d3340')).not.toBe('#2d3340');
    expect(parseInt(lift('#2d3340').slice(1, 3), 16)).toBeGreaterThan(0x80);
    expect(lift('#ff7a3d')).toBe('#ff7a3d');
    expect(lift('not-a-colour')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('logo = home link', () => {
  it('in the editor the logo is an <a href="/"> (aria-label Home) that navigates to the landing page; the Projects breadcrumb still goes to /projects', async () => {
    open();
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveAttribute('title', 'Home');
    fireEvent.click(home);
    expect(window.location.pathname).toBe('/');
    expect(await screen.findByTestId('landing')).toBeInTheDocument();
  });
  it('cmd / ctrl / shift / middle clicks are not intercepted', () => {
    open();
    const home = screen.getByRole('link', { name: 'Home' });
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const notPrevented = fireEvent.click(home, init); // returns false when preventDefault was called
      expect(notPrevented).toBe(true);
    }
    expect(window.location.pathname).not.toBe('/');
  });
  it('the Projects breadcrumb goes to /projects', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    expect(window.location.pathname).toBe('/projects');
  });
  it('the dashboard logo goes home too', async () => {
    window.history.replaceState({}, '', '/projects');
    render(<App />);
    fireEvent.click(await screen.findByRole('link', { name: /home/i }));
    expect(window.location.pathname).toBe('/');
  });
});
