import { describe, expect, it } from 'vitest';
import { layoutSequence, headHeight, isGlyph, textWidth, SEQ } from './layout';
import type { SeqItem, SequenceModel, ParticipantKind } from './types';

const P = (id: string, kind: ParticipantKind = 'participant', name = id) => ({ id, name, kind });
const msg = (id: string, from: string, to: string, extra: Partial<Extract<SeqItem, { type: 'message' }>> = {}): SeqItem => ({ type: 'message', id, from, to, text: id, kind: 'sync', ...extra });
const model = (participants: ReturnType<typeof P>[], items: SeqItem[], extra: Partial<SequenceModel> = {}): SequenceModel => ({ participants, items, autonumber: false, ...extra });

describe('layoutSequence', () => {
  it('empty model has default size; helpers', () => {
    const l = layoutSequence(model([], []));
    expect(l.width).toBe(240);
    expect(l.height).toBeGreaterThan(0);
    expect(isGlyph('actor')).toBe(true);
    expect(isGlyph('participant')).toBe(false);
    expect(headHeight('participant')).toBe(SEQ.boxH);
    expect(headHeight('actor')).toBe(SEQ.glyphH + 20);
    expect(textWidth('abcd')).toBe(Math.ceil(4 * SEQ.charW));
  });
  it('found/lost messages at first, middle, last, and single participant', () => {
    const single = layoutSequence(model([P('a')], [msg('f', 'a', 'a', { ext: 'found' }), msg('l', 'a', 'a', { ext: 'lost' })]));
    expect(single.messages[0].x1).toBeGreaterThan(single.messages[0].x2);
    expect(single.messages[1].x2).toBeGreaterThan(single.messages[1].x1);
    const three = layoutSequence(model([P('a'), P('b'), P('c')], [
      msg('f1', 'a', 'a', { ext: 'found' }), msg('f2', 'b', 'b', { ext: 'lost', text: 'a very long lost message text here for gap growth' }), msg('f3', 'c', 'c', { ext: 'found' }), msg('f4', 'c', 'c', { ext: 'lost' }),
    ], { autonumber: true }));
    const [f1, f2, f3, f4] = three.messages;
    expect(f1.x1).toBeGreaterThan(f1.x2);
    expect(f2.x2).toBeGreaterThan(f2.x1);
    expect(f3.x1).toBeLessThan(f3.x2);
    expect(f4.x2).toBeLessThan(f4.x1);
    expect(three.messages.map((m) => m.number)).toEqual([1, 2, 3, 4]);
  });
  it('self messages in the middle and at the end widen the diagram', () => {
    const mid = layoutSequence(model([P('a'), P('b')], [msg('s', 'a', 'a', { text: 'a long self message' })]));
    const end = layoutSequence(model([P('a'), P('b')], [msg('s', 'b', 'b', { text: 'a long self message' })]));
    expect(mid.messages[0].self).toBe(true);
    expect(mid.messages[0].loopW).toBe(SEQ.selfLoopW);
    expect(end.width).toBeGreaterThan(layoutSequence(model([P('a'), P('b')], [])).width);
  });
  it('create / destroy messages and unknown participants', () => {
    const ltr = layoutSequence(model([P('a'), P('b', 'actor')], [msg('c', 'a', 'b', { kind: 'create' }), msg('d', 'a', 'b', { kind: 'destroy' }), msg('x', 'a', 'zz'), msg('y', 'zz', 'a')]));
    expect(ltr.participants[1].created).toBe(true);
    expect(ltr.participants[1].destroyY).toBeDefined();
    expect(ltr.participants[1].lifeBottom).toBe(ltr.participants[1].destroyY);
    expect(ltr.messages).toHaveLength(2);
    const rtl = layoutSequence(model([P('a'), P('b')], [msg('c', 'b', 'a', { kind: 'create' })]));
    expect(rtl.messages[0].x2).toBeGreaterThan(rtl.participants[0].x);
    const selfCreate = layoutSequence(model([P('a')], [msg('c', 'a', 'a', { kind: 'create' }), msg('d', 'a', 'a', { kind: 'destroy', ext: 'lost' })]));
    expect(selfCreate.participants[0].created).toBe(false);
    expect(selfCreate.participants[0].destroyY).toBeUndefined();
  });
  it('notes: sides, two participants, wrapping, unknown participants; refs', () => {
    const long = 'word '.repeat(40) + 'supercalifragilisticexpialidocious';
    const l = layoutSequence(model([P('a'), P('b'), P('c')], [
      { type: 'note', id: 'n1', text: 'over', over: ['b'] },
      { type: 'note', id: 'n2', text: 'left', over: ['b'], side: 'left' },
      { type: 'note', id: 'n3', text: 'right', over: ['b'], side: 'right' },
      { type: 'note', id: 'n4', text: long, over: ['a', 'c'] },
      { type: 'note', id: 'n5', text: '', over: ['zz'] },
      { type: 'note', id: 'n6', text: '', over: ['a'] },
      { type: 'ref', id: 'r1', text: 'ref text', over: ['a', 'c'] },
      { type: 'ref', id: 'r2', text: 'x', over: ['zz'] },
      { type: 'ref', id: 'r3', text: 'single', over: ['b'] },
    ]));
    const n = (id: string) => l.notes.find((x) => x.id === id)!;
    expect(n('n2').x).toBeLessThan(n('n1').x);
    expect(n('n3').x).toBeGreaterThan(n('n1').x);
    expect(n('n4').lines.length).toBeGreaterThan(3);
    expect(n('n5')).toBeUndefined();
    expect(n('n6').lines).toEqual([' '.trim() ? '' : '']);
    expect(l.refs.map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(l.width).toBeGreaterThan(l.refs[0].x + l.refs[0].w);
  });
  it('fragments: nested, sections, self messages inside, boxes, activations', () => {
    const inner: SeqItem = { type: 'fragment', id: 'in', op: 'loop', sections: [{ id: 'is', guard: 'x', items: [msg('s', 'c', 'c', { text: 'self inside the frame' })] }] };
    const l = layoutSequence(model([P('a', 'actor'), P('b'), P('c', 'database')], [
      msg('m1', 'a', 'b'),
      msg('m2', 'b', 'c', { activate: true, kind: 'async' }),
      { type: 'fragment', id: 'f', op: 'alt', sections: [{ id: 's1', guard: 'one', items: [inner, msg('m3', 'c', 'b', { kind: 'return' })] }, { id: 's2', guard: 'two', items: [msg('m4', 'b', 'a', { kind: 'async', deactivate: true })] }] },
      { type: 'fragment', id: 'empty', op: 'opt', sections: [{ id: 'e', guard: '', items: [] }] },
      msg('m5', 'a', 'b', { kind: 'return' }),
      msg('m6', 'a', 'c'),
    ], { boxes: [{ id: 'bx', label: 'G', color: 'red', participants: ['a', 'b'] }, { id: 'by', label: 'H', participants: ['zz'] }, { id: 'bz', label: 'I', participants: ['c'] }], autonumber: true }));
    expect(l.fragments).toHaveLength(3);
    const f = l.fragments.find((x) => x.id === 'f')!;
    expect(f.level).toBe(1);
    expect(f.sections[1].divider).toBe(true);
    expect(l.fragments.find((x) => x.id === 'in')!.depth).toBe(1);
    const empty = l.fragments.find((x) => x.id === 'empty')!;
    expect(empty.x).toBeLessThan(l.participants[0].x);
    expect(l.boxes.map((b) => b.id)).toEqual(['bx', 'bz']);
    expect(l.boxes[0].color).toBe('red');
    expect(l.activations.length).toBeGreaterThan(2);
    expect(l.activations.every((a) => a.y2 >= a.y1 + 12)).toBe(true);
    expect(l.width).toBeGreaterThan(f.x + f.w);
    for (let i = 1; i < l.activations.length; i++) expect(l.activations[i].y1).toBeGreaterThanOrEqual(l.activations[i - 1].y1);
  });
  it('activation: return without open, unclosed at the end, lost sync does not open', () => {
    const l = layoutSequence(model([P('a'), P('b')], [
      msg('r', 'b', 'a', { kind: 'return' }),
      msg('x', 'a', 'b', { kind: 'sync', ext: 'lost' }),
      msg('open', 'a', 'b'),
      msg('open2', 'a', 'b'),
    ]));
    expect(l.activations).toHaveLength(2);
    expect(l.activations[1].depth).toBe(1);
  });
  it('fragment without participants spans all lifelines', () => {
    const l = layoutSequence(model([P('a'), P('b')], [{ type: 'fragment', id: 'f', op: 'group', sections: [{ id: 's', guard: '', items: [{ type: 'note', id: 'n', text: 't', over: ['zz'] }] }] }]));
    expect(l.fragments[0].x).toBeLessThan(l.participants[0].x);
    expect(l.fragments[0].x + l.fragments[0].w).toBeGreaterThan(l.participants[1].x);
  });
});
