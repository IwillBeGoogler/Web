import { describe, expect, it } from 'vitest';
import { addMember, parseName, setMemberText, toggleCompartment } from './edit';
import { blankClass, classOf } from './geometry';

describe('edit branches', () => {
  it('enum: adds literal without visibility/type and expands compartment', () => {
    const e = { ...classOf(blankClass('e', { x: 0, y: 0 }, 'enum')), collapsedAttributes: true };
    const r = addMember(e, 'attribute');
    const lit = r.attributes[r.attributes.length - 1];
    expect(lit).toMatchObject({ visibility: '', name: 'VALUE' });
    expect('type' in lit).toBe(false);
    expect(r.collapsedAttributes).toBe(false);
  });
  it('class: new attribute is private string; operation expands', () => {
    const c = { ...classOf(blankClass('c', { x: 0, y: 0 })), collapsedOperations: true };
    expect(addMember(c, 'attribute').attributes.at(-1)).toMatchObject({ visibility: '-', name: 'attribute', type: 'string' });
    expect(addMember(c, 'operation').collapsedOperations).toBe(false);
  });
  it('enum literal keeps empty visibility unless typed', () => {
    const e = classOf(blankClass('e', { x: 0, y: 0 }, 'enum'));
    const id = e.attributes[0].id;
    expect(setMemberText(e, 'attributes', id, 'RED').attributes[0]).toMatchObject({ name: 'RED', visibility: '' });
    expect(setMemberText(e, 'attributes', id, '+ RED').attributes[0].visibility).toBe('+');
    const other = setMemberText(e, 'attributes', 'zzz', 'X');
    expect(other.attributes[0].id).toBe(id);
  });
  it('toggles each compartment', () => {
    const c = classOf(blankClass('c', { x: 0, y: 0 }));
    expect(toggleCompartment(c, 'attributes').collapsedAttributes).toBe(true);
    expect(toggleCompartment(c, 'operations').collapsedOperations).toBe(true);
    expect(toggleCompartment(toggleCompartment(c, 'operations'), 'operations').collapsedOperations).toBe(false);
  });
  it('parseName: empty generics become undefined', () => {
    expect(parseName('Repo<T, K>')).toEqual({ label: 'Repo', generics: 'T, K' });
    expect(parseName('Repo<  >')).toEqual({ label: 'Repo', generics: undefined });
    expect(parseName('  Plain ')).toEqual({ label: 'Plain', generics: undefined });
  });
});
