import { describe, expect, it } from 'vitest';
import { addMember, moveMember, parseName, patchMember, removeMember, setMemberText, toggleCompartment } from './edit';
import { blankClass, classOf } from './geometry';

const d = () => classOf(blankClass('c', { x: 0, y: 0 }));

describe('class editing helpers', () => {
  it('adds an attribute / operation with a fresh id', () => {
    const a = addMember(d(), 'attribute');
    expect(a.attributes.map((m) => m.id)).toEqual(['a0', 'a1']);
    const o = addMember(a, 'operation');
    expect(o.operations.map((m) => m.id)).toEqual(['o0', 'o1']);
    expect(o.operations[1].params).toEqual([]);
  });
  it('removes and patches members', () => {
    expect(removeMember(d(), 'a0').attributes).toEqual([]);
    expect(patchMember(d(), 'o0', { static: true }).operations[0].static).toBe(true);
  });
  it('reorders inside a compartment only', () => {
    const x = addMember(addMember(d(), 'attribute'), 'attribute');
    expect(moveMember(x, 'attributes', 'a2', 0).attributes.map((m) => m.id)).toEqual(['a2', 'a0', 'a1']);
    expect(moveMember(x, 'attributes', 'nope', 0)).toBe(x);
  });
  it('setMemberText parses the text into the member, keeping its id', () => {
    const x = setMemberText(d(), 'operations', 'o0', 'static # make(a: A, b: B): Thing');
    expect(x.operations[0]).toMatchObject({ id: 'o0', visibility: '#', name: 'make', static: true, type: 'Thing', params: [{ name: 'a', type: 'A' }, { name: 'b', type: 'B' }] });
    const y = setMemberText(d(), 'attributes', 'a0', '- count: int = 3');
    expect(y.attributes[0]).toMatchObject({ id: 'a0', visibility: '-', name: 'count', type: 'int', default: '3' });
  });
  it('an enum literal keeps an empty visibility', () => {
    const e = classOf(blankClass('c', { x: 0, y: 0 }, 'enum'));
    expect(setMemberText(e, 'attributes', 'a0', 'RED').attributes[0]).toMatchObject({ name: 'RED', visibility: '' });
  });
  it('toggleCompartment flips the collapsed flag', () => {
    expect(toggleCompartment(d(), 'attributes').collapsedAttributes).toBe(true);
    expect(toggleCompartment(toggleCompartment(d(), 'operations'), 'operations').collapsedOperations).toBe(false);
  });
  it('parseName splits generics: Repository<T> -> label + generics', () => {
    expect(parseName('Repository<T>')).toEqual({ label: 'Repository', generics: 'T' });
    expect(parseName('Map<K, V>')).toEqual({ label: 'Map', generics: 'K, V' });
    expect(parseName('Plain')).toEqual({ label: 'Plain', generics: undefined });
  });
});
