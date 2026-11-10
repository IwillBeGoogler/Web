import { describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { blankClass, classLayout, classOf, CLS, isClassNode, memberCenterY, nextMemberId, shownCompartments } from './geometry';

describe('geometry extras', () => {
  it('isClassNode', () => {
    expect(isClassNode(blankClass('c', { x: 0, y: 0 }))).toBe(true);
    expect(isClassNode({ id: 'g', type: 'group' } as DiagramNode)).toBe(false);
    expect(isClassNode(undefined)).toBe(false);
  });
  it('memberCenterY: row centre, falls back to header for unknown/undefined', () => {
    const d = classOf(blankClass('c', { x: 0, y: 0 }));
    const l = classLayout(d);
    const a0 = l.rows.get('a0')!;
    expect(memberCenterY(d, 'a0')).toBe(a0.top + CLS.rowH / 2);
    expect(memberCenterY(d, undefined)).toBe(CLS.headerH / 2);
    expect(memberCenterY(d, 'nope')).toBe(CLS.headerH / 2);
  });
  it('nextMemberId skips non-numeric ids and starts at 0', () => {
    const d = classOf(blankClass('c', { x: 0, y: 0 }));
    expect(nextMemberId({ attributes: [], operations: [] }, 'a')).toBe('a0');
    expect(nextMemberId({ attributes: [{ id: 'weird', visibility: '', name: 'x' }, { id: 'a4', visibility: '', name: 'y' }], operations: d.operations }, 'a')).toBe('a5');
    expect(nextMemberId(d, 'o')).toBe('o1');
  });
  it('enum / interface compartments and blank kinds', () => {
    const e = classOf(blankClass('e', { x: 0, y: 0 }, 'enum'));
    expect(shownCompartments(e)).toEqual(['attributes']);
    expect(e.operations).toEqual([]);
    const i = classOf(blankClass('i', { x: 0, y: 0 }, 'interface', 'Svc'));
    expect(i.label).toBe('Svc');
    expect(shownCompartments(i)).toEqual(['operations']);
    expect(classOf(blankClass('a', { x: 0, y: 0 }, 'abstract')).operations[0].abstract).toBe(true);
  });
  it('collapsed compartment shortens the node', () => {
    const d = classOf(blankClass('c', { x: 0, y: 0 }));
    expect(classLayout({ ...d, collapsedAttributes: true, collapsedOperations: true }).height).toBeLessThan(classLayout(d).height);
  });
});
