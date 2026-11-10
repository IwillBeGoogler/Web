import { describe, expect, it } from 'vitest';
import { LOGIN } from './fixtures';
import {
  addBox, addFragment, addMessage, addNote, addParticipant, addRef, addSection, findItem, nextParticipant, removeBox, removeItem, removeParticipant,
  retargetMessage, setMessageExt, updateBox, updateItem, updateParticipant, updateSection,
} from './edit';
import { emptySequence, isFragment, isMessage, type SequenceModel, type SeqMessage } from './types';

const msg = (m: SequenceModel, id: string) => findItem(m, id) as SeqMessage;

describe('participants', () => {
  it('addParticipant: default names unique, after position, explicit name & kind', () => {
    const a = addParticipant(emptySequence());
    expect(a.participants[0]).toMatchObject({ name: 'Participant', kind: 'participant' });
    const b = addParticipant(a);
    expect(b.participants[1].name).toBe('Participant 2');
    const c = addParticipant(b, { kind: 'database', after: a.participants[0].id, name: 'Store' });
    expect(c.participants.map((p) => p.name)).toEqual(['Participant', 'Store', 'Participant 2']);
    expect(addParticipant(a, { after: 'missing' }).participants).toHaveLength(2);
  });
  it('removeParticipant prunes messages, notes, refs, fragments, boxes', () => {
    const m: SequenceModel = {
      autonumber: false,
      participants: [{ id: 'a', name: 'A', kind: 'actor' }, { id: 'b', name: 'B', kind: 'actor' }, { id: 'c', name: 'C', kind: 'actor' }],
      boxes: [{ id: 'bx', label: 'x', participants: ['a'] }, { id: 'by', label: 'y', participants: ['a', 'b'] }],
      items: [
        { type: 'message', id: 'm1', from: 'a', to: 'b', text: '', kind: 'sync' },
        { type: 'message', id: 'm2', from: 'b', to: 'c', text: '', kind: 'sync' },
        { type: 'note', id: 'n1', text: '', over: ['a'] },
        { type: 'note', id: 'n2', text: '', over: ['a', 'b'] },
        { type: 'ref', id: 'r1', text: '', over: ['a', 'c'] },
        { type: 'fragment', id: 'f', op: 'opt', sections: [{ id: 's', guard: '', items: [{ type: 'message', id: 'm3', from: 'a', to: 'c', text: '', kind: 'sync' }, { type: 'message', id: 'm4', from: 'b', to: 'c', text: '', kind: 'sync' }] }] },
      ],
    };
    const r = removeParticipant(m, 'a');
    expect(r.participants.map((p) => p.id)).toEqual(['b', 'c']);
    expect(r.items.map((i) => i.id)).toEqual(['m2', 'n2', 'r1', 'f']);
    expect((r.items[1] as { over: string[] }).over).toEqual(['b']);
    expect(r.boxes).toEqual([{ id: 'by', label: 'y', participants: ['b'] }]);
    const f = r.items[3];
    expect(isFragment(f) && f.sections[0].items.map((i) => i.id)).toEqual(['m4']);
    expect(removeParticipant(m, 'zzz')).toBe(m);
    const noBox = removeParticipant({ ...m, boxes: undefined }, 'a');
    expect(noBox.boxes).toBeUndefined();
  });
  it('updateParticipant / nextParticipant', () => {
    expect(updateParticipant(LOGIN, 'u', { name: 'X' }).participants[0].name).toBe('X');
    expect(updateParticipant(LOGIN, 'nope', { name: 'X' })).toBe(LOGIN);
    expect(nextParticipant(LOGIN, 'u', 1)).toBe('w');
    expect(nextParticipant(LOGIN, 'u', -1)).toBeUndefined();
    expect(nextParticipant(LOGIN, 'zzz', 1)).toBeUndefined();
  });
});

