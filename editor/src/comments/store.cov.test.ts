import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiComment } from '../api/types';

const m = vi.hoisted(() => ({
  listComments: vi.fn(), addComment: vi.fn(), editComment: vi.fn(), resolveComment: vi.fn(), deleteComment: vi.fn(),
  markCommentsRead: vi.fn(), listMembers: vi.fn(), listNotifications: vi.fn(), markNotificationsRead: vi.fn(),
}));
vi.mock('../api/api', () => ({ api: m }));
import { openComment, useCommentsStore, useNotificationsStore } from './store';
import { activeMentionQuery, anchorPoint, filterThreads, formatMention, insertMention, mentionCandidates, parseMentions, renderBody, threadCount, applyCommentEvent } from './logic';

const c = (id: string, extra: Partial<ApiComment> = {}): ApiComment => ({
  id, fileId: 'f1', parentId: null, author: { id: 'other', name: 'Other' }, body: id, anchor: { type: 'point', x: 0, y: 0 },
  resolved: false, resolvedAt: null, resolvedBy: null, mentions: [], createdAt: 1, updatedAt: 1, ...extra,
});
beforeEach(() => {
  vi.clearAllMocks();
  useCommentsStore.getState().reset();
  useNotificationsStore.getState().reset();
  for (const k of Object.keys(m) as (keyof typeof m)[]) m[k].mockResolvedValue(undefined);
  m.listComments.mockResolvedValue({ threads: [], unread: 0, readAt: 0 });
  m.listMembers.mockResolvedValue([]);
  m.listNotifications.mockResolvedValue({ items: [], unread: 0 });
});

