import { describe, expect, it } from 'vitest';
import { blankClass } from '../uml/geometry';
import { instanceName, instantiateClass, isObjectNode, linkEdge, objectNode, slotsFromClass } from './nodes';
import { objectSize, withObjectSize } from './sizes';
import { emptyObjectModel, objectTitle, OBJECT_ACCENT } from './types';
import type { DiagramNode } from '../../types';

describe('object nodes', () => {
  it('isObjectNode / objectNode', () => {
    expect(isObjectNode(undefined)).toBe(false);
    const n = objectNode('o', { x: 1, y: 2 });
    expect(isObjectNode(n)).toBe(true);
    expect(n.data).toMatchObject({ label: 'object', slots: [], accent: OBJECT_ACCENT });
    expect(n.width).toBeGreaterThanOrEqual(150);
    const m = objectNode('o2', { x: 0, y: 0 }, 'x', { className: 'K' });
    expect(m.data).toMatchObject({ label: 'x', className: 'K' });
  });
  it('instanceName', () => {
    expect(instanceName('OrderItem')).toBe('orderItem');
    expect(instanceName('List<T>')).toBe('list');
    expect(instanceName('A-B c')).toBe('aBc');
    expect(instanceName('<T>')).toBe('object');
    expect(instanceName('')).toBe('object');
  });
  it('slotsFromClass skips blanks and enums', () => {
    const c = blankClass('c', { x: 0, y: 0 }, 'class', 'Order');
    (c.data as any).attributes = [{ id: 'a', name: ' id ' }, { id: 'b', name: '  ' }, { id: 'c', name: 'total' }];
    expect(slotsFromClass(c)).toEqual([{ id: 's0', name: 'id', value: '' }, { id: 's1', name: 'total', value: '' }]);
    expect(slotsFromClass(blankClass('e', { x: 0, y: 0 }, 'enum'))).toEqual([]);
  });
  it('instantiateClass names uniquely, places right of the class', () => {
    const c = { ...blankClass('c', { x: 100, y: 50 }, 'class', 'Order'), width: 200 } as DiagramNode;
    const o = instantiateClass(c, 'o1', new Set(['order', 'order1']));
    expect(o.data).toMatchObject({ label: 'order2', className: 'Order' });
    expect(o.position).toEqual({ x: 360, y: 50 });
    expect((o.data as any).slots).toHaveLength(1);
    const free = instantiateClass(c, 'o2', new Set(), { x: 0, y: 0 });
    expect(free.data.label).toBe('order');
    expect(free.position.x).toBe(260);
    const bare = blankClass('c', { x: 0, y: 0 });
    delete (bare as { width?: number }).width;
    expect(instantiateClass(bare, 'o3', new Set()).position.x).toBe(240);
  });
  it('linkEdge', () => {
    expect(linkEdge('l', 'a', 'b').label).toBeUndefined();
    const e = linkEdge('l', 'a', 'b', 'owns');
    expect(e).toMatchObject({ id: 'l', source: 'a', target: 'b', label: 'owns' });
    expect((e.data as any).uml.kind).toBe('link');
  });
});

describe('object sizes/types', () => {
  it('objectSize: no slots, many slots, wide slot caps at 420', () => {
    expect(objectSize({ label: 'a' })).toEqual({ width: 150, height: 38 });
    expect(objectSize({ label: 'a', slots: [{ id: '1', name: 'x', value: '' }, { id: '2', name: 'y', value: '2' }] })).toEqual({ width: 150, height: 36 + 8 + 44 + 2 });
    expect(objectSize({ label: 'a', slots: [{ id: '1', name: 'n'.repeat(100), value: 'v' }] }).width).toBe(420);
    expect(objectSize({ label: 'a', className: 'K'.repeat(40) }).width).toBeGreaterThan(150);
  });
  it('withObjectSize merges style', () => {
    const n = withObjectSize({ id: 'o', type: 'object', position: { x: 0, y: 0 }, data: { label: 'a', slots: [] }, style: { color: 'red' } } as unknown as DiagramNode);
    expect(n.style).toEqual({ color: 'red', width: 150, height: 38 });
    const m = withObjectSize({ id: 'o', type: 'object', position: { x: 0, y: 0 }, data: { label: 'a', slots: [] } } as unknown as DiagramNode);
    expect(m.style).toEqual({ width: 150, height: 38 });
  });
  it('types', () => {
    expect(emptyObjectModel()).toEqual({ objects: [], links: [] });
    expect(objectTitle({ label: 'a' })).toBe('a');
    expect(objectTitle({ label: 'a', className: 'K' })).toBe('a : K');
    expect(objectTitle({} as any)).toBe('');
  });
});
