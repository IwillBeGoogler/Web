import { describe, expect, it } from 'vitest';
import { CLS, classLayout, classSize, headerLines, blankClass, shownCompartments, withClassSize } from './geometry';
import type { ClassNodeData } from './types';

const base = (x: Partial<ClassNodeData> = {}): ClassNodeData => ({
  label: 'Account', kind: 'class', accent: '#2f6fdb',
  attributes: [{ id: 'a0', visibility: '-', name: 'id', type: 'number' }, { id: 'a1', visibility: '-', name: 'owner', type: 'string' }],
  operations: [{ id: 'o0', visibility: '+', name: 'deposit', params: [{ name: 'n', type: 'number' }], type: 'void' }, { id: 'o1', visibility: '+', name: 'close', params: [] }],
  ...x,
});

describe('class node geometry (row engine)', () => {
  it('stacks name, attributes and operations compartments', () => {
    const l = classLayout(base());
    expect(l.compartments.map((c) => c.id)).toEqual(['attributes', 'operations']);
    const a0 = l.rows.get('a0')!;
    const o0 = l.rows.get('o0')!;
    expect(a0.top).toBe(CLS.headerH + CLS.pad);
    expect(o0.top).toBeGreaterThan(l.rows.get('a1')!.top + CLS.rowH);
    expect(l.height).toBeGreaterThan(o0.top + CLS.rowH * 2);
  });
  it('a stereotype adds a header line', () => {
    expect(headerLines(base({ kind: 'interface' }))).toEqual(['«interface»']);
    expect(headerLines(base({ kind: 'abstract' }))).toEqual(['«abstract»']);
    expect(headerLines(base({ kind: 'enum' }))).toEqual(['«enum»']);
    expect(headerLines(base({ kind: 'class', stereotype: 'entity' }))).toEqual(['«entity»']);
    expect(headerLines(base())).toEqual([]);
    expect(classLayout(base({ kind: 'interface' })).headerH).toBe(CLS.headerH + CLS.stereoH);
    expect(classLayout(base()).headerH).toBe(CLS.headerH);
  });
  it('enums show literals only; interfaces hide an empty attribute compartment', () => {
    expect(shownCompartments(base({ kind: 'enum' }))).toEqual(['attributes']);
    expect(shownCompartments(base({ kind: 'interface', attributes: [] }))).toEqual(['operations']);
    expect(shownCompartments(base({ kind: 'interface' }))).toEqual(['attributes', 'operations']);
    expect(shownCompartments(base({ attributes: [], operations: [] }))).toEqual(['attributes', 'operations']);
  });
  it('collapsing a compartment replaces its rows by a one-line summary', () => {
    const open = classLayout(base());
    const shut = classLayout(base({ collapsedAttributes: true }));
    expect(shut.height).toBeLessThan(open.height);
    expect(shut.rows.has('a0')).toBe(false);
    expect(shut.rows.has('o0')).toBe(true);
  });
  it('width follows the longest row and stays within bounds', () => {
    expect(classSize(base()).width).toBeGreaterThanOrEqual(CLS.minW);
    const long = base({ operations: [{ id: 'o0', visibility: '+', name: 'aVeryLongOperationName', params: [{ name: 'argumentNumberOne', type: 'SomeLongType' }, { name: 'two', type: 'Another' }], type: 'Promise<Result>' }] });
    expect(classSize(long).width).toBeGreaterThan(classSize(base()).width);
    expect(classSize(long).width).toBeLessThanOrEqual(CLS.maxW);
  });
  it('withClassSize writes width, height and style', () => {
    const n = withClassSize(blankClass('c1', { x: 10, y: 20 }));
    expect(n.type).toBe('class');
    expect(n.width).toBeGreaterThan(0);
    expect(n.height).toBe(classLayout(n.data as unknown as ClassNodeData).height);
    expect((n.style as { height: number }).height).toBe(n.height);
  });
  it('blank interface / abstract / enum factories', () => {
    expect((blankClass('a', { x: 0, y: 0 }, 'interface').data as unknown as ClassNodeData).kind).toBe('interface');
    expect((blankClass('a', { x: 0, y: 0 }, 'enum').data as unknown as ClassNodeData).attributes.length).toBeGreaterThan(0);
    expect((blankClass('a', { x: 0, y: 0 }, 'abstract').data as unknown as ClassNodeData).operations.some((o) => o.abstract)).toBe(true);
  });
});
