import { describe, expect, it } from 'vitest';
import { applyDsl, pageToDsl } from '@core/dsl';
import type { DiagramEdge, DiagramNode } from '../../types';
import { validateDiagram } from '../serialization';
import { objectModelToDiagram } from '../object/convert';
import { sequenceNode } from '../seq/node';
import type { SequenceModel } from '../seq/types';
import { addMessage, collect, compareSeq, messageLabel, messagesOfLink, moveMessage, parseMessageLine, removeMessage, renumber, shiftMessage, updateMessage } from './messages';
import { communicationToSequence, sequenceToCommunication } from './convert';

const base = () => objectModelToDiagram({
  objects: [{ id: 'a', name: 'a', slots: [] }, { id: 'b', name: 'b', slots: [] }, { id: 'c', name: 'c', slots: [] }],
  links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
});
const seqs = (edges: DiagramEdge[]) => collect(edges).map((p) => `${p.m.seq}:${p.m.text}`);

describe('numbered messages on links', () => {
  it('compares dotted numbers numerically', () => {
    expect(['10', '2', '1.2', '1', '1.10', '1.1'].sort(compareSeq)).toEqual(['1', '1.1', '1.2', '1.10', '2', '10']);
  });

  it('adds messages in order, derives the link text, keeps the markers of the link', () => {
    let es = base().edges;
    es = addMessage(es, es[0].id, { text: 'login()' }).edges;
    es = addMessage(es, es[1].id, { text: 'check()', dir: 'back' }).edges;
    es = addMessage(es, es[0].id, { text: 'log()', async: true }).edges;
    expect(seqs(es)).toEqual(['1:login()', '2:check()', '3:log()']);
    expect(es[0].label).toBe('1: login() →\n3: log() ⇢');
    expect(es[1].label).toBe('2: check() ←');
    expect(es[0].data?.uml?.kind).toBe('link');
  });

  it('nesting, moving, renumbering and removing keep 1, 1.1, 2 consistent', () => {
    let es = base().edges;
    const ids: string[] = [];
    for (const t of ['one', 'two', 'three', 'four']) { const r = addMessage(es, es[0].id, { text: t }); es = r.edges; ids.push(r.id); }
    es = shiftMessage(es, ids[1], 1);
    expect(seqs(es)).toEqual(['1:one', '1.1:two', '2:three', '3:four']);
    es = shiftMessage(es, ids[2], 1);
    expect(seqs(es)).toEqual(['1:one', '1.1:two', '1.2:three', '2:four']);
    es = moveMessage(es, ids[2], -1);
    expect(seqs(es)).toEqual(['1:one', '1.1:three', '1.2:two', '2:four']);
    es = moveMessage(es, ids[0], 1);
    expect(seqs(es)).toEqual(['1:four', '2:one', '2.1:three', '2.2:two']);
    es = removeMessage(es, ids[0]);
    expect(seqs(es)).toEqual(['1:four', '2:three', '3:two']); // its sub-messages moved up a level
    es = shiftMessage(es, ids[1], -1);
    expect(seqs(es)).toEqual(['1:four', '2:three', '3:two']);
    // a hand-edited hole (1, 5, 5.2) is closed by Renumber
    const holey = es.map((e) => ({ ...e, data: { ...e.data, uml: { ...e.data!.uml!, messages: messagesOfLink(es, e.id).map((m, i) => ({ ...m, seq: ['1', '5', '5.2'][i % 3] })) } } })) as DiagramEdge[];
    expect(seqs(renumber(holey)).map((s) => s.split(':')[0])).toEqual(['1', '2', '2.1']);
  });

  it('edits text, direction and the async flag without renumbering', () => {
    let es = base().edges;
    const r = addMessage(es, es[0].id, { text: 'x' });
    es = updateMessage(r.edges, r.id, { text: 'y', dir: 'back', async: true });
    expect(es[0].label).toBe('1: y ⇠');
    es = updateMessage(es, r.id, { async: false });
    expect(messagesOfLink(es, es[0].id)[0].async).toBeUndefined();
  });

  it('parses label lines: plain, back and async marks', () => {
    expect(parseMessageLine('1.1: check() >')).toEqual({ seq: '1.1', text: 'check()', dir: 'fwd' });
    expect(parseMessageLine('2: ping <<')).toEqual({ seq: '2', text: 'ping', dir: 'back', async: true });
    expect(parseMessageLine('owns')).toBeUndefined();
    expect(messageLabel({ id: 'm', seq: '3', text: '', dir: 'fwd' })).toBe('3: →');
  });

  it('validateDiagram accepts messages and rejects a bad number', () => {
    const d = base();
    const es = addMessage(d.edges, d.edges[0].id, { text: 'go()' }).edges;
    expect(validateDiagram({ version: 1, nodes: d.nodes, edges: es }).ok).toBe(true);
    const bad = es.map((e, i) => (i ? e : { ...e, data: { ...e.data, uml: { ...e.data!.uml, messages: [{ id: 'm', seq: 'x.1', text: 'a', dir: 'fwd' }] } } })) as DiagramEdge[];
    expect(validateDiagram({ version: 1, nodes: d.nodes, edges: bad })).toMatchObject({ ok: false, error: expect.stringContaining('messages[0]') });
  });
});

