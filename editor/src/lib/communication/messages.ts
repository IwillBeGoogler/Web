import type { DiagramEdge } from '../../types';
import { umlOf } from '../uml/edges';
import type { UmlRelationData } from '../uml/types';
import type { CommMessage } from './types';

export type { CommMessage } from './types';

export const isSeq = (s: string): boolean => /^\d+(\.\d+)*$/.test(s);
export const seqParts = (s: string): number[] => (isSeq(s) ? s.split('.').map(Number) : []);
/** numeric, segment by segment: 1 < 1.1 < 1.2 < 2 < 10 */
export function compareSeq(a: string, b: string): number {
  const x = seqParts(a), y = seqParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

export const messagesOf = (e: DiagramEdge): CommMessage[] => umlOf(e)?.messages ?? [];
const ARROW = { fwd: '→', back: '←' } as const;
const ASYNC_ARROW = { fwd: '⇢', back: '⇠' } as const;
/** `1.1: check() →` as drawn on the link */
export const messageLabel = (m: CommMessage): string => `${m.seq}: ${m.text}${m.text ? ' ' : ''}${(m.async ? ASYNC_ARROW : ARROW)[m.dir]}`;
/** text of a link: its messages, one per line, or the plain association name when it has none */
export const linkLabel = (msgs: CommMessage[], name?: string): string | undefined => (msgs.length ? msgs.map(messageLabel).join('\n') : name || undefined);

export interface Placed { edgeId: string; m: CommMessage }
/** every message of the page in numbering order (ties keep the page order) */
export function collect(edges: DiagramEdge[]): Placed[] {
  const out: Placed[] = [];
  for (const e of edges) for (const m of messagesOf(e)) out.push({ edgeId: e.id, m });
  return out.map((p, i) => ({ p, i })).sort((a, b) => compareSeq(a.p.m.seq, b.p.m.seq) || a.i - b.i).map((x) => x.p);
}

/** write an ordered list back: depth comes from each `seq`, numbers are rebuilt (1, 1.1, 1.2, 2 ...), a gap in depth is closed */
export function assignSeq(list: Placed[], depths: number[]): Placed[] {
  const counters: number[] = [];
  return list.map((p, i) => {
    const d = Math.max(1, Math.min(depths[i], counters.length + 1));
    counters.length = d;
    counters[d - 1] = (counters[d - 1] ?? 0) + 1;
    return { ...p, m: { ...p.m, seq: counters.join('.') } };
  });
}

function write(edges: DiagramEdge[], list: Placed[]): DiagramEdge[] {
  const by = new Map<string, CommMessage[]>();
  for (const p of list) by.set(p.edgeId, [...(by.get(p.edgeId) ?? []), p.m]);
  return edges.map((e) => {
    const u = umlOf(e);
    if (!u || u.kind !== 'link' || (!by.has(e.id) && !u.messages)) return e;
    const msgs = by.get(e.id) ?? [];
    const { messages: _old, ...rest } = u;
    void _old;
    const next: UmlRelationData = msgs.length ? { ...rest, messages: msgs } : rest;
    const { label: _l, ...er } = e;
    void _l;
    const label = linkLabel(msgs);
    return { ...er, ...(label ? { label } : {}), data: { ...(e.data ?? {}), uml: next } } as DiagramEdge;
  });
}

const depthOf = (p: Placed): number => Math.max(1, seqParts(p.m.seq).length);
const apply = (edges: DiagramEdge[], list: Placed[]): DiagramEdge[] => write(edges, assignSeq(list, list.map(depthOf)));

/** renumber every message of the page: consecutive, nested numbers follow the existing order */
export const renumber = (edges: DiagramEdge[]): DiagramEdge[] => apply(edges, collect(edges));

let counter = 0;
const newMsgId = (edges: DiagramEdge[]): string => {
  const used = new Set(edges.flatMap((e) => messagesOf(e).map((m) => m.id)));
  let id: string;
  do id = `m${++counter}`; while (used.has(id));
  return id;
};

/** the block of a message: itself and the deeper messages right after it (its replies / sub-calls) */
function block(list: Placed[], i: number): [number, number] {
  const d = depthOf(list[i]);
  let j = i + 1;
  while (j < list.length && depthOf(list[j]) > d) j++;
  return [i, j];
}

/** add a message to a link: after `after` (as its sibling) or at the end of the numbering */
export function addMessage(edges: DiagramEdge[], edgeId: string, init: { text?: string; dir?: 'fwd' | 'back'; async?: boolean; after?: string } = {}): { edges: DiagramEdge[]; id: string } {
  const list = collect(edges);
  const id = newMsgId(edges);
  const m: CommMessage = { id, seq: '1', text: init.text ?? 'message()', dir: init.dir ?? 'fwd', ...(init.async ? { async: true } : {}) };
  const at = init.after ? list.findIndex((p) => p.m.id === init.after) : -1;
  const depths = list.map(depthOf);
  if (at >= 0) {
    const [, end] = block(list, at);
    list.splice(end, 0, { edgeId, m });
    depths.splice(end, 0, depths[at]);
  } else {
    list.push({ edgeId, m });
    depths.push(1);
  }
  return { edges: write(edges, assignSeq(list, depths)), id };
}

export function updateMessage(edges: DiagramEdge[], msgId: string, patch: Partial<Pick<CommMessage, 'text' | 'dir' | 'async'>>): DiagramEdge[] {
  const list = collect(edges).map((p) => (p.m.id === msgId ? { ...p, m: clean({ ...p.m, ...patch }) } : p));
  return write(edges, list);
}
const clean = (m: CommMessage): CommMessage => { if (!m.async) { const { async: _a, ...r } = m; void _a; return r; } return m; };

/** remove a message; its sub-messages move up one level */
export function removeMessage(edges: DiagramEdge[], msgId: string): DiagramEdge[] {
  const list = collect(edges);
  const i = list.findIndex((p) => p.m.id === msgId);
  if (i < 0) return edges;
  const depths = list.map(depthOf);
  const [s, e] = block(list, i);
  for (let k = s + 1; k < e; k++) depths[k] -= 1;
  list.splice(i, 1);
  depths.splice(i, 1);
  return write(edges, assignSeq(list, depths));
}

/** move a message (with its sub-messages) before the previous / after the next message of the same level */
export function moveMessage(edges: DiagramEdge[], msgId: string, delta: -1 | 1): DiagramEdge[] {
  const list = collect(edges);
  const i = list.findIndex((p) => p.m.id === msgId);
  if (i < 0) return edges;
  const d = depthOf(list[i]);
  const [s, e] = block(list, i);
  if (delta < 0) {
    let k = s - 1;
    while (k >= 0 && depthOf(list[k]) > d) k--;
    if (k < 0 || depthOf(list[k]) < d) return edges;
    const moved = list.splice(s, e - s);
    list.splice(k, 0, ...moved);
  } else {
    if (e >= list.length || depthOf(list[e]) !== d) return edges;
    const [, e2] = block(list, e);
    const nxt = list.splice(e, e2 - e);
    list.splice(s, 0, ...nxt);
  }
  return apply(edges, list);
}

/** one level deeper (becomes a sub-message of the one before) or shallower (1.1 -> 2) */
export function shiftMessage(edges: DiagramEdge[], msgId: string, delta: -1 | 1): DiagramEdge[] {
  const list = collect(edges);
  const i = list.findIndex((p) => p.m.id === msgId);
  if (i < 0) return edges;
  const depths = list.map(depthOf);
  const [s, e] = block(list, i);
  if (delta > 0 && s === 0) return edges;
  if (delta < 0 && depths[i] <= 1) return edges;
  for (let k = s; k < e; k++) depths[k] += delta;
  return write(edges, assignSeq(list, depths));
}

/** the same, as a plain list for an inspector: the messages of one link with their number */
export const messagesOfLink = (edges: DiagramEdge[], edgeId: string): CommMessage[] => collect(edges).filter((p) => p.edgeId === edgeId).map((p) => p.m);
export const hasMessages = (edges: DiagramEdge[]): boolean => edges.some((e) => messagesOf(e).length > 0);

/** parse a PlantUML / free-text label line: `1.1: check() >` (`>` `<` direction, doubled = asynchronous) */
export function parseMessageLine(line: string): Omit<CommMessage, 'id'> | undefined {
  const m = /^\s*(\d+(?:\.\d+)*)\s*[:.)]?\s+(.*?)\s*(>>|<<|>|<|→|←|⇢|⇠)?\s*$/.exec(line) ?? /^\s*(\d+(?:\.\d+)*)\s*:\s*(.*?)\s*(>>|<<|>|<|→|←|⇢|⇠)?\s*$/.exec(line);
  if (!m) return undefined;
  const mark = m[3] ?? '>';
  return { seq: m[1], text: m[2], dir: mark.startsWith('<') || mark === '←' || mark === '⇠' ? 'back' : 'fwd', ...(mark === '>>' || mark === '<<' || mark === '⇢' || mark === '⇠' ? { async: true } : {}) };
}
