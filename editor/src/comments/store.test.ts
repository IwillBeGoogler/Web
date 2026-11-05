import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiComment, ApiNotification, CommentList, Member } from '../api/types';
import { openComment, useCommentsStore, useNotificationsStore } from './store';

const c = (id: string, extra: Partial<ApiComment> = {}): ApiComment => ({
  id, fileId: 'f1', parentId: null, author: { id: 'u_other', name: 'Other' }, body: id, anchor: { type: 'point', x: 0, y: 0 },
  resolved: false, resolvedAt: null, resolvedBy: null, mentions: [], createdAt: 1, updatedAt: 1, ...extra,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeApi(list: CommentList = { threads: [], unread: 0, readAt: 0 }): any {
  return {
    listComments: vi.fn(async () => list),
    addComment: vi.fn(async (_f: string, b: { body: string; parentId?: string }) => c(`new-${b.body}`, { body: b.body, parentId: b.parentId ?? null, author: { id: 'me', name: 'Me' }, anchor: b.parentId ? null : { type: 'point', x: 0, y: 0 } })),
    editComment: vi.fn(async (id: string, p: { body: string }) => c(id, { body: p.body })),
    resolveComment: vi.fn(async (id: string, r: boolean) => c(id, { resolved: r })),
    deleteComment: vi.fn(async () => undefined),
    markCommentsRead: vi.fn(async () => undefined),
    listMembers: vi.fn(async (): Promise<Member[]> => [{ userId: 'u1', email: 'a@x.y', name: 'Ann', role: 'editor' }]),
    listNotifications: vi.fn(async () => ({ items: [] as ApiNotification[], unread: 0 })),
    markNotificationsRead: vi.fn(async () => undefined),
  } as never;
}
beforeEach(() => {
  useCommentsStore.getState().reset();
  useNotificationsStore.getState().reset();
});

describe('comments store', () => {
  it('load: threads, unread count and the member list for @mentions', async () => {
    const api = fakeApi({ threads: [{ root: c('r1'), replies: [] }], unread: 2, readAt: 5 });
    await useCommentsStore.getState().load('f1', 'p1', 'me', api);
    const s = useCommentsStore.getState();
    expect(s.threads).toHaveLength(1);
    expect(s.unread).toBe(2);
    expect(s.members.map((m) => m.name)).toEqual(['Ann']);
    expect(s.fileId).toBe('f1');
  });

  it('overlapping loads of one file: the newest wins, a stale one landing last cannot bring `unread` back after the thread was opened', async () => {
    const list: CommentList = { threads: [{ root: c('r1'), replies: [] }], unread: 1, readAt: 0 };
    const gates: (() => void)[] = [];
    const api = fakeApi(list);
    api.listComments = vi.fn(() => new Promise<CommentList>((res) => gates.push(() => res(list))));
    openComment('f1', 'r1');
    const first = useCommentsStore.getState().load('f1', null, 'me', api);
    const second = useCommentsStore.getState().load('f1', null, 'me', api);
    gates[1]!(); // the newer one answers first, then the older one
    await second;
    gates[0]!();
    await first;
    expect(useCommentsStore.getState()).toMatchObject({ activeId: 'r1', panelOpen: true, filter: 'all', unread: 0 });
  });

  it('a reset drops a load still in flight', async () => {
    const list: CommentList = { threads: [{ root: c('r1'), replies: [] }], unread: 1, readAt: 0 };
    let go!: () => void;
    const api = fakeApi(list);
    api.listComments = vi.fn(() => new Promise<CommentList>((res) => (go = () => res(list))));
    const p = useCommentsStore.getState().load('f1', null, 'me', api);
    useCommentsStore.getState().reset();
    go();
    await p;
    expect(useCommentsStore.getState()).toMatchObject({ fileId: null, threads: [] });
  });

  it('add / reply go to the API and show up once (the WebSocket echo does not duplicate them)', async () => {
    const api = fakeApi();
    const st = useCommentsStore.getState();
    await st.load('f1', 'p1', 'me', api);
    const root = await st.add({ body: 'hello', anchor: { type: 'point', x: 1, y: 2 } }, api);
    expect(api.addComment).toHaveBeenCalledWith('f1', { body: 'hello', anchor: { type: 'point', x: 1, y: 2 } });
    expect(useCommentsStore.getState().threads).toHaveLength(1);
    useCommentsStore.getState().handleMessage({ type: 'comment.created', fileId: 'f1', comment: root });
    expect(useCommentsStore.getState().threads).toHaveLength(1);
    await useCommentsStore.getState().reply(root.id, 'answer', api);
    expect(useCommentsStore.getState().threads[0].replies).toHaveLength(1);
  });

  it('pushes from other people update the list and bump the unread badge unless the panel is open', async () => {
    const api = fakeApi();
    await useCommentsStore.getState().load('f1', 'p1', 'me', api);
    useCommentsStore.getState().handleMessage({ type: 'comment.created', fileId: 'f1', comment: c('theirs') });
    expect(useCommentsStore.getState().unread).toBe(1);
    useCommentsStore.getState().handleMessage({ type: 'comment.created', fileId: 'f1', comment: c('mine', { author: { id: 'me', name: 'Me' } }) });
    expect(useCommentsStore.getState().unread).toBe(1); // my own comments are never unread
    await useCommentsStore.getState().setPanel(true, api);
    expect(api.markCommentsRead).toHaveBeenCalledWith('f1');
    expect(useCommentsStore.getState().unread).toBe(0);
    useCommentsStore.getState().handleMessage({ type: 'comment.created', fileId: 'f1', comment: c('while-open') });
    expect(useCommentsStore.getState().unread).toBe(0); // open panel: read immediately
    useCommentsStore.getState().handleMessage({ type: 'comment.created', fileId: 'other-file', comment: c('x', { fileId: 'other-file' }) });
    expect(useCommentsStore.getState().threads.some((t) => t.root.id === 'x')).toBe(false);
  });

  it('resolve / reopen / delete / edit', async () => {
    const api = fakeApi({ threads: [{ root: c('r1'), replies: [] }], unread: 0, readAt: 0 });
    await useCommentsStore.getState().load('f1', 'p1', 'me', api);
    await useCommentsStore.getState().resolve('r1', true, api);
    expect(useCommentsStore.getState().threads[0].root.resolved).toBe(true);
    await useCommentsStore.getState().resolve('r1', false, api);
    expect(useCommentsStore.getState().threads[0].root.resolved).toBe(false);
    await useCommentsStore.getState().edit('r1', 'changed', api);
    expect(useCommentsStore.getState().threads[0].root.body).toBe('changed');
    await useCommentsStore.getState().remove('r1', api);
    expect(useCommentsStore.getState().threads).toEqual([]);
  });

  it('a failing API call leaves the list untouched and rethrows', async () => {
    const api = fakeApi();
    api.addComment.mockRejectedValueOnce(new Error('403'));
    await useCommentsStore.getState().load('f1', 'p1', 'me', api);
    await expect(useCommentsStore.getState().add({ body: 'x', anchor: { type: 'point', x: 0, y: 0 } }, api)).rejects.toThrow('403');
    expect(useCommentsStore.getState().threads).toEqual([]);
  });

  it('draft / active thread / filter / reset', async () => {
    const st = useCommentsStore.getState();
    st.setDraft({ anchor: { type: 'point', x: 3, y: 4 } });
    expect(useCommentsStore.getState().draft?.anchor).toEqual({ type: 'point', x: 3, y: 4 });
    st.setActive('r1');
    st.setFilter('mentions');
    expect(useCommentsStore.getState()).toMatchObject({ activeId: 'r1', filter: 'mentions' });
    st.reset();
    expect(useCommentsStore.getState()).toMatchObject({ draft: null, activeId: null, filter: 'open', threads: [] });
  });
});

describe('notifications store', () => {
  const n = (id: string, read = false): ApiNotification => ({ id, kind: 'mention', projectId: 'p', fileId: 'f1', commentId: 'c', actor: { id: 'u', name: 'Ann' }, text: `n ${id}`, createdAt: 1, read });
  it('load, push (deduped, newest first, unread counted), mark read', async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce({ items: [n('a'), n('b', true)], unread: 1 });
    await useNotificationsStore.getState().load(api);
    expect(useNotificationsStore.getState().unread).toBe(1);
    useNotificationsStore.getState().push(n('c'));
    useNotificationsStore.getState().push(n('c'));
    expect(useNotificationsStore.getState().items.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(useNotificationsStore.getState().unread).toBe(2);
    await useNotificationsStore.getState().markRead(['a'], api);
    expect(useNotificationsStore.getState().unread).toBe(1);
    await useNotificationsStore.getState().markAllRead(api);
    expect(useNotificationsStore.getState().unread).toBe(0);
    expect(api.markNotificationsRead).toHaveBeenLastCalledWith({ all: true });
  });
});

describe('comments refresh (polling stand-in)', () => {
  it('replaces the threads; unread counts when the panel is closed, reads when open', async () => {
    const api = fakeApi({ threads: [], unread: 0, readAt: 0 });
    await useCommentsStore.getState().load('f1', 'p1', 'me', api);
    api.listComments.mockResolvedValueOnce({ threads: [{ root: c('r9'), replies: [] }], unread: 2, readAt: 1 });
    await useCommentsStore.getState().refresh(api);
    expect(useCommentsStore.getState()).toMatchObject({ unread: 2 });
    expect(useCommentsStore.getState().threads.map((t) => t.root.id)).toEqual(['r9']);
    await useCommentsStore.getState().setPanel(true, api);
    api.markCommentsRead.mockClear();
    api.listComments.mockResolvedValueOnce({ threads: [{ root: c('r9'), replies: [] }], unread: 3, readAt: 1 });
    await useCommentsStore.getState().refresh(api);
    expect(useCommentsStore.getState().unread).toBe(0);
    expect(api.markCommentsRead).toHaveBeenCalledWith('f1');
  });

  it('ignores a result for a file that is no longer open, and does nothing without one', async () => {
    const api = fakeApi();
    await useCommentsStore.getState().refresh(api);
    expect(api.listComments).not.toHaveBeenCalled();
    await useCommentsStore.getState().load('f1', 'p1', 'me', api);
    let release: (v: CommentList) => void = () => undefined;
    api.listComments.mockReturnValueOnce(new Promise<CommentList>((r) => (release = r)));
    const p = useCommentsStore.getState().refresh(api);
    useCommentsStore.getState().reset();
    release({ threads: [{ root: c('late'), replies: [] }], unread: 1, readAt: 0 });
    await p;
    expect(useCommentsStore.getState().threads).toEqual([]);
  });
});
