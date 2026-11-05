import { describe, expect, it } from 'vitest';
import { layoutRows, reorderRows, rowAnchorY, rowAt, rowDropIndex } from './engine';

const spec = { headerH: 40, rowH: 28, bottomPad: 6 };

describe('row engine: layout', () => {
  it('stacks fixed-height rows under the header', () => {
    const l = layoutRows({ ...spec, compartments: [{ id: 'cols', rows: ['a', 'b', 'c'] }] });
    expect(l.height).toBe(40 + 3 * 28 + 6);
    expect(l.rows.get('a')).toMatchObject({ top: 40, center: 54, height: 28, compartment: 'cols', index: 0 });
    expect(l.rows.get('c')!.center).toBe(40 + 2 * 28 + 14);
  });
  it('reserves room for an empty compartment (minRows) so the node never collapses to the header', () => {
    expect(layoutRows({ ...spec, compartments: [{ id: 'c', rows: [], minRows: 1 }] }).height).toBe(40 + 28 + 6);
    expect(layoutRows({ ...spec, compartments: [{ id: 'c', rows: [] }] }).height).toBe(40 + 6);
  });
  it('puts padding and a divider between compartments', () => {
    const l = layoutRows({ ...spec, compartments: [{ id: 'attrs', rows: ['a1', 'a2'], padTop: 4, padBottom: 4 }, { id: 'ops', rows: ['o1'], padTop: 4, padBottom: 4 }] });
    expect(l.compartments.map((c) => [c.id, c.top, c.height])).toEqual([['attrs', 40, 64], ['ops', 104, 36]]);
    expect(l.rows.get('a1')!.top).toBe(44);
    expect(l.rows.get('o1')!.top).toBe(108);
    expect(l.height).toBe(104 + 36 + 6);
  });
  it('a collapsed compartment keeps only its summary height and its rows anchor on the header', () => {
    const open = layoutRows({ ...spec, compartments: [{ id: 'attrs', rows: ['a1', 'a2'] }, { id: 'ops', rows: ['o1'] }] });
    const shut = layoutRows({ ...spec, compartments: [{ id: 'attrs', rows: ['a1', 'a2'], collapsed: true, summaryH: 20 }, { id: 'ops', rows: ['o1'] }] });
    expect(shut.height).toBe(open.height - 56 + 20);
    expect(shut.rows.has('a1')).toBe(false);
    expect(rowAnchorY(shut, 'a1')).toBe(20); // hidden row -> header centre
    expect(rowAnchorY(shut, 'o1')).toBe(shut.rows.get('o1')!.center);
    expect(shut.compartments[0].collapsed).toBe(true);
  });
  it('keepRows shows only the key rows of a collapsed compartment (ER "keys only")', () => {
    const l = layoutRows({ ...spec, compartments: [{ id: 'c', rows: ['id', 'name', 'fk'], collapsed: true, keepRows: ['id', 'fk'] }] });
    expect([...l.rows.keys()]).toEqual(['id', 'fk']);
    expect(l.height).toBe(40 + 2 * 28 + 6);
  });
  it('footer height is added under the last compartment', () => {
    expect(layoutRows({ ...spec, footerH: 30, compartments: [{ id: 'c', rows: ['a'] }] }).height).toBe(40 + 28 + 30 + 6);
  });
});

describe('row engine: anchors and hit testing', () => {
  const l = layoutRows({ ...spec, compartments: [{ id: 'a', rows: ['x', 'y'] }, { id: 'b', rows: ['z'], padTop: 8 }] });
  it('anchor of an unknown or missing row is the header centre', () => {
    expect(rowAnchorY(l, undefined)).toBe(20);
    expect(rowAnchorY(l, 'nope')).toBe(20);
  });
  it('rowAt maps a local y to a row', () => {
    expect(rowAt(l, 41)!.id).toBe('x');
    expect(rowAt(l, 40 + 28 + 1)!.id).toBe('y');
    expect(rowAt(l, 100)).toBeUndefined(); // the gap above compartment b
    expect(rowAt(l, 140)).toBeUndefined();
    expect(rowAt(l, 10)).toBeUndefined();
  });
  it('reorderRows moves one id and clamps', () => {
    expect(reorderRows(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(reorderRows(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(reorderRows(['a', 'b', 'c'], 'b', 99)).toEqual(['a', 'c', 'b']);
    expect(reorderRows(['a', 'b'], 'zz', 0)).toEqual(['a', 'b']);
  });
  it('rowDropIndex turns a pointer delta into a target index', () => {
    expect(rowDropIndex(1, 30, 28, 1, 5)).toBe(2);
    expect(rowDropIndex(1, 30, 28, 2, 5)).toBe(2); // zoom 2 halves the row size on screen... 30px / (28*2)
    expect(rowDropIndex(0, -100, 28, 1, 5)).toBe(0);
    expect(rowDropIndex(3, 500, 28, 1, 5)).toBe(4);
  });
});
