import { describe, expect, it } from 'vitest';
import type { ApiComment, CommentThread } from '../api/types';
import type { DiagramNode } from '../types';
import { activeMentionQuery, anchorPoint, applyCommentEvent, filterThreads, formatMention, insertMention, mentionCandidates, parseMentions, renderBody, threadCount } from './logic';

const c = (id: string, extra: Partial<ApiComment> = {}): ApiComment => ({
  id, fileId: 'f', parentId: null, author: { id: 'u_a', name: 'Ann' }, body: `body ${id}`, anchor: { type: 'point', x: 1, y: 2 },
  resolved: false, resolvedAt: null, resolvedBy: null, mentions: [], createdAt: 1, updatedAt: 1, ...extra,
});
const thread = (id: string, replies: ApiComment[] = [], extra: Partial<ApiComment> = {}): CommentThread => ({ root: c(id, extra), replies });

describe('mentions', () => {
  it('formatMention / parseMentions match the server (token @[Name](user:id))', () => {
    expect(formatMention('Bob B', 'usr_b')).toBe('@[Bob B](user:usr_b)');
    expect(formatMention('A ] B', 'usr_a')).toBe('@[A   B](user:usr_a)');
    expect(parseMentions(`hi ${formatMention('Bob', 'usr_b')} ${formatMention('Bob', 'usr_b')} @plain`)).toEqual(['usr_b']);
  });
  it('activeMentionQuery finds the @word being typed at the caret', () => {
    expect(activeMentionQuery('hello @bo', 9)).toEqual({ start: 6, query: 'bo' });
    expect(activeMentionQuery('hello @', 7)).toEqual({ start: 6, query: '' });
    expect(activeMentionQuery('mail a@b.co', 11)).toBeNull(); // an e-mail address is not a mention
    expect(activeMentionQuery('hello @bo and more', 18)).toBeNull(); // caret is past the word
    expect(activeMentionQuery('@a', 2)).toEqual({ start: 0, query: 'a' });
    expect(activeMentionQuery('x @bo', 2)).toBeNull();
  });
  it('insertMention replaces the typed @query with the token and a space, returning the new caret', () => {
    const r = insertMention('hello @bo!', { start: 6, query: 'bo' }, { id: 'usr_b', name: 'Bob' });
    expect(r.text).toBe('hello @[Bob](user:usr_b) !');
    expect(r.caret).toBe('hello @[Bob](user:usr_b) '.length);
  });
  it('mentionCandidates: members matching the query (name / e-mail prefix), excluding me, best first, max 6', () => {
    const members = [
      { userId: 'a', name: 'Ann Lee', email: 'ann@x.y' }, { userId: 'b', name: 'Bob Stone', email: 'bob@x.y' }, { userId: 'me', name: 'Mia', email: 'mia@x.y' },
      { userId: 'd', name: 'Dan Bobbit', email: 'dan@x.y' },
    ];
    expect(mentionCandidates(members, 'bo', 'me').map((m) => m.userId)).toEqual(['b', 'd']); // prefix of a word first, then contains
    expect(mentionCandidates(members, '', 'me').map((m) => m.userId)).toEqual(['a', 'b', 'd']);
    expect(mentionCandidates(members, 'mia', 'me')).toEqual([]);
  });
  it('renderBody splits a body into text and mention chips (the chip keeps the user id)', () => {
    expect(renderBody(`Hi ${formatMention('Bob', 'usr_b')}, see this`)).toEqual([{ text: 'Hi ' }, { mention: { id: 'usr_b', name: 'Bob' } }, { text: ', see this' }]);
    expect(renderBody('plain')).toEqual([{ text: 'plain' }]);
  });
});

