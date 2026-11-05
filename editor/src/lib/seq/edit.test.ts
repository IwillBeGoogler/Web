import { describe, expect, it } from 'vitest';
import { LOGIN } from './fixtures';
import { addFragment, addMessage, addParticipant, addSection, leafOrder, moveItem, moveParticipant, nextParticipant, removeItem, removeParticipant, setNumbering, updateItem } from './edit';
import { allMessages } from './types';

const ids = (m: typeof LOGIN) => leafOrder(m).map((l) => l.id);

describe('sequence editing', () => {
  it('moveParticipant reorders; messages keep their endpoints', () => {
    const m = moveParticipant(LOGIN, 'd', 0);
    expect(m.participants.map((p) => p.id)).toEqual(['d', 'u', 'w', 'a']);
    expect(allMessages(m.items).map((x) => [x.from, x.to])).toEqual(allMessages(LOGIN.items).map((x) => [x.from, x.to]));
    expect(moveParticipant(LOGIN, 'u', 99).participants.at(-1)!.id).toBe('u');
    expect(moveParticipant(LOGIN, 'zzz', 0)).toBe(LOGIN);
  });
  it('leafOrder is document order across fragments', () => {
    expect(ids(LOGIN)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']);
  });
  it('moveItem reorders at the top level', () => {
    const m = moveItem(LOGIN, 'm8', 0);
    expect(ids(m)[0]).toBe('m8');
    expect(ids(m)).toHaveLength(8);
    const m2 = moveItem(LOGIN, 'm1', 3);
    expect(ids(m2).slice(0, 4)).toEqual(['m2', 'm3', 'm4', 'm1']);
  });
  it('moveItem into a fragment joins that section; out of it joins the top level', () => {
    const into = moveItem(LOGIN, 'm1', 5); // before m7... after removal index 5 is m7
    const f = into.items.find((i) => i.type === 'fragment');
    expect(f && f.type === 'fragment' && f.sections[1].items.map((x) => x.id)).toEqual(['m1', 'm7']);
    const out = moveItem(LOGIN, 'm6', 0);
    expect(out.items[0].id).toBe('m6');
  });
  it('moveItem to the end appends to the top level; unknown id is a no-op', () => {
    expect(moveItem(LOGIN, 'm1', 99).items.at(-1)!.id).toBe('m1');
    expect(moveItem(LOGIN, 'nope', 0)).toBe(LOGIN);
  });
  it('moving a fragment moves its whole content', () => {
    const m = moveItem(LOGIN, 'f1', 0);
    expect(m.items[0].id).toBe('f1');
    expect(ids(m).slice(0, 2)).toEqual(['m6', 'm7']);
  });
  it('addParticipant appends or inserts after, with a unique name', () => {
    const a = addParticipant(LOGIN, { kind: 'entity' });
    expect(a.participants).toHaveLength(5);
    expect(a.participants.at(-1)!.kind).toBe('entity');
    const b = addParticipant(LOGIN, { after: 'u' });
    expect(b.participants[1].id).not.toBe('w');
    expect(new Set(b.participants.map((p) => p.name)).size).toBe(5);
  });
  it('removeParticipant drops its messages and notes', () => {
    const m = removeParticipant(LOGIN, 'd');
    expect(m.participants.map((p) => p.id)).toEqual(['u', 'w', 'a']);
    expect(ids(m)).not.toContain('m3');
    expect(ids(m)).not.toContain('m4');
  });
  it('addMessage defaults to the next pair and inserts after a given item', () => {
    const m = addMessage(LOGIN, { after: 'm1' });
    expect(ids(m)[1]).not.toBe('m2');
    expect(ids(m)).toHaveLength(9);
    const one = addMessage({ autonumber: false, participants: [{ id: 'a', name: 'A', kind: 'participant' }], items: [] }, {});
    expect(one.items).toHaveLength(1);
  });
  it('addFragment wraps the listed messages; addSection adds an else', () => {
    const m = addFragment(LOGIN, 'loop', ['m2', 'm3']);
    const f = m.items.find((i) => i.type === 'fragment' && i.op === 'loop');
    expect(f && f.type === 'fragment' && f.sections[0].items.map((x) => x.id)).toEqual(['m2', 'm3']);
    expect(m.items.indexOf(f!)).toBe(1);
    const s = addSection(LOGIN, 'f1');
    expect((s.items.find((i) => i.id === 'f1') as { sections: unknown[] }).sections).toHaveLength(3);
  });
  it('updateItem edits text; removeItem deletes (fragment content too); setNumbering toggles', () => {
    expect(ids(removeItem(LOGIN, 'f1'))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm8']);
    const u = updateItem(LOGIN, 'm1', { text: 'sign in' });
    expect(allMessages(u.items)[0].text).toBe('sign in');
    expect(setNumbering(LOGIN, false).autonumber).toBe(false);
  });
  it('nextParticipant steps with wrap and reports the end', () => {
    expect(nextParticipant(LOGIN, 'u', 1)).toBe('w');
    expect(nextParticipant(LOGIN, 'w', -1)).toBe('u');
    expect(nextParticipant(LOGIN, 'd', 1)).toBeUndefined();
  });
});
