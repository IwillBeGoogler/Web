import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommentsStore } from '../../comments/store';
import * as exportLib from '../../lib/export';
import { flowRef } from '../../lib/board/flowRef';
import * as lintBridge from '../../lib/smart/lintBridge';
import { useDiagramStore } from '../../store/diagramStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useSmart } from '../../store/smartStore';
import { useToastStore } from '../../store/toastStore';
import { useEditorSession } from '../../sync/status';
import { useDiffStore } from '../../versions/diffStore';
import type { DocDiff } from '../../lib/versionDiff';
import { ReviewPanel } from './ReviewPanel';

const rec = (o: Record<string, unknown>) => o as never;
const mkDiff = (p: Partial<{ nodes: Partial<DocDiff['nodes']>; edges: Partial<DocDiff['edges']> }>): DocDiff =>
  ({ nodes: { added: [], removed: [], changed: [], ...p.nodes }, edges: { added: [], removed: [], changed: [], ...p.edges }, nameChanged: null, isEmpty: false }) as DocDiff;

const show = (diff: DocDiff) => act(() => { useDiffStore.getState().show(diff, 'v1', 'v2'); useSmart.getState().setDiff(true); });
const comments = (add: unknown) => act(() => { useCommentsStore.setState({ fileId: 'p1', add } as never); useDiagramStore.setState({ projectId: 'p1' } as never); });

beforeEach(() => {
  cleanup();
  useDiagramStore.getState().reset();
  useSmart.getState().reset();
  useDiffStore.getState().clear();
  useCommentsStore.getState().reset();
  useEditorSession.getState().reset();
  flowRef.current = null;
});
afterEach(() => { vi.restoreAllMocks(); flowRef.current = null; });

