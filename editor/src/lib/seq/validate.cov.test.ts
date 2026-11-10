import { describe, expect, it } from 'vitest';
import { validateSequence } from './validate';
import { LOGIN } from './fixtures';
import { blankSequence, isSequenceNode, sequenceNode, sequenceOf, sequenceSize, withSequenceSize, SEQ_ACCENT } from './node';
import { allMessages, emptySequence, idMaker, isFragment, isMessage, isNote, isRef, seqId, walk } from './types';
import { activationMarks, SeqBuilder } from './build';
import { detectSeqFormat, exportSeqText, importSeqText, SEQ_FORMATS } from './io';

const base = () => JSON.parse(JSON.stringify(LOGIN));
const withItems = (items: unknown[], extra: Record<string, unknown> = {}) => ({ ...base(), items, ...extra });
const P = [{ id: 'a', name: 'A', kind: 'actor' }, { id: 'b', name: 'B', kind: 'actor' }];
const mk = (items: unknown[], extra: Record<string, unknown> = {}) => ({ participants: P, items, autonumber: false, ...extra });

describe('validateSequence', () => {
  it('accepts a valid model', () => {
    expect(validateSequence(LOGIN)).toBeUndefined();
  });
  it('rejects bad structure', () => {
    expect(validateSequence({ items: [] })).toMatch(/participants/);
    expect(validateSequence({ participants: [] })).toMatch(/items/);
    expect(validateSequence({ participants: [], items: [], autonumber: 'x' })).toMatch(/autonumber/);
    expect(validateSequence({ participants: [null], items: [] })).toMatch(/needs id/);
    expect(validateSequence({ participants: [{ id: '', name: 'x', kind: 'actor' }], items: [] })).toMatch(/needs id/);
    expect(validateSequence({ participants: [{ id: 'a', name: 'x', kind: 'bad' }], items: [] })).toMatch(/kind/);
    expect(validateSequence({ participants: [{ id: 'a', name: 'x', kind: 'actor', modelId: 3 }], items: [] })).toMatch(/modelId/);
    expect(validateSequence({ participants: [P[0], P[0]], items: [] })).toMatch(/duplicate participant/);
  });
  it('boxes', () => {
    expect(validateSequence(mk([], { boxes: 'x' }))).toMatch(/boxes must/);
    expect(validateSequence(mk([], { boxes: [null] }))).toMatch(/boxes\[0\]/);
    expect(validateSequence(mk([], { boxes: [{ id: 'x', label: 'l', participants: ['zz'] }] }))).toMatch(/boxes\[0\]/);
    expect(validateSequence(mk([], { boxes: [{ id: 'x', label: 'l', participants: ['a'] }] }))).toBeUndefined();
  });
  it('items', () => {
    expect(validateSequence(mk([null]))).toMatch(/needs an id/);
    expect(validateSequence(mk([{ id: '' }]))).toMatch(/needs an id/);
    expect(validateSequence(mk([{ type: 'note', id: 'x', text: '', over: ['a'] }, { type: 'note', id: 'x', text: '', over: ['a'] }]))).toMatch(/duplicate item/);
    const m = (o: object) => ({ type: 'message', id: 'm', from: 'a', to: 'b', text: 't', kind: 'sync', ...o });
    expect(validateSequence(mk([m({})]))).toBeUndefined();
    expect(validateSequence(mk([m({ from: 'z' })]))).toMatch(/unknown participant/);
    expect(validateSequence(mk([m({ to: 3 })]))).toMatch(/unknown participant/);
    expect(validateSequence(mk([m({ text: 3 })]))).toMatch(/text/);
    expect(validateSequence(mk([m({ kind: 'x' })]))).toMatch(/kind/);
    const n = (o: object) => ({ type: 'note', id: 'n', text: 't', over: ['a'], ...o });
    expect(validateSequence(mk([n({})]))).toBeUndefined();
    expect(validateSequence(mk([n({ text: 1 })]))).toMatch(/text/);
    expect(validateSequence(mk([n({ over: [] })]))).toMatch(/over/);
    expect(validateSequence(mk([n({ over: 'a' })]))).toMatch(/over/);
    expect(validateSequence(mk([n({ over: ['a', 'b', 'a'] })]))).toMatch(/over/);
    expect(validateSequence(mk([n({ over: ['q'] })]))).toMatch(/over/);
    expect(validateSequence(mk([n({ ext: 'x' })]))).toMatch(/ext/);
    expect(validateSequence(mk([n({ ext: 'found' })]))).toBeUndefined();
    const r = (o: object) => ({ type: 'ref', id: 'r', text: 't', over: ['a', 'b'], ...o });
    expect(validateSequence(mk([r({})]))).toBeUndefined();
    expect(validateSequence(mk([r({ text: 1 })]))).toMatch(/text/);
    expect(validateSequence(mk([r({ over: [] })]))).toMatch(/over/);
    expect(validateSequence(mk([r({ over: ['q'] })]))).toMatch(/over/);
    expect(validateSequence(mk([{ type: 'weird', id: 'w' }]))).toMatch(/type must/);
  });
  it('fragments', () => {
    const f = (o: object) => ({ type: 'fragment', id: 'f', op: 'alt', sections: [{ id: 's', guard: 'g', items: [] }], ...o });
    expect(validateSequence(mk([f({})]))).toBeUndefined();
    expect(validateSequence(mk([f({ op: 'zzz' })]))).toMatch(/op must/);
    expect(validateSequence(mk([f({ sections: 'x' })]))).toMatch(/sections must/);
    expect(validateSequence(mk([f({ sections: [null] })]))).toMatch(/sections\[0\]/);
    expect(validateSequence(mk([f({ sections: [{ guard: 1, items: [] }] })]))).toMatch(/sections\[0\]/);
    expect(validateSequence(mk([f({ sections: [{ guard: '', items: [{ type: 'bad', id: 'x' }] }] })]))).toMatch(/type must/);
  });
  it('withItems helper compiles', () => { expect(withItems([])).toBeTruthy(); });
});