describe('sequence <-> communication', () => {
  const model: SequenceModel = {
    autonumber: false,
    participants: [{ id: 'u', name: 'User', kind: 'actor' }, { id: 'w', name: 'Web', kind: 'participant' }, { id: 's', name: 'Svc', kind: 'participant' }],
    items: [
      { type: 'message', id: 'm1', from: 'u', to: 'w', text: 'click', kind: 'sync' },
      { type: 'message', id: 'm2', from: 'w', to: 's', text: 'call', kind: 'async' },
      { type: 'fragment', id: 'f1', op: 'alt', sections: [{ id: 's1', guard: 'ok', items: [{ type: 'message', id: 'm3', from: 's', to: 'w', text: 'ok', kind: 'return' }] }, { id: 's2', guard: 'else', items: [{ type: 'message', id: 'm4', from: 's', to: 'w', text: 'fail', kind: 'return' }] }] },
      { type: 'note', id: 'n1', text: 'hi', over: ['w'] },
      { type: 'message', id: 'm5', from: 'w', to: 'u', text: 'page', kind: 'return' },
    ],
  };
  const seq = sequenceNode('seq', { x: 0, y: 0 }, model, 'Flow');

  it('lifelines become objects, messages are numbered in order on the links, and the lossy parts are reported', () => {
    const r = sequenceToCommunication(seq);
    expect(r.diagram.nodes.map((n) => n.data.label)).toEqual(['User', 'Web', 'Svc']);
    expect(seqs(r.diagram.edges)).toEqual(['1:click', '2:call', '3:ok', '4:fail', '5:page']);
    expect(r.diagram.edges).toHaveLength(2);
    expect(r.lossy.join('|')).toMatch(/1 fragment .*flattened/);
    expect(r.lossy.join('|')).toMatch(/1 note dropped/);
    expect(r.lossy.join('|')).toMatch(/3 return messages/);
    expect(r.lossy.join('|')).toMatch(/actor/);
    expect(validateDiagram({ version: 1, nodes: r.diagram.nodes, edges: r.diagram.edges }).ok).toBe(true);
  });

  it('and back: order, directions and async survive; nesting and slots are reported', () => {
    const c = sequenceToCommunication(seq).diagram;
    const back = communicationToSequence(c.nodes, c.edges, 'Flow2');
    const d = back.node.data as unknown as SequenceModel;
    expect(d.participants.map((p) => p.name)).toEqual(['User', 'Web', 'Svc']);
    const msgs = d.items.map((i) => (i.type === 'message' ? `${i.from === 'u' ? 'u' : i.from}>${i.to}:${i.text}:${i.kind}` : ''));
    expect(msgs.length).toBe(5);
    expect(d.items.map((i) => (i.type === 'message' ? i.text : ''))).toEqual(['click', 'call', 'ok', 'fail', 'page']);
    expect(d.items.filter((i) => i.type === 'message' && i.kind === 'async')).toHaveLength(4);
    const nested = c.edges.map((e, i) => (i ? e : { ...e, data: { ...e.data, uml: { ...e.data!.uml!, messages: e.data!.uml!.messages!.map((m, k) => (k ? { ...m, seq: '1.1' } : m)) } } })) as DiagramEdge[];
    expect(communicationToSequence(c.nodes, nested).lossy.join('|')).toMatch(/nested number/);
    expect(back.lossy.join('|')).not.toMatch(/nested/);
  });
});