describe('ReviewPanel branches', () => {
  it('renders nothing when open but there is no diff', () => {
    act(() => useSmart.getState().setDiff(true));
    render(<ReviewPanel />);
    expect(screen.queryByTestId('review-panel')).toBeNull();
  });

  it('empty diff says no differences and singular/plural item count', () => {
    show(mkDiff({}));
    render(<ReviewPanel />);
    expect(screen.getByText('No differences.')).toBeInTheDocument();
    expect(screen.getByText(/0 items/)).toBeInTheDocument();
    act(() => { useDiffStore.getState().show(mkDiff({ nodes: { added: [rec({ id: 'n1', data: { label: '' }, position: { x: 0, y: 0 } })] } }), 'a', 'b'); });
    expect(screen.getByText(/· 1 item$/)).toBeInTheDocument();
    expect(screen.getByTestId('review-added')).toHaveTextContent('n1'); // empty label falls back to id
  });

  it('names edges by node labels, falls back to raw ids, and shows edge labels', () => {
    act(() => useDiagramStore.setState({ nodes: [rec({ id: 'a', type: 'service', position: { x: 0, y: 0 }, data: { label: 'Alpha' } })] }));
    show(mkDiff({
      edges: {
        added: [rec({ id: 'e1', source: 'a', target: 'ghost', label: 'HTTPS' })],
        removed: [rec({ id: 'e2', source: 'a', target: 'a' })],
        changed: [{ id: 'e3', before: rec({ id: 'e3', source: 'a', target: 'a', label: 'x' }), after: rec({ id: 'e3', source: 'a', target: 'a', label: 'y' }) }],
      },
    }));
    render(<ReviewPanel />);
    const rows = screen.getAllByRole('button').map((b) => b.textContent);
    expect(rows.some((r) => r?.includes('Alpha → ghost “HTTPS”'))).toBe(true);
    expect(rows.some((r) => r?.includes('Alpha → Alpha') && !r.includes('“'))).toBe(true);
    expect(screen.getByTestId('review-changed')).toHaveTextContent('Alpha → Alpha “y”');
  });

  it('edge click selects endpoints unless removed (removed does nothing)', () => {
    const spy = vi.spyOn(lintBridge, 'showProblem').mockImplementation(() => undefined);
    show(mkDiff({ edges: { added: [rec({ id: 'e1', source: 'a', target: 'b' })], removed: [rec({ id: 'e2', source: 'a', target: 'b' })] } }));
    render(<ReviewPanel />);
    fireEvent.click(screen.getByTestId('review-removed'));
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('review-added'));
    expect(spy).toHaveBeenCalledWith(['a', 'b'], ['e1']);
  });

  it('removed node: centres the viewport (absolute position when parented), no-op without a flow instance', () => {
    const setCenter = vi.fn();
    const parent = rec({ id: 'p', type: 'group', position: { x: 100, y: 100 }, width: 200, height: 200, data: { label: 'P' } });
    act(() => useDiagramStore.setState({ nodes: [parent] }));
    show(mkDiff({ nodes: { removed: [rec({ id: 'free', position: { x: 10, y: 20 }, width: 100, height: 40, data: { label: 'Free' } }), rec({ id: 'kid', parentId: 'p', position: { x: 5, y: 5 }, width: 100, height: 40, data: { label: 'Kid' } })] } }));
    render(<ReviewPanel />);
    const [free, kid] = screen.getAllByTestId('review-removed');
    fireEvent.click(free); // no flow instance: nothing thrown
    flowRef.current = { setCenter } as never;
    fireEvent.click(free);
    expect(setCenter).toHaveBeenLastCalledWith(60, 40, { zoom: 1, duration: 350 });
    fireEvent.click(kid);
    expect(setCenter).toHaveBeenLastCalledWith(155, 125, { zoom: 1, duration: 350 });
  });

  it('added node click selects via showProblem', () => {
    const spy = vi.spyOn(lintBridge, 'showProblem').mockImplementation(() => undefined);
    show(mkDiff({ nodes: { added: [rec({ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'N' } })] } }));
    render(<ReviewPanel />);
    fireEvent.click(screen.getByTestId('review-added'));
    expect(spy).toHaveBeenCalledWith(['n1']);
  });

  it('viewer cannot comment; commenter on another file cannot either', () => {
    show(mkDiff({ nodes: { added: [rec({ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'N' } })] } }));
    comments(vi.fn());
    act(() => useEditorSession.setState({ role: 'viewer' } as never));
    render(<ReviewPanel />);
    expect(screen.queryByLabelText(/Comment on/)).toBeNull();
    act(() => useEditorSession.setState({ role: 'commenter' } as never));
    expect(screen.getByLabelText('Comment on N')).toBeInTheDocument();
    act(() => useCommentsStore.setState({ fileId: 'other' } as never));
    expect(screen.queryByLabelText(/Comment on/)).toBeNull();
  });

  it('comment form: toggles, blocks blank submit, anchors point for removed/edge rows, reports failures', async () => {
    const add = vi.fn().mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce('plain').mockResolvedValue({});
    comments(add);
    show(mkDiff({ nodes: { removed: [rec({ id: 'gone', position: { x: 7, y: 9 }, data: { label: 'Gone' } })] }, edges: { added: [rec({ id: 'e1', source: 'a', target: 'b' })] } }));
    render(<ReviewPanel />);
    fireEvent.click(screen.getByLabelText('Comment on Gone'));
    const input = screen.getByLabelText('Review comment');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.submit(input.closest('form')!); // blank: ignored
    expect(add).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '  why  ' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenLastCalledWith({ body: 'Review (v1 → v2): why', anchor: { type: 'point', x: 7, y: 9 } });
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.message.includes('boom'))).toBe(true));
    expect(screen.getByLabelText('Review comment')).toHaveValue('  why  '); // kept on failure
    fireEvent.submit(screen.getByLabelText('Review comment').closest('form')!);
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.message.includes('plain'))).toBe(true));
    fireEvent.submit(screen.getByLabelText('Review comment').closest('form')!);
    await waitFor(() => expect(screen.queryByLabelText('Review comment')).toBeNull()); // success closes the form
    // toggle on the same row closes it; edge row has no position so defaults to 0,0
    fireEvent.click(screen.getByLabelText(/Comment on .* → /));
    fireEvent.click(screen.getByLabelText(/Comment on .* → /));
    expect(screen.queryByLabelText('Review comment')).toBeNull();
    fireEvent.click(screen.getByLabelText(/Comment on .* → /));
    fireEvent.change(screen.getByLabelText('Review comment'), { target: { value: 'edge' } });
    fireEvent.submit(screen.getByLabelText('Review comment').closest('form')!);
    await waitFor(() => expect(add).toHaveBeenLastCalledWith({ body: 'Review (v1 → v2): edge', anchor: { type: 'point', x: 0, y: 0 } }));
  });

  it('export report: filters non-review comments, includes replies, defaults the title', () => {
    const dl = vi.spyOn(exportLib, 'downloadText').mockImplementation(() => undefined);
    const c = (id: string, body: string, anchor: unknown, name = 'Bob') => ({ id, fileId: 'f', parentId: null, author: { id: 'u', name }, body, anchor, resolved: false, resolvedAt: null, resolvedBy: null, mentions: [], createdAt: 1, updatedAt: 1 });
    act(() => useCommentsStore.setState({
      threads: [
        { root: c('1', 'Review (v1 → v2): first', { type: 'node', nodeId: 'n1', dx: 0, dy: 0 }), replies: [c('2', 'reply', { type: 'node', nodeId: 'unknown', dx: 0, dy: 0 }, 'Cy')] },
        { root: c('3', 'Review (v1 → v2): pt', { type: 'point', x: 1, y: 1 }), replies: [] },
        { root: c('4', 'chatter', null), replies: [] },
      ],
    } as never));
    show(mkDiff({ nodes: { added: [rec({ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'N' } })] } }));
    render(<ReviewPanel />);
    fireEvent.click(screen.getByText('Export report'));
    const [md, name] = dl.mock.calls[0];
    expect(String(md)).toContain('first');
    expect(String(md)).not.toContain('chatter');
    act(() => useDiagramStore.setState({ projectName: '' } as never));
    fireEvent.click(screen.getByText('Export report'));
    expect(dl.mock.calls[1][1]).toBe('diagram-changes.md');
    act(() => useDiagramStore.setState({ projectName: 'My / Cool App!' } as never));
    fireEvent.click(screen.getByText('Export report'));
    expect(dl.mock.calls[2][1]).toBe('my-cool-app-changes.md');
    act(() => useDiagramStore.setState({ projectName: '!!!' } as never));
    fireEvent.click(screen.getByText('Export report'));
    expect(dl.mock.calls[3][1]).toBe('diagram-changes.md');
  });

  it('store nodes without label fall back to id; undefined role and missing file id block commenting', () => {
    act(() => useDiagramStore.setState({ nodes: [rec({ id: 'bare', type: 'service', position: { x: 0, y: 0 }, data: { label: '' } })], projectId: '' } as never));
    show(mkDiff({ edges: { added: [rec({ id: 'e1', source: 'bare', target: 'bare' })] } }));
    act(() => { useEditorSession.setState({ role: undefined } as never); useCommentsStore.setState({ fileId: '' } as never); });
    render(<ReviewPanel />);
    expect(screen.getByTestId('review-added')).toHaveTextContent('bare → bare');
    expect(screen.queryByLabelText(/Comment on/)).toBeNull(); // viewer fallback, and no file id
  });

  it('sidebar state moves the panel', () => {
    show(mkDiff({}));
    render(<ReviewPanel />);
    const left = () => (screen.getByTestId('review-panel') as HTMLElement).style.left;
    act(() => useLayoutStore.setState({ sidebarOpen: true }));
    expect(left()).toBe('316px');
    act(() => useLayoutStore.setState({ sidebarOpen: false }));
    expect(left()).toBe('64px');
  });
});