describe('seq node helpers', () => {
  it('builds sized sequence nodes', () => {
    const n = blankSequence('s1', { x: 1, y: 2 });
    expect(isSequenceNode(n)).toBe(true);
    expect(isSequenceNode(undefined)).toBe(false);
    expect(sequenceOf(n).label).toBe('Sequence');
    expect(n.data.accent).toBe(SEQ_ACCENT);
    expect(n.width).toBeGreaterThan(0);
    expect(n.style).toMatchObject({ width: n.width, height: n.height });
    const sz = sequenceSize(LOGIN);
    const w = withSequenceSize({ ...sequenceNode('x', { x: 0, y: 0 }, LOGIN, 'T'), style: undefined });
    expect(w.width).toBe(sz.width);
    expect(sequenceNode('x', { x: 0, y: 0 }, emptySequence()).data.label).toBe('Sequence');
  });
});

describe('seq types', () => {
  it('ids and walkers', () => {
    expect(seqId('p')).toMatch(/^p/);
    const mkid = idMaker();
    expect([mkid('a'), mkid('a'), mkid('b')]).toEqual(['a1', 'a2', 'b1']);
    const seen: [string, number][] = [];
    walk(LOGIN.items, (i, d) => seen.push([i.id, d]));
    expect(seen.find(([id]) => id === 'm6')![1]).toBe(1);
    expect(allMessages(LOGIN.items)).toHaveLength(8);
    expect(isMessage(LOGIN.items[0]) && !isNote(LOGIN.items[0]) && !isRef(LOGIN.items[0]) && !isFragment(LOGIN.items[0])).toBe(true);
  });
});

