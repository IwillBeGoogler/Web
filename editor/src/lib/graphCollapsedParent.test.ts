import { describe, expect, it } from 'vitest';
import { canNest, resolveParent } from './graph';
import type { DiagramNode } from '../types';

const cluster = (id: string, x: number, y: number, collapsed: boolean): DiagramNode => ({ id, type: 'cluster', position: { x, y }, width: 232, height: 132, data: { label: id, collapsed } });

describe('collapsed clusters never adopt children', () => {
  it('a group dropped with its centre over a collapsed cluster card stays at the root', () => {
    const yb = cluster('yb', 0, 0, true);
    const box: DiagramNode = { id: 'do', type: 'group', position: { x: -60, y: 20 }, width: 360, height: 100, data: { label: 'Digital Ocean' } };
    expect(canNest([yb, box], box, 'yb')).toBe(false);
    expect(resolveParent([yb, box], box).parentId).toBeUndefined();
  });
  it('a leaf dropped on a collapsed card is not hidden inside it', () => {
    const yb = cluster('yb', 0, 0, true);
    const leaf: DiagramNode = { id: 'a', type: 'icon', position: { x: 60, y: 30 }, width: 100, height: 60, data: { label: 'a' } };
    expect(resolveParent([yb, leaf], leaf).parentId).toBeUndefined();
  });
  it('an expanded cluster still takes members', () => {
    const c = cluster('c', 0, 0, false);
    const leaf: DiagramNode = { id: 'a', type: 'icon', position: { x: 60, y: 30 }, width: 100, height: 60, data: { label: 'a' } };
    expect(resolveParent([c, leaf], leaf).parentId).toBe('c');
  });
});

import { detachFromCollapsed } from './graph';
describe('detachFromCollapsed (repair of older files)', () => {
  it('lifts a visible node out of a collapsed card, keeping its place; hidden members stay', () => {
    const yb: DiagramNode = { id: 'yb', type: 'cluster', position: { x: 100, y: 100 }, width: 232, height: 132, data: { label: 'yb', collapsed: true } };
    const member: DiagramNode = { id: 'm', type: 'icon', parentId: 'yb', hidden: true, position: { x: 10, y: 10 }, data: { label: 'm' } };
    const box: DiagramNode = { id: 'do', type: 'group', parentId: 'yb', position: { x: -40, y: -20 }, width: 400, height: 300, data: { label: 'DO' } };
    const inBox: DiagramNode = { id: 'deb', type: 'icon', parentId: 'do', position: { x: 5, y: 5 }, data: { label: 'deb' } };
    const out = detachFromCollapsed([yb, member, box, inBox]);
    const b = out.find((n) => n.id === 'do')!;
    expect(b.parentId).toBeUndefined();
    expect(b.position).toEqual({ x: 60, y: 80 });
    expect(out.find((n) => n.id === 'm')!.parentId).toBe('yb');
    expect(out.find((n) => n.id === 'deb')!.parentId).toBe('do');
  });
});
