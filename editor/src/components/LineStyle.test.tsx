import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { createStoredProject } from '../lib/projects';
import { resolveSettings } from '../lib/settings';
import { computeRoutes, DEFAULT_ROUTING } from '../lib/routing';
import { isOrthogonal } from '../lib/routing/geometry';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const n = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'shape', position: { x, y }, width: 100, height: 60, data: { label: id, shape: 'rect' } });
const routeFor = (global: Parameters<typeof resolveSettings>[0], project?: Parameters<typeof resolveSettings>[1]) =>
  computeRoutes(s().nodes, s().edges, { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(global, project).edge }).get(s().edges[0].id)!;

beforeEach(() => {
  localStorage.clear();
  s().reset();
  useSettingsStore.getState().resetGlobal();
  useUiStore.getState().resetUi();
  s().loadDiagram({ nodes: [n('a', 0, 0), n('b', 400, 200), n('c', 0, 400)], edges: [] });
  s().connect({ source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left' });
});

describe('global line style', () => {
  it('straight = direct 2-point line; orthogonal = bends; curved = bezier; rounded = orthogonal with arcs', () => {
    expect(routeFor({ edge: { lineType: 'straight' } }).points).toHaveLength(2);
    const o = routeFor({ edge: { lineType: 'orthogonal' } });
    expect(isOrthogonal(o.points)).toBe(true);
    expect(o.points.length).toBeGreaterThan(2);
    expect(routeFor({ edge: { lineType: 'curved' } }).d).toMatch(/C/);
    expect(routeFor({ edge: { lineType: 'step-rounded' } }).d).toMatch(/[AQ]/);
  });
  it('new edges follow the default (no per-edge override stored)', () => {
    expect(s().edges[0].data?.lineType).toBeUndefined();
    expect(routeFor({ edge: { lineType: 'straight' } }).lineType).toBe('straight');
  });
  it('a per-edge override still wins over the default', () => {
    s().updateEdges([s().edges[0].id], { lineType: 'curved' });
    expect(routeFor({ edge: { lineType: 'straight' } }).lineType).toBe('curved');
  });
  it('project settings override global', () => {
    expect(routeFor({ edge: { lineType: 'straight' } }, { edge: { lineType: 'curved' } }).lineType).toBe('curved');
    expect(routeFor({ edge: { lineType: 'straight' } }, {}).lineType).toBe('straight');
  });
  it('setLineStyle writes the project override when there is one, else global (persisted)', () => {
    useSettingsStore.getState().setLineStyle('curved');
    expect(useSettingsStore.getState().global.edge?.lineType).toBe('curved');
    expect(JSON.parse(localStorage.getItem('sdd:settings') ?? '{}').edge.lineType).toBe('curved');
    s().setProjectSettings({ edge: { lineType: 'straight' } } as never);
    useSettingsStore.getState().setLineStyle('orthogonal');
    expect(s().projectSettings.edge?.lineType).toBe('orthogonal');
    expect(useSettingsStore.getState().global.edge?.lineType).toBe('curved');
  });
});

describe('apply to all edges', () => {
  beforeEach(() => {
    s().connect({ source: 'a', target: 'c', sourceHandle: 'bottom', targetHandle: 'top' });
    s().updateEdges([s().edges[0].id], { lineType: 'curved' });
  });
  it('this page: sets every edge in ONE undo step', () => {
    const past = s().past.length;
    expect(s().applyLineStyleToAll('straight', 'page')).toBe(2);
    expect(s().edges.every((e) => e.data?.lineType === 'straight')).toBe(true);
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(s().edges.map((e) => e.data?.lineType)).toEqual(['curved', undefined]);
  });
  it('whole project: also the other pages', () => {
    const first = s().activePageId;
    s().addPage('Two', { nodes: [n('x', 0, 0), n('y', 300, 0)], edges: [{ id: 'ex', source: 'x', target: 'y', data: {} }] });
    s().switchPage(first);
    expect(s().applyLineStyleToAll('orthogonal', 'project')).toBe(3);
    const other = s().pages.find((p) => p.id !== first)!.id;
    expect(s().stash[other].edges[0].data?.lineType).toBe('orthogonal');
    expect(s().edges.every((e) => e.data?.lineType === 'orthogonal')).toBe(true);
  });
  it('settings UI: segmented control, confirm modal, apply', async () => {
    const p = createStoredProject(localStorage, 'LS');
    render(<App initialProjectId={p.id} />);
    act(() => {
      s().loadDiagram({ nodes: [n('a', 0, 0), n('b', 400, 200)], edges: [] });
      s().connect({ source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left' });
      useUiStore.getState().setSettingsOpen(true);
    });
    const box = within(screen.getByTestId('line-style'));
    await act(async () => void fireEvent.click(box.getByRole('button', { name: 'Straight' })));
    expect(useSettingsStore.getState().global.edge?.lineType).toBe('straight');
    expect(s().edges[0].data?.lineType).toBeUndefined(); // default only: nothing rewritten yet
    await act(async () => void fireEvent.click(box.getByRole('button', { name: 'Apply to all edges' })));
    expect(s().edges[0].data?.lineType).toBeUndefined(); // needs the confirm modal
    const ask = await screen.findByRole('alertdialog', { name: 'Apply to all edges?' });
    await act(async () => void fireEvent.click(within(ask).getByRole('button', { name: 'Apply' })));
    await waitFor(() => expect(s().edges[0].data?.lineType).toBe('straight'));
  });
  it('top bar toggle and ⌘K commands change the default', async () => {
    const p = createStoredProject(localStorage, 'LS2');
    render(<App initialProjectId={p.id} />);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Line style' })));
    await act(async () => void fireEvent.click(screen.getByRole('menuitemradio', { name: /Curved/ })));
    expect(useSettingsStore.getState().global.edge?.lineType).toBe('curved');
    await act(async () => void fireEvent.keyDown(window, { key: 'k', metaKey: true }));
    const input = screen.getByLabelText('Command');
    await act(async () => void fireEvent.change(input, { target: { value: 'line style straight' } }));
    await act(async () => void fireEvent.keyDown(input, { key: 'Enter' }));
    await act(async () => undefined);
    expect(useSettingsStore.getState().global.edge?.lineType).toBe('straight');
  });
});
