import { describe, expect, it } from 'vitest';
import type { DiagramEdge } from '../../types';
import { objectModelToDiagram } from '../object/convert';
import { umlEdge } from '../uml/edges';
import { addMessage, assignSeq, collect, compareSeq, hasMessages, isSeq, linkLabel, messageLabel, messagesOf, messagesOfLink, moveMessage, parseMessageLine, removeMessage, renumber, seqParts, shiftMessage, updateMessage } from './messages';

const base = (): DiagramEdge[] => objectModelToDiagram({
  objects: [{ id: 'a', name: 'a', slots: [] }, { id: 'b', name: 'b', slots: [] }],
  links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
}).edges;
const seqs = (es: DiagramEdge[]) => collect(es).map((p) => `${p.m.seq}:${p.m.text}`);
const msg = (id: string, seq: string, text = id) => ({ id, seq, text, dir: 'fwd' as const });

describe('seq helpers', () => {
  it('isSeq / seqParts', () => {
    expect(isSeq('1.2.3')).toBe(true);
    expect(isSeq('1.')).toBe(false);
    expect(isSeq('x')).toBe(false);
    expect(seqParts('1.2')).toEqual([1, 2]);
    expect(seqParts('bad')).toEqual([]);
  });
  it('compareSeq equal and prefix', () => {
    expect(compareSeq('1.1', '1.1')).toBe(0);
    expect(compareSeq('1', '1.1')).toBeLessThan(0);
  });
  it('messagesOf empty for plain edge', () => {
    expect(messagesOf({ id: 'x', source: 'a', target: 'b' } as DiagramEdge)).toEqual([]);
  });
  it('messageLabel arrows and empty text', () => {
    expect(messageLabel({ id: 'x', seq: '1', text: 'go()', dir: 'fwd' })).toBe('1: go() →');
    expect(messageLabel({ id: 'x', seq: '1', text: 'go()', dir: 'back' })).toBe('1: go() ←');
    expect(messageLabel({ id: 'x', seq: '2', text: 'go()', dir: 'fwd', async: true })).toBe('2: go() ⇢');
    expect(messageLabel({ id: 'x', seq: '2', text: 'go()', dir: 'back', async: true })).toBe('2: go() ⇠');
    expect(messageLabel({ id: 'x', seq: '3', text: '', dir: 'fwd' })).toBe('3: →');
  });
  it('linkLabel falls back to name', () => {
    expect(linkLabel([], 'owns')).toBe('owns');
    expect(linkLabel([], '')).toBeUndefined();
    expect(linkLabel([], undefined)).toBeUndefined();
    expect(linkLabel([msg('a', '1', 'x'), msg('b', '2', 'y')])).toBe('1: x →\n2: y →');
  });
});

describe('assignSeq', () => {
  it('clamps depth so gaps close', () => {
    const list = ['a', 'b', 'c'].map((id) => ({ edgeId: 'e', m: msg(id, '1') }));
    expect(assignSeq(list, [1, 3, 2]).map((p) => p.m.seq)).toEqual(['1', '1.1', '1.2']);
  });
});

describe('write branches', () => {
  it('skips non-link and plain edges, drops label when messages gone', () => {
    const rel = umlEdge('r', 'a', 'b', { kind: 'association' });
    const plain = { id: 'p', source: 'a', target: 'b' } as DiagramEdge;
    const link = umlEdge('l', 'a', 'b', { kind: 'link' });
    const es = [rel, plain, link];
    const r = renumber(es);
    expect(r[0]).toBe(rel);
    expect(r[1]).toBe(plain);
    expect(r[2]).toBe(link);
    const { edges, id } = addMessage(es, 'l', { text: 'x' });
    expect(edges[2].label).toBe('1: x →');
    expect(edges[0]).toBe(rel);
    const gone = removeMessage(edges, id);
    expect((gone[2].data as any).uml.messages).toBeUndefined();
    expect(gone[2].label).toBeUndefined();
    expect(hasMessages(gone)).toBe(false);
    expect(hasMessages(edges)).toBe(true);
  });
  it('edge with a message-free messages array is rewritten', () => {
    const e = umlEdge('l', 'a', 'b', { kind: 'link', messages: [] });
    const r = renumber([e]);
    expect((r[0].data as any).uml.messages).toBeUndefined();
  });
});

describe('addMessage', () => {
  it('after a sibling inserts after its block; defaults', () => {
    let es = base();
    es = addMessage(es, es[0].id).edges;
    expect(messagesOfLink(es, es[0].id)[0]).toMatchObject({ text: 'message()', dir: 'fwd' });
    es = addMessage(es, es[0].id, { text: 'two' }).edges;
    const first = collect(es)[0].m.id;
    es = shiftMessage(es, collect(es)[1].m.id, 1);
    expect(seqs(es)).toEqual(['1:message()', '1.1:two']);
    const r = addMessage(es, es[1].id, { text: 'sib', after: first, async: true });
    expect(seqs(r.edges)).toEqual(['1:message()', '1.1:two', '2:sib']);
    expect(collect(r.edges)[2].m.async).toBe(true);
  });
  it('unknown after appends at end', () => {
    let es = addMessage(base(), 'oe1', { text: 'a' }).edges;
    es = addMessage(es, 'oe1', { text: 'b', after: 'nope' }).edges;
    expect(seqs(es)).toEqual(['1:a', '2:b']);
  });
  it('generated ids skip used ones', () => {
    let es = base();
    const ids = new Set<string>();
    for (let i = 0; i < 4; i++) { const r = addMessage(es, es[0].id); es = r.edges; ids.add(r.id); }
    expect(ids.size).toBe(4);
  });
});