describe('SeqBuilder', () => {
  it('declares, redeclares, boxes, fragments, pending create/destroy, external, notes', () => {
    const b = new SeqBuilder();
    const a = b.declare('A', 'Alpha', 'actor');
    expect(b.declare('A', 'Alpha2', 'database')).toBe(a);
    expect(b.model.participants[0]).toMatchObject({ name: 'Alpha2', kind: 'database' });
    expect(b.has('A')).toBe(true);
    expect(b.closeBox()).toBe(false);
    b.openBox('G', 'red');
    expect(b.inBox).toBe(true);
    b.declare('B', 'B', 'participant');
    expect(b.closeBox()).toBe(true);
    b.openBox('H');
    expect(b.model.boxes![0].participants).toHaveLength(1);
    expect(b.model.boxes![1]).not.toHaveProperty('color');
    b.closeBox();
    b.pendingCreate.add('C');
    b.message('A', 'C', 'new', 'sync');
    b.pendingDestroy.add('C');
    b.message('A', 'C', 'bye', 'sync', { activate: true, deactivate: true });
    b.pendingCreate.add('D');
    b.message('A', 'D', 'x', 'destroy');
    b.pendingDestroy.add('A');
    b.message('A', 'A', 'self', 'sync');
    expect(allMessages(b.model.items).map((m) => m.kind)).toEqual(['create', 'destroy', 'destroy', 'sync']);
    expect((b.model.items[1] as { activate?: boolean }).activate).toBe(true);
    b.external('A', 'f', 'found');
    b.note(['A', 'B'], 'n');
    b.note(['A'], 'n2', 'left');
    b.note(['A'], 'n3', 'over');
    b.refFrame(['A'], 'r');
    expect(b.lastMessage()).toBeUndefined();
    expect(b.depth).toBe(0);
    expect(b.section('x')).toBe(false);
    expect(b.end()).toBe(false);
    b.open('alt', 'g');
    expect(b.depth).toBe(1);
    expect(b.lastMessage()).toBeUndefined();
    b.message('A', 'B', 'in', 'sync');
    expect(b.lastMessage()!.text).toBe('in');
    expect(b.section('else')).toBe(true);
    b.open('loop', 'again');
    const r = b.finish();
    expect(r.warnings).toHaveLength(2);
    expect(b.depth).toBe(0);
    const clean = new SeqBuilder();
    clean.open('opt', 'x');
    expect(clean.end()).toBe(true);
    expect(clean.finish().warnings).toEqual([]);
  });
  it('activationMarks', () => {
    const marks = activationMarks([
      { type: 'message', id: '1', from: 'a', to: 'b', text: '', kind: 'sync' },
      { type: 'message', id: '2', from: 'b', to: 'a', text: '', kind: 'return' },
      { type: 'message', id: '3', from: 'b', to: 'a', text: '', kind: 'return' },
      { type: 'message', id: '4', from: 'a', to: 'b', text: '', kind: 'async', activate: true },
      { type: 'message', id: '5', from: 'b', to: 'a', text: '', kind: 'async', deactivate: true },
      { type: 'message', id: '6', from: 'a', to: 'a', text: '', kind: 'async', deactivate: true },
      { type: 'message', id: '7', from: 'a', to: 'a', text: '', kind: 'sync', ext: 'lost' },
      { type: 'note', id: '8', text: '', over: ['a'] },
      { type: 'fragment', id: 'f', op: 'opt', sections: [{ id: 's', guard: '', items: [{ type: 'message', id: '9', from: 'a', to: 'b', text: '', kind: 'sync' }] }] },
    ]);
    expect(marks.get('1')).toEqual({ open: true, close: false });
    expect(marks.get('2')).toEqual({ open: false, close: true });
    expect(marks.get('3')).toEqual({ open: false, close: false });
    expect(marks.get('4')).toEqual({ open: true, close: false });
    expect(marks.get('5')).toEqual({ open: false, close: true });
    expect(marks.get('6')).toEqual({ open: false, close: false });
    expect(marks.get('7')).toEqual({ open: false, close: false });
    expect(marks.has('8')).toBe(false);
    expect(marks.get('9')!.open).toBe(true);
  });
});

describe('seq io', () => {
  it('detect / import / export', () => {
    expect(SEQ_FORMATS.map((f) => f.id)).toEqual(['mermaid', 'plantuml']);
    expect(detectSeqFormat('sequenceDiagram\nA->>B: hi')).toBe('mermaid');
    expect(detectSeqFormat('@startuml\nparticipant A\nA -> B : hi\n@enduml')).toBe('plantuml');
    expect(detectSeqFormat('@startuml\nclass A\nA -> B : x\n@enduml')).toBeUndefined();
    expect(detectSeqFormat('hello')).toBeUndefined();
    expect(importSeqText('hello')).toBeUndefined();
    const m = importSeqText('sequenceDiagram\nA->>B: hi');
    expect(m!.format).toBe('mermaid');
    expect(m!.model.items).toHaveLength(1);
    const p = importSeqText('@startuml\nA -> B : hi\n@enduml', 'plantuml');
    expect(p!.format).toBe('plantuml');
    const roundMermaid = importSeqText(exportSeqText(LOGIN, 'mermaid'), 'mermaid')!;
    expect(allMessages(roundMermaid.model.items)).toHaveLength(8);
    const roundPuml = importSeqText(exportSeqText(LOGIN, 'plantuml'));
    expect(roundPuml!.format).toBe('plantuml');
    expect(allMessages(roundPuml!.model.items)).toHaveLength(8);
  });
});