describe('comments store with the app-wide api (default arguments)', () => {
  it('load / refresh / add / reply / edit / resolve / remove / setPanel go through the shared api', async () => {
    m.listComments.mockResolvedValue({ threads: [{ root: c('r1'), replies: [] }], unread: 3, readAt: 0 });
    await useCommentsStore.getState().load('f1', null, 'me');
    expect(m.listMembers).not.toHaveBeenCalled();
    expect(useCommentsStore.getState()).toMatchObject({ unread: 3, fileId: 'f1' });

    m.addComment.mockResolvedValueOnce(c('n1', { author: { id: 'me', name: 'Me' } }));
    await useCommentsStore.getState().add({ body: 'hi', anchor: { type: 'point', x: 1, y: 1 } });
    expect(useCommentsStore.getState().activeId).toBe('n1');
    m.addComment.mockResolvedValueOnce(c('rp', { parentId: 'r1', anchor: null }));
    await useCommentsStore.getState().reply('r1', 'yo');
    expect(useCommentsStore.getState().threads[0].replies.map((r) => r.id)).toEqual(['rp']);
    m.editComment.mockResolvedValueOnce(c('r1', { body: 'edited' }));
    await useCommentsStore.getState().edit('r1', 'edited');
    expect(useCommentsStore.getState().threads[0].root.body).toBe('edited');
    m.resolveComment.mockResolvedValueOnce(c('r1', { resolved: true }));
    await useCommentsStore.getState().resolve('r1', true);
    expect(useCommentsStore.getState().threads[0].root.resolved).toBe(true);

    m.listComments.mockResolvedValueOnce({ threads: [], unread: 0, readAt: 0 });
    await useCommentsStore.getState().refresh();
    expect(useCommentsStore.getState().threads).toEqual([]);

    useCommentsStore.setState({ threads: [{ root: c('x'), replies: [] }], activeId: 'x' });
    await useCommentsStore.getState().remove('x');
    expect(useCommentsStore.getState()).toMatchObject({ threads: [], activeId: null });
    useCommentsStore.setState({ activeId: 'keep', threads: [{ root: c('y'), replies: [] }] });
    await useCommentsStore.getState().remove('y');
    expect(useCommentsStore.getState().activeId).toBe('keep');
  });
  it('add and reply fail without a loaded file; refresh is a no-op', async () => {
    await expect(useCommentsStore.getState().add({ body: 'x', anchor: { type: 'point', x: 0, y: 0 } })).rejects.toThrow('no file');
    await expect(useCommentsStore.getState().reply('r', 'x')).rejects.toThrow('no file');
    await useCommentsStore.getState().refresh();
    expect(m.listComments).not.toHaveBeenCalled();
  });
  it('setPanel(true) marks read once, with or without an unread count; closing and file-less open do nothing', async () => {
    await useCommentsStore.getState().setPanel(true);
    expect(m.markCommentsRead).not.toHaveBeenCalled();
    await useCommentsStore.getState().load('f1', 'p', 'me');
    expect(m.listMembers).toHaveBeenCalledWith('p');
    useCommentsStore.setState({ unread: 4 });
    await useCommentsStore.getState().setPanel(true);
    expect(useCommentsStore.getState().unread).toBe(0);
    expect(m.markCommentsRead).toHaveBeenCalledTimes(1);
    await useCommentsStore.getState().setPanel(true);
    expect(m.markCommentsRead).toHaveBeenCalledTimes(2);
    await useCommentsStore.getState().setPanel(false);
    expect(m.markCommentsRead).toHaveBeenCalledTimes(2);
    m.markCommentsRead.mockRejectedValueOnce(new Error('x'));
    await expect(useCommentsStore.getState().setPanel(true)).resolves.toBeUndefined();
  });
  it('load tolerates a failing member list; a pending openComment is applied after load and swallows mark-read errors', async () => {
    m.listMembers.mockRejectedValueOnce(new Error('403'));
    openComment('f2', 'cc');
    m.markCommentsRead.mockRejectedValueOnce(new Error('x'));
    await useCommentsStore.getState().load('f2', 'p', 'me');
    expect(useCommentsStore.getState()).toMatchObject({ members: [], activeId: 'cc', panelOpen: true, reveal: 'cc', unread: 0 });
    await new Promise((r) => setTimeout(r, 0));
  });
  it('openComment on the loaded file reveals directly', async () => {
    m.listComments.mockResolvedValue({ threads: [{ root: c('r1'), replies: [] }], unread: 0, readAt: 0 });
    await useCommentsStore.getState().load('f1', null, 'me');
    openComment('f1', 'r1');
    expect(useCommentsStore.getState()).toMatchObject({ activeId: 'r1', reveal: 'r1', filter: 'all' });
  });
  it('a stale load (file changed while fetching) drops its result', async () => {
    let release!: (v: unknown) => void;
    m.listComments.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const p = useCommentsStore.getState().load('f1', null, 'me');
    useCommentsStore.getState().reset();
    release({ threads: [{ root: c('r1'), replies: [] }], unread: 1, readAt: 0 });
    await p;
    expect(useCommentsStore.getState().threads).toEqual([]);
  });
  it('refresh: open panel marks read when unread, closed panel shows the count, other file ignored', async () => {
    m.listComments.mockResolvedValue({ threads: [], unread: 2, readAt: 0 });
    await useCommentsStore.getState().load('f1', null, 'me');
    await useCommentsStore.getState().refresh();
    expect(useCommentsStore.getState().unread).toBe(2);
    useCommentsStore.setState({ panelOpen: true });
    await useCommentsStore.getState().refresh();
    expect(useCommentsStore.getState().unread).toBe(0);
    expect(m.markCommentsRead).toHaveBeenCalledWith('f1');
    m.listComments.mockResolvedValue({ threads: [], unread: 0, readAt: 0 });
    m.markCommentsRead.mockClear();
    await useCommentsStore.getState().refresh();
    expect(m.markCommentsRead).not.toHaveBeenCalled();
    let release!: (v: unknown) => void;
    m.listComments.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const p = useCommentsStore.getState().refresh();
    useCommentsStore.setState({ fileId: 'other' });
    release({ threads: [{ root: c('z'), replies: [] }], unread: 9, readAt: 0 });
    await p;
    expect(useCommentsStore.getState().threads).toEqual([]);
  });
  it('live events: foreign files and unrelated types are ignored; unread grows only for others; open panel marks read', async () => {
    await useCommentsStore.getState().load('f1', null, 'me');
    const s = () => useCommentsStore.getState();
    s().handleMessage({ type: 'something' });
    s().handleMessage({ type: 'comment.created', comment: c('a', { fileId: 'zzz' }) });
    s().handleMessage({ type: 'comment.deleted', commentId: 'a', fileId: 'zzz' });
    expect(s().unread).toBe(0);
    s().handleMessage({ type: 'comment.created', comment: c('a') });
    expect(s().unread).toBe(1);
    s().handleMessage({ type: 'comment.created', comment: c('a') }); // duplicate: no change
    expect(s().unread).toBe(1);
    s().handleMessage({ type: 'comment.created', comment: c('mine', { author: { id: 'me', name: 'Me' } }) });
    expect(s().unread).toBe(1);
    s().handleMessage({ type: 'comment.updated', comment: c('a', { body: 'new' }) });
    expect(s().threads.find((t) => t.root.id === 'a')!.root.body).toBe('new');
    useCommentsStore.setState({ panelOpen: true });
    s().handleMessage({ type: 'comment.created', comment: c('b') });
    expect(m.markCommentsRead).toHaveBeenCalledWith('f1');
    expect(s().unread).toBe(1);
    s().handleMessage({ type: 'comment.deleted', commentId: 'b', fileId: 'f1' });
    expect(s().threads.some((t) => t.root.id === 'b')).toBe(false);
    m.markCommentsRead.mockRejectedValueOnce(new Error('x'));
    s().handleMessage({ type: 'comment.created', comment: c('d') });
    await new Promise((r) => setTimeout(r, 0));
  });
  it('setFilter / setActive / setDraft', () => {
    useCommentsStore.getState().setFilter('mine');
    useCommentsStore.getState().setActive('a');
    useCommentsStore.getState().setDraft({ anchor: { type: 'point', x: 1, y: 2 } });
    expect(useCommentsStore.getState()).toMatchObject({ filter: 'mine', activeId: 'a', draft: { anchor: { x: 1, y: 2 } } });
  });
});

