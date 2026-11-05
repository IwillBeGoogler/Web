import { describe, expect, it } from 'vitest';
import { layoutSequence } from './layout';
import { LOGIN } from './fixtures';
import type { SequenceModel } from './types';

const L = layoutSequence(LOGIN);
const msg = (id: string) => L.messages.find((m) => m.id === id)!;

describe('sequence layout', () => {
  it('participants are ordered left to right with auto spacing, no overlap', () => {
    const xs = L.participants.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    for (let i = 1; i < L.participants.length; i++) {
      const a = L.participants[i - 1], b = L.participants[i];
      expect(b.boxX).toBeGreaterThanOrEqual(a.boxX + a.boxW + 8);
    }
  });
  it('messages are ordered top to bottom in document order', () => {
    const ys = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'].map((id) => msg(id).y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });
  it('arrows run between the lifelines of their participants, direction follows from/to', () => {
    const m = msg('m2');
    expect(m.x1).toBeCloseTo(L.participants[1].x, 0);
    expect(m.x2).toBeCloseTo(L.participants[2].x, 0);
    expect(msg('m4').x1).toBeGreaterThan(msg('m4').x2); // right to left
  });
  it('self message loops to the right and is taller', () => {
    expect(msg('m5').self).toBe(true);
    expect(msg('m5').loopW).toBeGreaterThan(20);
  });
  it('autonumber numbers messages in order; off gives none', () => {
    expect(msg('m1').number).toBe(1);
    expect(msg('m8').number).toBe(8);
    expect(layoutSequence({ ...LOGIN, autonumber: false }).messages[0].number).toBeUndefined();
  });
  it('activation bars come from call/return nesting', () => {
    const forAuth = L.activations.filter((a) => a.participantId === 'a');
    // verify opens Auth; the self call hash nests inside it
    expect(forAuth.length).toBeGreaterThanOrEqual(2);
    const outer = forAuth.find((a) => a.depth === 0)!;
    const inner = forAuth.find((a) => a.depth === 1)!;
    expect(inner.y1).toBeGreaterThanOrEqual(outer.y1);
    expect(inner.y2).toBeLessThanOrEqual(outer.y2);
    const db = L.activations.find((a) => a.participantId === 'd')!;
    expect(db.y1).toBeCloseTo(msg('m3').y, 0);
    expect(db.y2).toBeCloseTo(msg('m4').y, 0); // closed by the return
  });
  it('fragment bounds enclose their messages and the sections stack', () => {
    const f = L.fragments[0];
    expect(f.op).toBe('alt');
    expect(f.y).toBeLessThan(msg('m6').y);
    expect(f.y + f.h).toBeGreaterThan(msg('m7').y);
    expect(f.x).toBeLessThan(Math.min(L.participants[1].x, L.participants[2].x));
    expect(f.sections).toHaveLength(2);
    expect(f.sections[1].y).toBeGreaterThan(msg('m6').y);
    expect(f.sections[1].y).toBeLessThan(msg('m7').y);
    expect(msg('m8').y).toBeGreaterThan(f.y + f.h);
  });
  it('nested fragments: the outer one is larger on every side', () => {
    const m: SequenceModel = {
      autonumber: false,
      participants: [{ id: 'a', name: 'A', kind: 'participant' }, { id: 'b', name: 'B', kind: 'participant' }],
      items: [{ type: 'fragment', id: 'o', op: 'loop', sections: [{ id: 's', guard: 'each', items: [{ type: 'fragment', id: 'i', op: 'opt', sections: [{ id: 't', guard: 'x', items: [{ type: 'message', id: 'm', from: 'a', to: 'b', text: 'go', kind: 'sync' }] }] }] }] }],
    };
    const l = layoutSequence(m);
    const o = l.fragments.find((f) => f.id === 'o')!, i = l.fragments.find((f) => f.id === 'i')!;
    expect(o.x).toBeLessThan(i.x);
    expect(o.x + o.w).toBeGreaterThan(i.x + i.w);
    expect(o.y).toBeLessThan(i.y);
    expect(o.y + o.h).toBeGreaterThan(i.y + i.h);
  });
  it('wider labels widen the gap between participants', () => {
    const mk = (text: string): SequenceModel => ({ autonumber: false, participants: [{ id: 'a', name: 'A', kind: 'participant' }, { id: 'b', name: 'B', kind: 'participant' }], items: [{ type: 'message', id: 'm', from: 'a', to: 'b', text, kind: 'sync' }] });
    const s = layoutSequence(mk('hi')), w = layoutSequence(mk('a really quite long message label here'));
    expect(w.participants[1].x - w.participants[0].x).toBeGreaterThan(s.participants[1].x - s.participants[0].x);
  });
  it('create starts the lifeline at the message, destroy ends it with a cross', () => {
    const m: SequenceModel = {
      autonumber: false,
      participants: [{ id: 'a', name: 'A', kind: 'participant' }, { id: 'b', name: 'B', kind: 'participant' }],
      items: [
        { type: 'message', id: 'm0', from: 'a', to: 'a', text: 'init', kind: 'sync' },
        { type: 'message', id: 'c', from: 'a', to: 'b', text: 'new', kind: 'create' },
        { type: 'message', id: 'd', from: 'a', to: 'b', text: 'kill', kind: 'destroy' },
      ],
    };
    const l = layoutSequence(m);
    const b = l.participants[1];
    expect(b.boxTop).toBeGreaterThan(l.participants[0].boxTop);
    expect(b.lifeTop).toBeGreaterThan(b.boxTop);
    expect(b.destroyY).toBeCloseTo(l.messages.find((x) => x.id === 'd')!.y, 0);
    expect(b.lifeBottom).toBeCloseTo(b.destroyY!, 0);
  });
  it('notes are placed over their participants between messages', () => {
    const m: SequenceModel = {
      autonumber: false,
      participants: [{ id: 'a', name: 'A', kind: 'participant' }, { id: 'b', name: 'B', kind: 'participant' }],
      items: [
        { type: 'message', id: 'm1', from: 'a', to: 'b', text: 'x', kind: 'sync' },
        { type: 'note', id: 'n', text: 'remember', over: ['a', 'b'] },
        { type: 'message', id: 'm2', from: 'b', to: 'a', text: 'y', kind: 'return' },
      ],
    };
    const l = layoutSequence(m);
    const n = l.notes[0];
    expect(n.y).toBeGreaterThan(l.messages[0].y);
    expect(n.y + n.h).toBeLessThan(l.messages[1].y);
    expect(n.x).toBeLessThanOrEqual(l.participants[0].x);
    expect(n.x + n.w).toBeGreaterThanOrEqual(l.participants[1].x);
  });
  it('size covers everything and an empty diagram still has a size', () => {
    expect(L.width).toBeGreaterThan(L.participants[3].x);
    expect(L.height).toBeGreaterThan(msg('m8').y);
    const e = layoutSequence({ autonumber: false, participants: [], items: [] });
    expect(e.width).toBeGreaterThan(100);
    expect(e.height).toBeGreaterThan(80);
  });
});
