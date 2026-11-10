import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rf = vi.hoisted(() => ({ fitView: vi.fn() }));
vi.mock('@xyflow/react', async (orig) => ({ ...(await orig<typeof import('@xyflow/react')>()), useReactFlow: () => rf }));

import { ArrangeMenu } from './ArrangeMenu';
import { useDiagramStore } from '../store/diagramStore';
import { useEditorSession } from '../sync/status';
import { loadPrefs } from '../lib/autoarrange/prefs';
import type { DiagramNode } from '../types';

const nd = (id: string, type = 'icon', x = 0, y = 0, extra: object = {}): DiagramNode =>
  ({ id, type, position: { x, y }, width: 120, height: 96, data: { label: id }, ...extra }) as DiagramNode;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useEditorSession.getState().reset();
  useDiagramStore.getState().reset();
});
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Auto layout/ }));

describe('ArrangeMenu', () => {
  it('toggles popover, closes on outside mousedown and Escape', () => {
    render(<ArrangeMenu />);
    expect(screen.queryByRole('dialog')).toBeNull();
    openMenu();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('dialog')); // inside: stays
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    return vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()).then(async () => {
      openMenu();
      fireEvent.keyDown(window, { key: 'Enter' });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'Escape' });
      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });
  it('disabled when read-only', () => {
    act(() => useEditorSession.getState().set({ readOnly: true }));
    render(<ArrangeMenu />);
    expect(screen.getByRole('button', { name: /Auto layout/ })).toBeDisabled();
  });
  it('picking algo / direction / spacing persists prefs', () => {
    useDiagramStore.setState({ projectId: 'p1' });
    render(<ArrangeMenu />);
    openMenu();
    expect(screen.getByRole('radio', { name: /Auto/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: /ERD/ }));
    expect(screen.getByRole('radio', { name: /ERD/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: /Left-right/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Roomy' }));
    expect(loadPrefs('p1')).toEqual({ algo: 'erd', direction: 'LR', spacing: 'roomy' });
    fireEvent.click(screen.getByRole('radio', { name: /Top-down/ }));
    expect(loadPrefs('p1').direction).toBe('TB');
    expect(screen.getByRole('radio', { name: /Top-down/ })).toHaveAttribute('aria-checked', 'true');
  });
  it('reloads prefs when project changes', () => {
    localStorage.setItem('sdd:arrange:p2', JSON.stringify({ algo: 'tree', direction: 'LR', spacing: 'compact' }));
    render(<ArrangeMenu />);
    openMenu();
    expect(screen.getByRole('radio', { name: /Tree/ })).toHaveAttribute('aria-checked', 'false');
    act(() => useDiagramStore.setState({ projectId: 'p2' }));
    expect(screen.getByRole('radio', { name: /Tree/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Compact' })).toHaveAttribute('aria-checked', 'true');
  });
  it('run button label follows scope and arranges + fits + closes', async () => {
    useDiagramStore.setState({ projectId: 'p3', nodes: [nd('a', 'icon', 5, 5), nd('b', 'icon', 6, 6), nd('c', 'icon', 7, 7)], edges: [] });
    render(<ArrangeMenu />);
    openMenu();
    expect(screen.getByRole('button', { name: /Arrange page/ })).toBeInTheDocument();
    act(() => useDiagramStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: n.id !== 'c' })) })));
    expect(screen.getByRole('button', { name: /Arrange 2 selected/ })).toBeInTheDocument();
    act(() => useDiagramStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: false })).concat([nd('g', 'group', 400, 0, { selected: true })]) })));
    expect(screen.getByRole('button', { name: /Arrange inside group/ })).toBeInTheDocument();
    act(() => useDiagramStore.setState((s) => ({ nodes: s.nodes.filter((n) => n.id !== 'g') })));
    fireEvent.click(screen.getByRole('button', { name: /Arrange page/ }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const pos = useDiagramStore.getState().nodes.map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(pos).size).toBe(3);
    expect(rf.fitView).toHaveBeenCalled();
  });
  it('shows detected algorithm next to Auto', () => {
    render(<ArrangeMenu />);
    openMenu();
    expect(document.querySelector('.arr-detected')?.textContent).toMatch(/·\s\S+/);
  });
});