describe('notifications store with the app-wide api', () => {
  const n = (id: string, read = false) => ({ id, read }) as never;
  it('load, push (deduped, capped, unread only for unread), markRead, markAllRead, reset', async () => {
    m.listNotifications.mockResolvedValue({ items: [n('a')], unread: 1 });
    await useNotificationsStore.getState().load();
    expect(m.listNotifications).toHaveBeenCalledWith({ limit: 30 });
    const s = () => useNotificationsStore.getState();
    s().push(n('a'));
    expect(s().items).toHaveLength(1);
    s().push(n('b', true));
    expect(s().unread).toBe(1);
    s().push(n('c'));
    expect(s().unread).toBe(2);
    await s().markRead(['a', 'b', 'nope']);
    expect(s().unread).toBe(1);
    expect(m.markNotificationsRead).toHaveBeenCalledWith({ ids: ['a', 'b', 'nope'] });
    m.markNotificationsRead.mockRejectedValueOnce(new Error('x'));
    await s().markAllRead();
    expect(s().unread).toBe(0);
    expect(s().items.every((i) => i.read)).toBe(true);
    m.markNotificationsRead.mockRejectedValueOnce(new Error('x'));
    await s().markRead(['c']);
    for (let i = 0; i < 60; i++) s().push(n(`p${i}`));
    expect(s().items).toHaveLength(50);
    s().reset();
    expect(s().items).toEqual([]);
  });
});