describe('updateMessage', () => {
  it('clears async when false, keeps it when true, ignores unknown', () => {
    let es = base();
    const { edges, id } = addMessage(es, es[0].id, { async: true });
    es = updateMessage(edges, id, { text: 'z', dir: 'back' });
    expect(collect(es)[0].m).toMatchObject({ text: 'z', dir: 'back', async: true });
    es = updateMessage(es, id, { async: false });
    expect('async' in collect(es)[0].m).toBe(false);
    expect(seqs(updateMessage(es, 'nope', { text: 'q' }))).toEqual(seqs(es));
  });
});

describe('remove/move/shift edge cases', () => {
  const mk = () => {
    let es = base();
    for (const t of ['a', 'b', 'c']) es = addMessage(es, es[0].id, { text: t }).edges;
    return es;
  };
  it('unknown ids return same edges', () => {
    const es = mk();
    expect(removeMessage(es, 'nope')).toBe(es);
    expect(moveMessage(es, 'nope', 1)).toBe(es);
    expect(shiftMessage(es, 'nope', 1)).toBe(es);
  });
  it('remove promotes children', () => {
    let es = mk();
    es = shiftMessage(es, collect(es)[1].m.id, 1);
    es = removeMessage(es, collect(es)[0].m.id);
    expect(seqs(es)).toEqual(['1:b', '2:c']);
  });
  it('move up/down swap blocks, bounds are no-ops', () => {
    const es = mk();
    const [a, b, c] = collect(es).map((p) => p.m.id);
    expect(moveMessage(es, a, -1)).toBe(es);
    expect(moveMessage(es, c, 1)).toBe(es);
    expect(seqs(moveMessage(es, b, -1))).toEqual(['1:b', '2:a', '3:c']);
    expect(seqs(moveMessage(es, a, 1))).toEqual(['1:b', '2:a', '3:c']);
  });
  it('move across a different depth is a no-op', () => {
    let es = mk();
    const [, b, c] = collect(es).map((p) => p.m.id);
    es = shiftMessage(es, c, 1); // a, b, b.1=c
    expect(moveMessage(es, c, -1)).toBe(es);
    expect(moveMessage(es, b, 1)).toBe(es);
  });
  it('move up skips deeper blocks', () => {
    let es = mk();
    const [a, b, c] = collect(es).map((p) => p.m.id);
    es = shiftMessage(es, b, 1); // a, a.1=b, c
    expect(seqs(moveMessage(es, c, -1))).toEqual(['1:c', '2:a', '2.1:b']);
    expect(a).toBeTruthy();
  });
  it('move down with sub-messages in next block', () => {
    let es = mk();
    const [a, , c] = collect(es).map((p) => p.m.id);
    es = shiftMessage(es, c, 1);
    es = shiftMessage(es, collect(es)[1].m.id, 0 as any);
    expect(seqs(moveMessage(addMessage(es, es[0].id, { text: 'd' }).edges, a, 1)).length).toBe(4);
  });
  it('shift bounds', () => {
    const es = mk();
    const [a, b] = collect(es).map((p) => p.m.id);
    expect(shiftMessage(es, a, 1)).toBe(es);
    expect(shiftMessage(es, b, -1)).toBe(es);
    const deeper = shiftMessage(es, b, 1);
    expect(seqs(deeper)).toEqual(['1:a', '1.1:b', '2:c']);
    expect(seqs(shiftMessage(deeper, b, -1))).toEqual(['1:a', '2:b', '3:c']);
  });
});

describe('parseMessageLine', () => {
  it('marks and fallbacks', () => {
    expect(parseMessageLine('1.1: check() >')).toEqual({ seq: '1.1', text: 'check()', dir: 'fwd' });
    expect(parseMessageLine('2 go <<')).toEqual({ seq: '2', text: 'go', dir: 'back', async: true });
    expect(parseMessageLine('3: x ⇢')).toMatchObject({ dir: 'fwd', async: true });
    expect(parseMessageLine('3: x ⇠')).toMatchObject({ dir: 'back', async: true });
    expect(parseMessageLine('3: x ←')).toMatchObject({ dir: 'back' });
    expect(parseMessageLine('3: x >>')).toMatchObject({ dir: 'fwd', async: true });
    expect(parseMessageLine('4:text')).toMatchObject({ seq: '4', text: 'text', dir: 'fwd' });
    expect(parseMessageLine('nope')).toBeUndefined();
  });
});
