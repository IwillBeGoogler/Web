import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from './SettingsModal';
import { useUiStore } from '../store/uiStore';
import { useDiagramStore } from '../store/diagramStore';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';
import { dialogs } from '../lib/dialogs';
import { resolveSettings } from '../lib/settings';
import type { DiagramNode } from '../types';

const n = (id: string, x: number, y: number): DiagramNode => ({ id, type: 'shape', position: { x, y }, width: 100, height: 60, data: { label: id, shape: 'rect' } });
const g = () => resolveSettings(useSettingsStore.getState().global, undefined);
const proj = () => resolveSettings(useSettingsStore.getState().global, useDiagramStore.getState().projectSettings);
let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  useDiagramStore.getState().reset();
  useSettingsStore.getState().resetGlobal();
  useUiStore.getState().resetUi();
  useToastStore.getState().clear();
  confirmSpy = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
  Element.prototype.scrollIntoView = vi.fn();
  act(() => useUiStore.getState().setSettingsOpen(true));
});

const seg = (label: string, name: string) => fireEvent.click(within(screen.getAllByRole('group', { name: label }).at(-1) as HTMLElement).getByRole('button', { name }));
const range = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
const check = (label: string) => fireEvent.click(screen.getByLabelText(label));
const colour = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } });

describe('SettingsModal global scope', () => {
  it('closed renders nothing; close button closes', async () => {
    act(() => useUiStore.getState().setSettingsOpen(false));
    render(<SettingsModal />);
    expect(screen.queryByText('Components')).toBeNull();
    act(() => useUiStore.getState().setSettingsOpen(true));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(useUiStore.getState().settingsOpen).toBe(false);
  });
  it('component controls patch the global settings', () => {
    render(<SettingsModal />);
    seg('Node background', 'Filled');
    expect(g().node.background).toBe('filled');
    colour('Node fill', '#112233');
    expect(g().node.fill.toLowerCase()).toBe('#112233');
    range('Node opacity', '40');
    expect(g().node.opacity).toBe(40);
    expect(screen.getByText('Opacity 40%')).toBeInTheDocument();
    const border = g().node.border;
    check('Border');
    expect(g().node.border).toBe(!border);
    colour('Node border colour', '#445566');
    expect(g().node.borderColor.toLowerCase()).toBe('#445566');
    range('Node radius', '12');
    expect(g().node.radius).toBe(12);
    const shadow = g().node.shadow;
    check('Shadow');
    expect(g().node.shadow).toBe(!shadow);
  });
  it('group controls', () => {
    render(<SettingsModal />);
    colour('Group fill', '#abcdef');
    expect(g().group.fill.toLowerCase()).toBe('#abcdef');
    range('Group fill opacity', '33');
    expect(g().group.fillOpacity).toBe(33);
    seg('Group border style', 'Dotted');
    expect(g().group.borderStyle).toBe('dotted');
    colour('Group border colour', '#010203');
    expect(g().group.borderColor.toLowerCase()).toBe('#010203');
  });
  it('edge controls', () => {
    render(<SettingsModal />);
    seg('Line style', 'Curved');
    expect(g().edge.lineType).toBe('curved');
    for (const [label, key] of [['Keep buses orthogonal (junction lines)', 'keepBusesOrthogonal'], ['Label background', 'labelBackground'], ['Auto-route around nodes', 'autoRoute'], ['Line jumps where edges cross', 'jumps'], ['Keep manual routes when nodes move', 'keepManual']] as const) {
      const before = g().edge[key];
      check(label);
      expect(g().edge[key], label).toBe(!before);
    }
    colour('Edge colour', '#102030');
    expect(g().edge.color.toLowerCase()).toBe('#102030');
    range('Edge width', '3.5');
    expect(g().edge.width).toBe(3.5);
    seg('Default arrowheads', 'Both');
    expect(g().edge.arrows).toBe('both');
    seg('Arrowhead size', 'L');
    expect(g().edge.arrowSize).toBe('L');
    range('Default corner radius', '9');
    expect(g().edge.cornerRadius).toBe(9);
  });
  it('edge presets: add, rename, recolour, restyle, remove', () => {
    render(<SettingsModal />);
    expect(screen.queryAllByTestId('user-preset')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '+ Add preset' }));
    expect(screen.getAllByTestId('user-preset')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Preset name 1'), { target: { value: 'Hot' } });
    expect(g().edgePresets[0].name).toBe('Hot');
    colour('Preset colour 1', '#ff0000');
    expect(g().edgePresets[0].color.toLowerCase()).toBe('#ff0000');
    fireEvent.change(screen.getByLabelText('Preset line 1'), { target: { value: 'dashed' } });
    expect(g().edgePresets[0].strokeStyle).toBe('dashed');
    fireEvent.click(screen.getByRole('button', { name: '+ Add preset' }));
    expect(g().edgePresets).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove preset 1' }));
    expect(g().edgePresets).toHaveLength(1);
    expect(g().edgePresets[0].name).toBe('My preset');
    expect(screen.getByLabelText('Preset line 1')).toHaveValue('solid');
  });
  it('canvas controls incl. transparent toggle hides background colour', () => {
    render(<SettingsModal />);
    check('Transparent canvas');
    expect(g().canvas.background).toBe('transparent');
    expect(screen.queryByLabelText('Canvas background')).toBeNull();
    check('Transparent canvas');
    expect(g().canvas.background).toBe('#ffffff');
    colour('Canvas background', '#222222');
    expect(g().canvas.background).toBe('#222222');
    const grid = g().canvas.grid;
    check('Show grid');
    expect(g().canvas.grid).toBe(!grid);
    fireEvent.change(screen.getByLabelText('Grid size'), { target: { value: '2' } });
    expect(g().canvas.gridSize).toBe(5);
    fireEvent.change(screen.getByLabelText('Grid size'), { target: { value: '0' } });
    expect(g().canvas.gridSize).toBe(20);
    fireEvent.change(screen.getByLabelText('Grid size'), { target: { value: '40' } });
    expect(g().canvas.gridSize).toBe(40);
    const snap = g().canvas.snap;
    check('Snap to grid');
    expect(g().canvas.snap).toBe(!snap);
    const sk = g().canvas.sketch;
    check('Sketch (hand-drawn) look');
    expect(g().canvas.sketch).toBe(!sk);
  });
  it('export controls and theme', () => {
    render(<SettingsModal />);
    const tr = g().export.transparent;
    check('Transparent background');
    expect(g().export.transparent).toBe(!tr);
    seg('Export scale', '3x');
    expect(g().export.scale).toBe(3);
    fireEvent.change(screen.getByLabelText('Export padding'), { target: { value: '50' } });
    expect(g().export.padding).toBe(50);
    fireEvent.change(screen.getByLabelText('Export padding'), { target: { value: '-5' } });
    expect(g().export.padding).toBe(0);
    seg('Theme', 'Dark');
    expect(g().theme).toBe('dark');
  });
  it('nav buttons scroll to sections; app section present in global', () => {
    render(<SettingsModal />);
    const nav = within(screen.getByRole('navigation', { name: 'Settings sections' }));
    expect(nav.getAllByRole('button')).toHaveLength(7);
    fireEvent.click(nav.getByRole('button', { name: 'Canvas' }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
  it('reset global restores defaults', () => {
    render(<SettingsModal />);
    seg('Theme', 'Dark');
    fireEvent.click(screen.getByRole('button', { name: 'Reset global settings' }));
    expect(g().theme).not.toBe('dark');
  });
});

describe('SettingsModal project scope', () => {
  it('writes project settings, hides app section, resets project', () => {
    render(<SettingsModal />);
    seg('Settings scope', 'This project');
    expect(screen.queryAllByRole('group', { name: 'Theme' })).toHaveLength(0);
    expect(within(screen.getByRole('navigation')).getAllByRole('button')).toHaveLength(6);
    seg('Node background', 'Filled');
    expect(proj().node.background).toBe('filled');
    expect(g().node.background).not.toBe('filled');
    expect(useDiagramStore.getState().projectSettings.node?.background).toBe('filled');
    fireEvent.click(screen.getByRole('button', { name: 'Reset project settings' }));
    expect(useDiagramStore.getState().projectSettings).toEqual({});
    seg('Settings scope', 'Global defaults');
    expect(screen.getAllByRole('group', { name: 'Theme' }).length).toBeGreaterThan(0);
  });
});

describe('apply buttons', () => {
  const seed = () => act(() => {
    useDiagramStore.getState().loadDiagram({ nodes: [n('a', 0, 0), n('b', 400, 200), n('c', 0, 400)], edges: [] });
    useDiagramStore.getState().connect({ source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left' });
    useDiagramStore.getState().connect({ source: 'a', target: 'c', sourceHandle: 'bottom', targetHandle: 'top' });
  });
  it('apply defaults to page: confirm yes applies, no does not', async () => {
    seed();
    const spy = vi.spyOn(useDiagramStore.getState(), 'applyDefaultsToPage');
    useDiagramStore.setState({ applyDefaultsToPage: spy });
    render(<SettingsModal />);
    confirmSpy.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Apply defaults to all components on this page' }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply defaults to all components on this page' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });
  it('apply line style: cancel does nothing', async () => {
    seed();
    render(<SettingsModal />);
    seg('Line style', 'Straight');
    confirmSpy.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all edges' }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    await act(async () => undefined);
    expect(useDiagramStore.getState().edges.every((e) => e.data?.lineType === undefined)).toBe(true);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
  it('apply line style page: confirms, applies, toasts plural; overrides hint shown', async () => {
    seed();
    act(() => void useDiagramStore.getState().updateEdges([useDiagramStore.getState().edges[0].id], { lineType: 'curved' }));
    render(<SettingsModal />);
    seg('Line style', 'Straight');
    expect(screen.getByTestId('line-style-overrides')).toHaveTextContent('1 edge uses a custom style');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all edges' }));
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    const msg = confirmSpy.mock.calls[0][0] as { message: string };
    expect(msg.message).toContain('Set every edge on this page to Straight');
    expect(useDiagramStore.getState().edges.every((e) => e.data?.lineType === 'straight')).toBe(true);
    expect(useToastStore.getState().toasts[0].message).toBe('2 edges set to Straight');
  });
  it('apply line style project scope + hand-routed warning, singular toast', async () => {
    seed();
    const st = useDiagramStore.getState();
    act(() => void useDiagramStore.setState({ edges: [{ ...st.edges[0], data: { ...st.edges[0].data, waypoints: [{ x: 5, y: 5 }], manual: true, lineType: 'curved' } } as never] }));
    render(<SettingsModal />);
    seg('Line style', 'Curved');
    expect(screen.getByTestId('line-style-overrides').textContent).toMatch(/hand-routed/);
    seg('Apply scope', 'Whole project');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all edges' }));
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    const msg = confirmSpy.mock.calls[0][0] as { message: string };
    expect(msg.message).toContain('Set every edge in the project to Curved');
    expect(msg.message).toContain('Waypoints of 1 hand-routed edge will be cleared.');
    expect(useToastStore.getState().toasts[0].message).toBe('1 edge set to Curved');
  });
  it('plural overrides hint and plural hand-routed warning', async () => {
    seed();
    const st = useDiagramStore.getState();
    act(() => void useDiagramStore.setState({ edges: st.edges.map((e) => ({ ...e, data: { ...e.data, waypoints: [{ x: 1, y: 1 }], manual: true, lineType: 'orthogonal' } }) as never) }));
    render(<SettingsModal />);
    seg('Line style', 'Straight');
    expect(screen.getByTestId('line-style-overrides')).toHaveTextContent('2 edges use a custom style');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all edges' }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect((confirmSpy.mock.calls[0][0] as { message: string }).message).toContain('Waypoints of 2 hand-routed edges will be cleared.');
  });
});
