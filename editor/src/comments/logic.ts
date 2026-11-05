import type { ApiComment, CommentAnchor, CommentThread } from '../api/types';
import { absolutePosition } from '../lib/graph';
import type { DiagramNode } from '../types';

// ---------- mentions (token format shared with the server: @[Display Name](user:<id>)) ----------
const MENTION = /@\[([^\]]{1,100})\]\(user:([A-Za-z0-9_-]{1,64})\)/g;
export const formatMention = (name: string, userId: string): string => `@[${name.replace(/[\[\]()\n\r]/g, ' ').slice(0, 100)}](user:${userId})`;
export function parseMentions(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MENTION)) if (!out.includes(m[2])) out.push(m[2]);
  return out;
}

/** the "@word" being typed at the caret (null: not typing a mention; an e-mail address is not one) */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|[\s(])@([^\s@\]\[()]*)$/.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}
export function insertMention(text: string, q: { start: number; query: string }, user: { id: string; name: string }): { text: string; caret: number } {
  const token = `${formatMention(user.name, user.id)} `;
  const end = q.start + 1 + q.query.length;
  return { text: text.slice(0, q.start) + token + text.slice(end), caret: q.start + token.length };
}

export interface MemberLike {
  userId: string;
  name: string;
  email: string;
}
/** members for the @-autocomplete: a match at the start of a word of the name (or of the e-mail) first, then anywhere; never me */
export function mentionCandidates<T extends MemberLike>(members: T[], query: string, meId: string | null, max = 6): T[] {
  const q = query.trim().toLowerCase();
  const rank = (m: T): number => {
    if (!q) return 0;
    const name = m.name.toLowerCase();
    if (name.split(/\s+/).some((w) => w.startsWith(q)) || m.email.toLowerCase().startsWith(q)) return 0;
    return name.includes(q) || m.email.toLowerCase().includes(q) ? 1 : 2;
  };
  return members
    .filter((m) => m.userId !== meId && rank(m) < 2)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, max);
}

export type BodyPart = { text: string } | { mention: { id: string; name: string } };
export function renderBody(body: string): BodyPart[] {
  const out: BodyPart[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index) });
    out.push({ mention: { id: m[2], name: m[1] } });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

// ---------- thread list ----------
export type CommentEvent =
  | { type: 'comment.created'; comment: ApiComment }
  | { type: 'comment.updated'; comment: ApiComment }
  | { type: 'comment.deleted'; commentId: string };

export function applyCommentEvent(threads: CommentThread[], e: CommentEvent): CommentThread[] {
  if (e.type === 'comment.created') {
    const c = e.comment;
    if (c.parentId === null) return threads.some((t) => t.root.id === c.id) ? threads : [...threads, { root: c, replies: [] }];
    const t = threads.find((x) => x.root.id === c.parentId);
    if (!t || t.replies.some((r) => r.id === c.id)) return threads;
    return threads.map((x) => (x === t ? { ...x, replies: [...x.replies, c] } : x));
  }
  if (e.type === 'comment.updated') {
    const c = e.comment;
    return threads.map((t) => (t.root.id === c.id ? { ...t, root: c } : t.replies.some((r) => r.id === c.id) ? { ...t, replies: t.replies.map((r) => (r.id === c.id ? c : r)) } : t));
  }
  return threads.filter((t) => t.root.id !== e.commentId).map((t) => (t.replies.some((r) => r.id === e.commentId) ? { ...t, replies: t.replies.filter((r) => r.id !== e.commentId) } : t));
}

export type CommentFilter = 'all' | 'open' | 'resolved' | 'mine' | 'mentions';
export function filterThreads(threads: CommentThread[], f: CommentFilter, meId: string | null): CommentThread[] {
  switch (f) {
    case 'all': return threads;
    case 'open': return threads.filter((t) => !t.root.resolved);
    case 'resolved': return threads.filter((t) => t.root.resolved);
    case 'mine': return threads.filter((t) => t.root.author.id === meId || t.replies.some((r) => r.author.id === meId));
    case 'mentions': return threads.filter((t) => !!meId && (t.root.mentions.includes(meId) || t.replies.some((r) => r.mentions.includes(meId))));
  }
}
export const threadCount = (threads: CommentThread[]): number => threads.reduce((n, t) => n + 1 + t.replies.length, 0);

/** where a pin is drawn (flow coordinates). A node anchor follows the node; null when that node is gone */
export function anchorPoint(a: CommentAnchor, nodes: DiagramNode[]): { x: number; y: number } | null {
  if (a.type === 'point') return { x: a.x, y: a.y };
  const n = nodes.find((x) => x.id === a.nodeId);
  if (!n) return null;
  const p = absolutePosition(nodes, n);
  return { x: p.x + a.dx, y: p.y + a.dy };
}
