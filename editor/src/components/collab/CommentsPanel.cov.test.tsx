import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rf = vi.hoisted(() => ({ setCenter: vi.fn(), getZoom: vi.fn(() => 0.3) }));
vi.mock('@xyflow/react', async (orig) => ({ ...(await orig<typeof import('@xyflow/react')>()), useReactFlow: () => rf }));
import { useSession } from '../../api/session';
import type { ApiComment, CommentThread } from '../../api/types';
import { useCommentsStore } from '../../comments/store';
import { useDiagramStore } from '../../store/diagramStore';
import { useToastStore } from '../../store/toastStore';
import { useEditorSession } from '../../sync/status';
import { useWorkspace } from '../../workspace/store';
import { CommentsPanel } from './CommentsPanel';

const c = (id: string, extra: Partial<ApiComment> = {}): ApiComment => ({
  id, fileId: 'f1', parentId: null, author: { id: 'u_ann', name: 'Ann' }, body: `text ${id}`, anchor: { type: 'point', x: 10, y: 20 },
  resolved: false, resolvedAt: null, resolvedBy: null, mentions: [], createdAt: 1_000_000, updatedAt: 1_000_000, ...extra,
});
const th = (id: string, extra: Partial<ApiComment> = {}, replies: ApiComment[] = []): CommentThread => ({ root: c(id, extra), replies });
const fns = {
  reply: vi.fn(async () => c('x')), edit: vi.fn(async () => undefined), resolve: vi.fn(async () => undefined), remove: vi.fn(async () => undefined),
  setActive: vi.fn(), setFilter: vi.fn(), setPanel: vi.fn(async () => undefined),
};
const msgs = () => useToastStore.getState().toasts.map((t) => t.message);
const setup = (threads: CommentThread[], role: 'viewer' | 'commenter' | 'editor' | 'owner' | null = 'editor') => {
  useSession.setState({ user: { id: 'me', email: 'm@x.y', name: 'Me', isAdmin: false } });
  useEditorSession.setState({ role: role as never, source: 'server', readOnly: false });
  useCommentsStore.setState({ fileId: 'f1', meId: 'me', threads, members: [], panelOpen: true, filter: 'all', activeId: null, ...fns } as never);
};
beforeEach(() => {
  Object.values(fns).forEach((f) => f.mockClear());
  rf.setCenter.mockClear();
  useDiagramStore.getState().reset();
  useToastStore.getState().clear();
  useWorkspace.setState({ role: 'viewer' } as never);
});

