import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@xyflow/react', async (orig) => ({ ...(await orig<typeof import('@xyflow/react')>()), ViewportPortal: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { useDiagramStore } from '../../store/diagramStore';
import { useSmart } from '../../store/smartStore';
import { useDiffStore } from '../../versions/diffStore';
import { useTimeline } from '../../versions/timelineStore';
import type { DocDiff } from '../../lib/versionDiff';
import { DiffBanner, DiffOverlay } from './DiffOverlay';

const n = (id: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({ id, type: 'service', position: { x, y }, width: 100, height: 40, data: { label: id.toUpperCase() }, ...extra });
const diff = (p: Partial<{ nodes: Partial<DocDiff['nodes']>; edges: Partial<DocDiff['edges']> }> = {}): DocDiff => ({
  nodes: { added: [], removed: [], changed: [], ...p.nodes },
  edges: { added: [], removed: [], changed: [], ...p.edges },
  nameChanged: null,
  isEmpty: false,
});
const mount = (ui: React.ReactNode) => render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

beforeEach(() => {
  useDiffStore.getState().clear();
  useDiagramStore.getState().reset();
  useTimeline.setState({ open: false, preview: null });
  useSmart.setState({ diff: false });
});

describe('DiffOverlay', () => {
  it('renders nothing without a diff', () => {
    mount(<DiffOverlay />);
    expect(screen.queryByTestId('diff-overlay')).toBeNull();
  });
  it('draws added / removed / changed boxes with tags and edge lines', () => {
    useDiagramStore.setState({ nodes: [n('live', 500, 500) as never] });
    const a = n('a', 10, 20), r = n('r', 200, 20), c1 = n('c', 0, 0, { data: {} }), c2 = n('c', 50, 60, { data: {} });
    useDiffStore.getState().show(diff({
      nodes: { added: [a], removed: [r], changed: [{ id: 'c', before: c1, after: c2, fields: ['moved'] }] },
      edges: {
        added: [{ id: 'e1', source: 'a', target: 'c' }, { id: 'ex', source: 'a', target: 'ghost' }],
        removed: [{ id: 'e2', source: 'r', target: 'c' }],
        changed: [{ id: 'e3', before: { id: 'e3' }, after: { id: 'e3', source: 'c', target: 'live' }, fields: ['label'] }],
      },
    }), 'v1', 'Current');
    mount(<DiffOverlay />);
    const add = screen.getByTestId('diff-added');
    expect((add as HTMLElement).style.left).toBe('10px');
    expect(add.textContent).toContain('+ A');
    const rem = screen.getByTestId('diff-removed');
    expect(rem.textContent).toContain('− R');
    expect(rem.querySelector('.diff-ghost-label')!.textContent).toBe('R');
    const ch = screen.getByTestId('diff-changed');
    expect(ch.textContent).toContain('~ c'); // empty label falls back to id
    expect(ch.querySelector('.diff-ghost-label')).toBeNull();
    const lines = Array.from(document.querySelectorAll('line.diff-line'));
    expect(lines.map((l) => l.getAttribute('class'))).toEqual(['diff-line diff-added', 'diff-line diff-removed', 'diff-line diff-changed']);
    // added a(60,40) -> changed c after (100,80)
    expect(lines[0].getAttribute('x1')).toBe('60');
    expect(lines[0].getAttribute('y2')).toBe('80');
    // removed: r(250,40) -> c before (50,20)
    expect(lines[1].getAttribute('x2')).toBe('50');
    // changed edge falls back to the live node (550,520)
    expect(lines[2].getAttribute('x2')).toBe('550');
  });
  it('uses timeline preview nodes and absolute positions for nested nodes', () => {
    const parent = n('p', 100, 100);
    const child = n('k', 10, 10, { parentId: 'p' });
    useTimeline.setState({ preview: { version: 1, nodes: [parent as never, child as never], edges: [] } });
    useDiffStore.getState().show(diff({ nodes: { added: [child], removed: [n('z', 0, 0, { parentId: 'p' })] } }), 'a', 'b');
    mount(<DiffOverlay />);
    expect((screen.getByTestId('diff-added') as HTMLElement).style.left).toBe('110px');
    // removed node not part of the pool: appended before resolving its parent
    expect((screen.getByTestId('diff-removed') as HTMLElement).style.left).toBe('100px');
  });
});

describe('DiffBanner', () => {
  it('hidden without diff, while review panel or timeline is open', () => {
    const { rerender } = mount(<DiffBanner />);
    expect(screen.queryByTestId('diff-banner')).toBeNull();
    useDiffStore.getState().show(diff(), 'v1', 'Current');
    act(() => useSmart.setState({ diff: true }));
    expect(screen.queryByTestId('diff-banner')).toBeNull();
    act(() => useSmart.setState({ diff: false }));
    expect(screen.getByTestId('diff-banner').textContent).toContain('v1 → Current');
    act(() => useTimeline.setState({ open: true }));
    expect(screen.queryByTestId('diff-banner')).toBeNull();
    rerender(<ReactFlowProvider><DiffBanner /></ReactFlowProvider>);
  });
  it('Exit button and Escape clear the comparison; other keys do not; timeline open ignores Escape', () => {
    useDiffStore.getState().show(diff(), 'v1', 'Current');
    mount(<DiffBanner />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(useDiffStore.getState().diff).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useDiffStore.getState().diff).toBeNull();
    act(() => useDiffStore.getState().show(diff(), 'v1', 'Current'));
    fireEvent.click(screen.getByRole('button', { name: 'Exit comparison' }));
    expect(useDiffStore.getState().diff).toBeNull();
  });
  it('Escape is inert while the timeline owns the comparison', () => {
    useTimeline.setState({ open: true });
    useDiffStore.getState().show(diff(), 'v1', 'Current');
    mount(<DiffBanner />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useDiffStore.getState().diff).not.toBeNull();
  });
});