describe('comments logic', () => {
  it('mention tokens roundtrip and are sanitized', () => {
    const tok = formatMention('A [b] (c)\nd', 'u1');
    expect(tok).toBe('@[A  b   c  d](user:u1)');
    expect(parseMentions(`${tok} and ${tok} @[X](user:u2)`)).toEqual(['u1', 'u2']);
    expect(renderBody(`hi ${tok}!`)).toEqual([{ text: 'hi ' }, { mention: { id: 'u1', name: 'A  b   c  d' } }, { text: '!' }]);
    expect(renderBody(tok)).toEqual([{ mention: { id: 'u1', name: 'A  b   c  d' } }]);
    expect(renderBody('plain')).toEqual([{ text: 'plain' }]);
    expect(renderBody('')).toEqual([]);
  });
  it('activeMentionQuery finds the word being typed and rejects e-mails', () => {
    expect(activeMentionQuery('hi @an', 6)).toEqual({ start: 3, query: 'an' });
    expect(activeMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
    expect(activeMentionQuery('a@b.c', 5)).toBeNull();
    expect(activeMentionQuery('no mention', 4)).toBeNull();
  });
  it('insertMention replaces the typed query and moves the caret', () => {
    const r = insertMention('hi @an there', { start: 3, query: 'an' }, { id: 'u1', name: 'Ann' });
    expect(r.text).toBe('hi @[Ann](user:u1)  there');
    expect(r.caret).toBe(3 + '@[Ann](user:u1) '.length);
  });
  it('mentionCandidates ranks word-prefix, then substring; excludes me and non-matches; caps', () => {
    const ms = [
      { userId: 'a', name: 'Zed Annie', email: 'z@x' }, { userId: 'b', name: 'Joanna', email: 'j@x' }, { userId: 'me', name: 'Ann Me', email: 'm@x' },
      { userId: 'c', name: 'Bob', email: 'ann@mail' }, { userId: 'd', name: 'Nope', email: 'n@x' },
    ];
    expect(mentionCandidates(ms, 'ann', 'me').map((x) => x.userId)).toEqual(['c', 'a', 'b'].sort((p, q) => (p === 'b' ? 1 : q === 'b' ? -1 : 0)));
    expect(mentionCandidates(ms, '', 'me').map((x) => x.userId)).toEqual(['c', 'd', 'b', 'a'].sort((p, q) => ms.find((x) => x.userId === p)!.name.localeCompare(ms.find((x) => x.userId === q)!.name)));
    expect(mentionCandidates(ms, '', null, 2)).toHaveLength(2);
    expect(mentionCandidates(ms, 'zzz', null)).toEqual([]);
  });
  it('applyCommentEvent covers replies, edits and deletes in all positions', () => {
    const root = c('r');
    const reply = c('p', { parentId: 'r', anchor: null });
    let t = applyCommentEvent([], { type: 'comment.created', comment: root });
    expect(applyCommentEvent(t, { type: 'comment.created', comment: root })).toBe(t);
    t = applyCommentEvent(t, { type: 'comment.created', comment: reply });
    expect(applyCommentEvent(t, { type: 'comment.created', comment: reply })).toBe(t);
    expect(applyCommentEvent(t, { type: 'comment.created', comment: c('orphan', { parentId: 'gone' }) })).toBe(t);
    t = applyCommentEvent(t, { type: 'comment.updated', comment: { ...reply, body: 'E' } });
    expect(t[0].replies[0].body).toBe('E');
    t = applyCommentEvent(t, { type: 'comment.updated', comment: { ...root, body: 'R2' } });
    expect(t[0].root.body).toBe('R2');
    expect(applyCommentEvent(t, { type: 'comment.updated', comment: c('unknown') })).toEqual(t);
    expect(applyCommentEvent(t, { type: 'comment.deleted', commentId: 'p' })[0].replies).toEqual([]);
    expect(applyCommentEvent(t, { type: 'comment.deleted', commentId: 'r' })).toEqual([]);
    expect(applyCommentEvent(t, { type: 'comment.deleted', commentId: 'zzz' })).toEqual(t);
  });
  it('filterThreads and threadCount', () => {
    const t = [
      { root: c('1'), replies: [] },
      { root: c('2', { resolved: true, author: { id: 'me', name: 'Me' } }), replies: [] },
      { root: c('3', { mentions: ['me'] }), replies: [c('4', { parentId: '3', author: { id: 'me', name: 'Me' } })] },
      { root: c('5'), replies: [c('6', { parentId: '5', mentions: ['me'] })] },
    ];
    expect(filterThreads(t, 'all', 'me')).toBe(t);
    expect(filterThreads(t, 'open', 'me').map((x) => x.root.id)).toEqual(['1', '3', '5']);
    expect(filterThreads(t, 'resolved', 'me').map((x) => x.root.id)).toEqual(['2']);
    expect(filterThreads(t, 'mine', 'me').map((x) => x.root.id)).toEqual(['2', '3']);
    expect(filterThreads(t, 'mentions', 'me').map((x) => x.root.id)).toEqual(['3', '5']);
    expect(filterThreads(t, 'mentions', null)).toEqual([]);
    expect(threadCount(t)).toBe(6);
  });
  it('anchorPoint: point, node-relative (with parent), and a deleted node', () => {
    const nodes = [{ id: 'p', type: 'group', position: { x: 100, y: 100 }, data: { label: 'p' } }, { id: 'n', type: 'icon', parentId: 'p', position: { x: 10, y: 20 }, data: { label: 'n' } }] as never;
    expect(anchorPoint({ type: 'point', x: 1, y: 2 }, nodes)).toEqual({ x: 1, y: 2 });
    expect(anchorPoint({ type: 'node', nodeId: 'n', dx: 5, dy: 6 } as never, nodes)).toEqual({ x: 115, y: 126 });
    expect(anchorPoint({ type: 'node', nodeId: 'gone', dx: 0, dy: 0 } as never, nodes)).toBeNull();
  });
});