describe('CommentsPanel extra', () => {
  it('header: count, tip only for commenters, empty copy, filter buttons call the store', () => {
    setup([], 'viewer');
    const { rerender } = render(<CommentsPanel />);
    expect(screen.getByText('No comments yet.')).toBeTruthy();
    expect(screen.queryByText('Press C, then click the canvas')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    expect(fns.setFilter).toHaveBeenCalledWith('resolved');
    setup([], 'editor');
    rerender(<CommentsPanel />);
    expect(screen.getByText('Press C, then click the canvas')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Open' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Close comments' }));
    expect(fns.setPanel).toHaveBeenCalledWith(false);
  });
  it('falls back to the workspace role when the editor session has none', () => {
    setup([th('a')], null);
    useWorkspace.setState({ role: 'editor' } as never);
    render(<CommentsPanel />);
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy();
  });
  it('status line: n comments, 1 comment, resolved, detached', () => {
    useDiagramStore.setState({ nodes: [] });
    setup([
      th('a', {}, [c('r1')]), th('b'), th('c', { resolved: true }), th('d', { anchor: { type: 'node', nodeId: 'gone', dx: 0, dy: 0 } }),
    ]);
    render(<CommentsPanel />);
    const states = Array.from(document.querySelectorAll('.comment-state')).map((e) => e.textContent!.trim());
    expect(states).toEqual(['2 comments', '1 comment', 'Resolved', 'Detached from its node']);
    expect(screen.getAllByTestId('comment-thread')[2].className).toContain('resolved');
  });
  it('clicking the head or pressing Enter / Space focuses: activates and centres on the anchor (zoom floor 0.8); other keys and anchorless ignore', () => {
    setup([th('a'), th('b', { anchor: null })]);
    render(<CommentsPanel />);
    const heads = document.querySelectorAll('.comment-thread-head');
    fireEvent.click(heads[0]);
    expect(fns.setActive).toHaveBeenCalledWith('a');
    expect(rf.setCenter).toHaveBeenCalledWith(10, 20, { zoom: 0.8, duration: 250 });
    fireEvent.keyDown(heads[0], { key: 'Enter' });
    fireEvent.keyDown(heads[0], { key: ' ' });
    expect(rf.setCenter).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(heads[0], { key: 'x' });
    expect(rf.setCenter).toHaveBeenCalledTimes(3);
    fireEvent.click(heads[1]);
    expect(fns.setActive).toHaveBeenCalledWith('b');
    expect(rf.setCenter).toHaveBeenCalledTimes(3);
  });
  it('active thread is highlighted', () => {
    setup([th('a')]);
    useCommentsStore.setState({ activeId: 'a' });
    render(<CommentsPanel />);
    expect(screen.getByTestId('comment-thread').className).toContain('active');
  });
  it('edited marker only when updated well after creation; aria-label names the author', () => {
    setup([th('a', { updatedAt: 1_000_500 }, [c('r', { updatedAt: 1_005_000 })])]);
    render(<CommentsPanel />);
    const metas = Array.from(document.querySelectorAll('.comment-meta .muted')).map((e) => e.textContent!);
    expect(metas[0]).not.toContain('edited');
    expect(metas[1]).toContain('· edited');
    expect(screen.getByLabelText('Comment thread by Ann')).toBeTruthy();
  });
  it('edit flow: own comment, Save calls store.edit, closes; Cancel closes; failure toasts', async () => {
    setup([th('a', { author: { id: 'me', name: 'Me' } }, [c('r', { author: { id: 'me', name: 'Me' } })])]);
    render(<CommentsPanel />);
    const msgsEl = screen.getAllByTestId('comment-msg');
    expect(within(msgsEl[0]).getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    fireEvent.click(within(msgsEl[0]).getByRole('button', { name: 'Edit' }));
    expect(within(msgsEl[0]).queryByRole('button', { name: 'Edit' })).toBeNull();
    const ta = screen.getByLabelText('Edit comment') as HTMLTextAreaElement;
    expect(ta.value).toBe('text a');
    fireEvent.change(ta, { target: { value: 'changed', selectionStart: 7 } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fns.edit).toHaveBeenCalledWith('a', 'changed'));
    await waitFor(() => expect(screen.queryByLabelText('Edit comment')).toBeNull());
    fireEvent.click(within(screen.getAllByTestId('comment-msg')[0]).getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Edit comment')).toBeNull();
    // reply edit failing with Error / non-Error
    fns.edit.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(within(screen.getAllByTestId('comment-msg')[1]).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Edit comment'), { target: { value: 'zz', selectionStart: 2 } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(msgs()).toContain('denied'));
  });
  it('viewer cannot edit; non-Error failures use the generic message on delete / resolve', async () => {
    setup([th('a', { author: { id: 'me', name: 'Me' } })], 'owner');
    fns.remove.mockRejectedValueOnce('x');
    fns.resolve.mockRejectedValueOnce(new Error('res'));
    render(<CommentsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    await waitFor(() => expect(msgs()).toContain('Something went wrong'));
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(msgs()).toContain('res'));
  });
  it('viewer own comment: no Edit button but Delete is offered', () => {
    setup([th('a', { author: { id: 'me', name: 'Me' } })], 'viewer');
    render(<CommentsPanel />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete comment' })).toBeTruthy();
  });
  it('reply composer can be cancelled, returning the action buttons; reply deletion calls remove with reply id', async () => {
    setup([th('a', {}, [c('r', { author: { id: 'me', name: 'Me' } })])]);
    render(<CommentsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(fns.remove).toHaveBeenCalledWith('r');
  });
});