describe('.sdd communication block', () => {
  const TEXT = `communication {
  object user "user" class=Customer
  object web "web" class=WebApp
  object auth
  user -- web srcRole=caller
  1 user -> web "login(pw)"
  2 web -> auth "authenticate()"
  2.1 auth -> web "audit()" async
  3 auth -> web "token"
}
`;
  const build = (t: string, page?: Parameters<typeof applyDsl>[0]) => applyDsl(page, t, { layout: false });

  it('builds links with numbered messages (declared on first use) and prints the same text back', () => {
    const r = build(TEXT);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.page.nodes.map((n) => n.id)).toEqual(['user', 'web', 'auth']);
    expect(r.page.edges).toHaveLength(2);
    const ua = r.page.edges.find((e) => e.source === 'user')!;
    expect(ua.data!.uml).toMatchObject({ kind: 'link', sourceRole: 'caller', messages: [{ seq: '1', text: 'login(pw)', dir: 'fwd' }] });
    const wa = r.page.edges.find((e) => e.source === 'web')!;
    expect(wa.data!.uml.messages.map((m: any) => [m.seq, m.dir, !!m.async])).toEqual([['2', 'fwd', false], ['2.1', 'back', true], ['3', 'back', false]]);
    expect(wa.label).toBe('2: authenticate() →\n2.1: audit() ⇠\n3: token ←');
    expect(pageToDsl(r.page)).toBe(`#!sdd 1
diagram "Page 1"

communication {
  object user class=Customer
  object web class=WebApp
  object auth

  user -- web srcRole=caller

  1 user -> web "login(pw)"
  2 web -> auth "authenticate()"
  2.1 auth -> web "audit()" async
  3 auth -> web "token"
}
`);
    const again = build(pageToDsl(r.page), r.page);
    expect(pageToDsl(again.page)).toBe(pageToDsl(r.page));
    expect(again.removed).toEqual([]);
  });

  it('reports unknown objects and a bad message', () => {
    const msgs = build('communication {\n  object a\n  1 a -> ghost "x"\n  2 a ~> a\n}\n').diagnostics.map((d) => d.message);
    expect(msgs).toEqual(expect.arrayContaining(['unknown object "ghost"']));
    expect(msgs.some((m) => m.includes('unknown statement'))).toBe(true);
  });

  it('removing a message from the text removes it from the link (and the label)', () => {
    const r = build(TEXT);
    const r2 = build(TEXT.replace(/^ {2}3 auth.*\n/m, '').replace(/^ {2}2\.1.*\n/m, ''), r.page);
    const wa = r2.page.edges.find((e) => e.source === 'web')!;
    expect(wa.data!.uml.messages).toHaveLength(1);
    expect(wa.label).toBe('2: authenticate() →');
    const none = build('communication {\n  object user\n  object web\n  user -- web "owns"\n}\n', r2.page);
    expect(none.page.edges.find((e) => e.source === 'user')!.data!.uml.messages).toBeUndefined();
    expect(pageToDsl(none.page)).toContain('objects {');
  });

  it('a page made in the editor prints as a communication block', () => {
    const d = base();
    const es = addMessage(addMessage(d.edges, d.edges[0].id, { text: 'go()' }).edges, d.edges[1].id, { text: 'run()', async: true }).edges;
    const text = pageToDsl({ id: 'p', name: 'P', nodes: d.nodes as unknown as DiagramNode[], edges: es } as never);
    expect(text).toContain('communication {');
    expect(text).toMatch(/1 ob1 -> ob2 "go\(\)"/);
    expect(text).toMatch(/2 ob2 -> ob3 "run\(\)" async/);
  });
});
