import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../../api/session';
import type { ApiComment, CommentThread, Member } from '../../api/types';
import { formatMention } from '../../comments/logic';
import { useCommentsStore } from '../../comments/store';
import { useDiagramStore } from '../../store/diagramStore';
import { useEditorSession } from '../../sync/status';
import { Composer } from './CommentParts';
import { CommentsPanel } from './CommentsPanel';

const members: Member[] = [
  { userId: 'u_ann', email: 'ann@x.y', name: 'Ann Lee', role: 'editor' },
  { userId: 'u_bob', email: 'bob@x.y', name: 'Bob Stone', role: 'viewer' },
  { userId: 'me', email: 'me@x.y', name: 'Me', role: 'owner' },
];
const c = (id: string, extra: Partial<ApiComment> = {}): ApiComment => ({
  id, fileId: 'f1', parentId: null, author: { id: 'u_ann', name: 'Ann Lee' }, body: `text ${id}`, anchor: { type: 'point', x: 10, y: 20 },
  resolved: false, resolvedAt: null, resolvedBy: null, mentions: [], createdAt: Date.now() - 60_000, updatedAt: Date.now() - 60_000, ...extra,
});
const thread = (id: string, extra: Partial<ApiComment> = {}, replies: ApiComment[] = []): CommentThread => ({ root: c(id, extra), replies });
const fns = { add: vi.fn(), reply: vi.fn(async () => c('x')), edit: vi.fn(async () => undefined), resolve: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
const setup = (threads: CommentThread[], role: 'viewer' | 'commenter' | 'editor' | 'owner' = 'commenter', open = true) => {
  useSession.setState({ user: { id: 'me', email: 'me@x.y', name: 'Me', isAdmin: false } });
  useEditorSession.setState({ role, source: 'server', readOnly: role === 'viewer' || role === 'commenter' });
  useCommentsStore.setState({ fileId: 'f1', meId: 'me', threads, members, panelOpen: open, filter: 'all', activeId: null, draft: null, unread: 0, ...fns });
};
beforeEach(() => {
  Object.values(fns).forEach((f) => f.mockClear());
  useCommentsStore.getState().reset();
  useDiagramStore.getState().reset();
});
const withFlow = (ui: React.ReactElement) => render(<ReactFlowProvider>{ui}</ReactFlowProvider>);

describe('Composer: @mention autocomplete', () => {
  const type = (ta: HTMLTextAreaElement, value: string) => fireEvent.change(ta, { target: { value, selectionStart: value.length } });
  it('typing @ + letters lists matching members (not me); Enter inserts the mention token', async () => {
    const onSubmit = vi.fn();
    render(<Composer placeholder="Say" submitLabel="Send" members={members} meId="me" onSubmit={onSubmit} />);
    const ta = screen.getByLabelText('Say') as HTMLTextAreaElement;
    type(ta, 'hi @b');
    const list = screen.getByRole('listbox', { name: 'Mention a member' });
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['BSBob Stonebob@x.y'].map(() => expect.stringContaining('Bob Stone')) as never);
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(ta.value).toBe(`hi ${formatMention('Bob Stone', 'u_bob')} `);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(`hi ${formatMention('Bob Stone', 'u_bob')}`));
  });
  it('arrows move the pick, Esc closes the list, a click picks', () => {
    render(<Composer placeholder="Say" submitLabel="Send" members={members} meId="me" onSubmit={vi.fn()} />);
    const ta = screen.getByLabelText('Say') as HTMLTextAreaElement;
    type(ta, '@');
    expect(screen.getAllByRole('option')).toHaveLength(2); // Ann, Bob (not me)
    fireEvent.keyDown(ta, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    type(ta, '@an');
    fireEvent.mouseDown(screen.getAllByRole('option')[0]);
    expect(ta.value).toContain('(user:u_ann)');
  });
  it('the send button is disabled for empty text; ⌘↵ sends; errors are shown', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('403 forbidden'));
    render(<Composer placeholder="Say" submitLabel="Send" members={[]} meId="me" onSubmit={onSubmit} />);
    const ta = screen.getByLabelText('Say') as HTMLTextAreaElement;
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    type(ta, 'hello');
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('403 forbidden');
  });
});

describe('CommentsPanel', () => {
  it('is not rendered while closed; lists threads with mention chips; filters', () => {
    setup([thread('a', { body: `hi ${formatMention('Me', 'me')}`, mentions: ['me'] }), thread('b', { resolved: true })], 'commenter', false);
    const { rerender } = withFlow(<CommentsPanel />);
    expect(screen.queryByTestId('comments-panel')).toBeNull();
    useCommentsStore.setState({ panelOpen: true });
    rerender(<ReactFlowProvider><CommentsPanel /></ReactFlowProvider>);
    expect(screen.getAllByTestId('comment-thread')).toHaveLength(2);
    expect(document.querySelector('.mention-chip.me')).toHaveTextContent('@Me');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getAllByTestId('comment-thread')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    expect(screen.getByText('Resolved', { selector: '.comment-state' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mentions' }));
    expect(screen.getAllByTestId('comment-thread')).toHaveLength(1); // 'a' mentions me
    fireEvent.click(screen.getByRole('button', { name: 'Mine' }));
    expect(screen.queryAllByTestId('comment-thread')).toHaveLength(0);
    expect(screen.getByText('Nothing matches this filter.')).toBeInTheDocument();
  });

  it('a commenter can reply and resolve; a viewer sees the thread but no buttons', async () => {
    setup([thread('a')], 'commenter');
    const { unmount } = withFlow(<CommentsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(fns.resolve).toHaveBeenCalledWith('a', true);
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    const ta = screen.getByLabelText('Reply…');
    fireEvent.change(ta, { target: { value: 'thanks' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' }).at(-1)!);
    await waitFor(() => expect(fns.reply).toHaveBeenCalledWith('a', 'thanks'));
    unmount();
    setup([thread('a')], 'viewer');
    withFlow(<CommentsPanel />);
    expect(screen.getByTestId('comment-thread')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  });

  it('a resolved thread can be reopened; only your own comments (or any, for owners) can be deleted', () => {
    setup([thread('mine', { author: { id: 'me', name: 'Me' }, resolved: true }), thread('theirs')], 'editor');
    const { unmount } = withFlow(<CommentsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(fns.resolve).toHaveBeenCalledWith('mine', false);
    const cards = screen.getAllByTestId('comment-thread');
    expect(within(cards[0]).getByRole('button', { name: 'Delete comment' })).toBeInTheDocument();
    expect(within(cards[1]).queryByRole('button', { name: 'Delete comment' })).toBeNull();
    unmount();
    setup([thread('theirs')], 'owner');
    withFlow(<CommentsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(fns.remove).toHaveBeenCalledWith('theirs');
  });

  it('the filter and the close button live in the store', () => {
    setup([thread('a')]);
    withFlow(<CommentsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Close comments' }));
    expect(useCommentsStore.getState().panelOpen).toBe(false);
  });
});