describe('applyCommentEvent (WebSocket pushes into the thread list)', () => {
  it('created: a new thread appends, a reply joins its thread, duplicates are ignored', () => {
    let t: CommentThread[] = [];
    t = applyCommentEvent(t, { type: 'comment.created', comment: c('r1') });
    expect(t.map((x) => x.root.id)).toEqual(['r1']);
    t = applyCommentEvent(t, { type: 'comment.created', comment: c('p1', { parentId: 'r1', anchor: null }) });
    expect(t[0].replies.map((x) => x.id)).toEqual(['p1']);
    expect(applyCommentEvent(t, { type: 'comment.created', comment: c('p1', { parentId: 'r1', anchor: null }) })[0].replies).toHaveLength(1);
    expect(applyCommentEvent(t, { type: 'comment.created', comment: c('x', { parentId: 'unknown', anchor: null }) })).toEqual(t); // orphan: ignored
  });
  it('updated: replaces the comment wherever it is (resolve, edit)', () => {
    let t = [thread('r1', [c('p1', { parentId: 'r1', anchor: null })])];
    t = applyCommentEvent(t, { type: 'comment.updated', comment: c('r1', { resolved: true }) });
    expect(t[0].root.resolved).toBe(true);
    t = applyCommentEvent(t, { type: 'comment.updated', comment: c('p1', { parentId: 'r1', anchor: null, body: 'edited' }) });
    expect(t[0].replies[0].body).toBe('edited');
  });
  it('deleted: a root takes its replies with it, a reply leaves the thread', () => {
    const t = [thread('r1', [c('p1', { parentId: 'r1', anchor: null })]), thread('r2')];
    expect(applyCommentEvent(t, { type: 'comment.deleted', commentId: 'p1' })[0].replies).toEqual([]);
    expect(applyCommentEvent(t, { type: 'comment.deleted', commentId: 'r1' }).map((x) => x.root.id)).toEqual(['r2']);
  });
});

describe('filterThreads / threadCount', () => {
  const ts = [
    thread('open-mine', [], { author: { id: 'me', name: 'Me' } }),
    thread('open-other'),
    thread('done', [], { resolved: true }),
    thread('mention', [], { mentions: ['me'] }),
    thread('reply-mention', [c('p', { parentId: 'reply-mention', anchor: null, mentions: ['me'] })]),
  ];
  it('all / open / resolved / mine / mentions', () => {
    const ids = (f: Parameters<typeof filterThreads>[1]) => filterThreads(ts, f, 'me').map((t) => t.root.id);
    expect(ids('all')).toHaveLength(5);
    expect(ids('open')).toEqual(['open-mine', 'open-other', 'mention', 'reply-mention']);
    expect(ids('resolved')).toEqual(['done']);
    expect(ids('mine')).toEqual(['open-mine']);
    expect(ids('mentions')).toEqual(['mention', 'reply-mention']);
  });
  it('threadCount counts every comment', () => {
    expect(threadCount(ts)).toBe(6);
  });
});

describe('anchorPoint: where a pin is drawn', () => {
  const n = (id: string, x: number, y: number, parentId?: string): DiagramNode => ({ id, type: 'icon', position: { x, y }, parentId, data: { label: id } }) as DiagramNode;
  it('a point anchor is the point itself', () => {
    expect(anchorPoint({ type: 'point', x: 5, y: 6 }, [])).toEqual({ x: 5, y: 6 });
  });
  it('a node anchor follows the node (absolute position incl. its group) and keeps its offset', () => {
    const nodes = [n('g', 100, 100), n('a', 10, 20, 'g')];
    expect(anchorPoint({ type: 'node', nodeId: 'a', dx: 4, dy: -6 }, nodes)).toEqual({ x: 114, y: 114 });
    const moved = [n('g', 300, 0), n('a', 10, 20, 'g')];
    expect(anchorPoint({ type: 'node', nodeId: 'a', dx: 4, dy: -6 }, moved)).toEqual({ x: 314, y: 14 });
  });
  it('a node that no longer exists: null (the comment is shown as detached)', () => {
    expect(anchorPoint({ type: 'node', nodeId: 'gone', dx: 0, dy: 0 }, [n('a', 0, 0)])).toBeNull();
  });
});