describe('items', () => {
  it('addMessage defaults, after, explicit, and empty model', () => {
    expect(addMessage(emptySequence())).toEqual(emptySequence());
    const one = addMessage({ ...emptySequence(), participants: [{ id: 'p', name: 'P', kind: 'participant' }] });
    expect(one.items[0]).toMatchObject({ from: 'p', to: 'p', text: 'message', kind: 'sync' });
    const a = addMessage(LOGIN, { after: 'm2', text: 'hi', kind: 'async' });
    const added = a.items[2] as SeqMessage;
    expect(added).toMatchObject({ from: 'a', to: 'd', text: 'hi', kind: 'async' });
    const inFrag = addMessage(LOGIN, { after: 'm6' });
    const f = inFrag.items.find(isFragment)!;
    expect(f.sections[0].items).toHaveLength(2);
    const afterNonMsg = addMessage(LOGIN, { after: 'f1', from: 'u', to: 'd' });
    expect(afterNonMsg.items[6]).toMatchObject({ from: 'u', to: 'd' });
    expect(addMessage(LOGIN, { after: 'nope' }).items.at(-1)).toMatchObject({ from: 'u', to: 'w' });
  });
  it('addNote / addRef', () => {
    expect(addNote(emptySequence())).toEqual(emptySequence());
    expect(addRef(emptySequence())).toEqual(emptySequence());
    const n = addNote(LOGIN, { after: 'm1', over: ['w'], text: 't' });
    expect(n.items[1]).toMatchObject({ type: 'note', over: ['w'], text: 't' });
    expect(addNote(LOGIN).items.at(-1)).toMatchObject({ over: ['u'] });
    expect(addNote(LOGIN, { after: 'zz', over: [] }).items.at(-1)).toMatchObject({ over: ['u'] });
    const r = addRef(LOGIN, { after: 'm1' });
    expect(r.items[1]).toMatchObject({ type: 'ref', over: ['u', 'w'] });
    expect(addRef(LOGIN, { over: ['d'], text: 'x' }).items.at(-1)).toMatchObject({ over: ['d'], text: 'x' });
    expect(addRef(LOGIN, { after: 'zz' }).items.at(-1)!.type).toBe('ref');
  });
  it('setMessageExt', () => {
    const lost = setMessageExt(LOGIN, 'm2', 'lost');
    expect(msg(lost, 'm2')).toMatchObject({ ext: 'lost', to: 'w' });
    const found = setMessageExt(LOGIN, 'm2', 'found');
    expect(msg(found, 'm2')).toMatchObject({ ext: 'found', from: 'a' });
    const created = setMessageExt({ ...LOGIN, items: [{ type: 'message', id: 'x', from: 'u', to: 'w', text: '', kind: 'create' }] }, 'x', 'lost');
    expect(msg(created, 'x').kind).toBe('sync');
    const restore = setMessageExt(lost, 'm2', undefined);
    expect(msg(restore, 'm2').ext).toBeUndefined();
    expect(msg(restore, 'm2').to).toBe('a');
    const self = setMessageExt(LOGIN, 'm5', undefined);
    expect(msg(self, 'm5').to).toBe('d');
    expect(setMessageExt(LOGIN, 'f1', 'lost')).toBe(LOGIN);
    expect(setMessageExt(LOGIN, 'nope', 'lost')).toBe(LOGIN);
  });
  it('retargetMessage', () => {
    expect(msg(retargetMessage(LOGIN, 'm1', 'to', 'd'), 'm1').to).toBe('d');
    expect(retargetMessage(LOGIN, 'm1', 'to', 'zz')).toBe(LOGIN);
    expect(retargetMessage(LOGIN, 'm1', 'to', 'w')).toBe(LOGIN);
    expect(retargetMessage(LOGIN, 'nope', 'to', 'w')).toBe(LOGIN);
    expect(retargetMessage(LOGIN, 'f1', 'to', 'w')).toBe(LOGIN);
    const lost = setMessageExt(LOGIN, 'm2', 'lost');
    const moved = msg(retargetMessage(lost, 'm2', 'from', 'd'), 'm2');
    expect([moved.from, moved.to]).toEqual(['d', 'd']);
    const same = retargetMessage(lost, 'm2', 'from', 'w');
    expect(msg(same, 'm2')).toMatchObject({ from: 'w', to: 'w' });
  });
  it('boxes', () => {
    expect(addBox(LOGIN, ['nope'])).toBe(LOGIN);
    const b = addBox(LOGIN, ['u', 'w', 'zz'], 'Front', 'red');
    expect(b.boxes![0]).toMatchObject({ label: 'Front', color: 'red', participants: ['u', 'w'] });
    const b2 = addBox(b, ['w']);
    expect(b2.boxes!.map((x) => x.participants)).toEqual([['u'], ['w']]);
    expect(b2.boxes![1]).not.toHaveProperty('color');
    const id = b.boxes![0].id;
    expect(updateBox(b, id, { label: 'New' }).boxes![0].label).toBe('New');
    expect(updateBox(b, 'zz', { label: 'New' })).toBe(b);
    expect(updateBox(LOGIN, 'zz', {})).toBe(LOGIN);
    expect(removeBox(b, id).boxes).toEqual([]);
    expect(removeBox(b, 'zz')).toBe(b);
    expect(removeBox(LOGIN, 'zz')).toBe(LOGIN);
  });
  it('addFragment: guards per op, wrap items, append when none', () => {
    const guards = (['alt', 'opt', 'break', 'group', 'rect', 'loop', 'par'] as const).map((op) => (addFragment(emptySequence(), op).items[0] as never as { sections: { guard: string }[] }).sections[0].guard);
    expect(guards).toEqual(['condition', 'condition', 'condition', 'label', 'rgb(220,232,252)', 'while condition', '']);
    const w = addFragment(LOGIN, 'loop', ['m2', 'm3']);
    const f = w.items[1];
    expect(isFragment(f) && f.sections[0].items.map((i) => i.id)).toEqual(['m2', 'm3']);
    expect(w.items).toHaveLength(LOGIN.items.length - 1);
    expect(addFragment(LOGIN, 'opt', ['nope']).items.at(-1)!.type).toBe('fragment');
  });
  it('addSection / updateSection / updateItem / removeItem / findItem', () => {
    const s = addSection(LOGIN, 'f1', 'extra');
    const f = s.items.find(isFragment)!;
    expect(f.sections).toHaveLength(3);
    expect(f.sections[2].guard).toBe('extra');
    expect(addSection(LOGIN, 'f1').items.find(isFragment)!.sections[2].guard).toBe('else');
    expect(addSection(LOGIN, 'm1')).toBe(LOGIN);
    expect(addSection(LOGIN, 'nope')).toBe(LOGIN);
    expect(updateSection(LOGIN, 's2', { guard: 'other' }).items.find(isFragment)!.sections[1].guard).toBe('other');
    expect(updateSection(LOGIN, 'nope', { guard: 'x' })).toBe(LOGIN);
    expect(msg(updateItem(LOGIN, 'm1', { text: 'zzz' }), 'm1').text).toBe('zzz');
    expect(updateItem(LOGIN, 'nope', {})).toBe(LOGIN);
    expect(findItem(removeItem(LOGIN, 'm6'), 'm6')).toBeUndefined();
    expect(removeItem(LOGIN, 'nope')).toBe(LOGIN);
    expect(isMessage(findItem(LOGIN, 'm7')!)).toBe(true);
  });
});
