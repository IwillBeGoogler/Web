import { describe, expect, it } from 'vitest';
import { actorNode, boundaryNode, componentNode, defaultRelation, shapeSize, useCaseNode, withShapeSize } from './nodes';
import { umlEdge, umlEnds, withUml } from '../uml/edges';
import { stateNode, compositeNode } from '../state/convert';

describe('use case nodes', () => {
  it('actor is a tall stick figure, use case an ellipse that grows with its label', () => {
    const a = actorNode('a', { x: 0, y: 0 }, 'Customer');
    expect(a.type).toBe('usecase');
    expect(a.data.ucKind).toBe('actor');
    expect(a.height!).toBeGreaterThan(a.width!);
    const s = useCaseNode('u', { x: 0, y: 0 }, 'Pay');
    const l = useCaseNode('v', { x: 0, y: 0 }, 'Place an order with a saved payment method');
    expect(l.width!).toBeGreaterThan(s.width!);
    expect(s.data.ucKind).toBe('usecase');
  });
  it('system boundary is a titled container (group variant boundary)', () => {
    const b = boundaryNode('b', { x: 0, y: 0 }, 'Shop', 400, 300);
    expect(b.type).toBe('group');
    expect(b.data.variant).toBe('boundary');
  });
  it('relations: include / extend are dashed open arrows with a stereotype label, generalization a hollow triangle', () => {
    expect(umlEnds({ kind: 'include' })).toEqual({ start: 'none', end: 'open', dashed: true });
    expect(umlEnds({ kind: 'extend' }).dashed).toBe(true);
    expect(umlEnds({ kind: 'generalization' })).toMatchObject({ end: 'hollowTriangle', dashed: false });
    expect(umlEnds({ kind: 'association' }).end).toBe('none');
    expect(umlEdge('e', 'a', 'b', { kind: 'include' }).label).toBe('«include»');
    expect(umlEdge('e', 'a', 'b', { kind: 'extend' }).label).toBe('«extend»');
    expect(umlEdge('e', 'a', 'b', { kind: 'association' }).label).toBeUndefined();
  });
  it('changing the kind swaps the stereotype label unless the user wrote one', () => {
    const e = umlEdge('e', 'a', 'b', { kind: 'include' });
    expect(withUml(e, { kind: 'extend' }).label).toBe('«extend»');
    expect(withUml(e, { kind: 'association' }).label).toBeUndefined();
    expect(withUml({ ...e, label: 'my text' }, { kind: 'extend' }).label).toBe('my text');
  });
});

describe('component nodes', () => {
  it('component, node and artifact boxes; lollipop and socket are small', () => {
    const c = componentNode('c', { x: 0, y: 0 }, 'component', 'Orders');
    const n = componentNode('n', { x: 0, y: 0 }, 'node', 'Server');
    const art = componentNode('r', { x: 0, y: 0 }, 'artifact', 'app.war');
    const p = componentNode('p', { x: 0, y: 0 }, 'provided', 'IOrders');
    const q = componentNode('q', { x: 0, y: 0 }, 'required', 'IPay');
    for (const x of [c, n, art]) expect(x.width!).toBeGreaterThanOrEqual(130);
    expect(p.width!).toBeLessThan(40);
    expect(q.height!).toBeLessThan(40);
    expect(shapeSize('component', c.data)).toEqual({ width: c.width, height: c.height });
    expect(withShapeSize({ ...c, data: { ...c.data, label: 'A very long component name for sizing' } }).width!).toBeGreaterThan(c.width!);
  });
  it('default relation by node pair', () => {
    const a = actorNode('a', { x: 0, y: 0 }, 'A'), b = actorNode('b', { x: 0, y: 0 }, 'B');
    const u = useCaseNode('u', { x: 0, y: 0 }, 'U'), v = useCaseNode('v', { x: 0, y: 0 }, 'V');
    expect(defaultRelation(a, u)).toBe('association');
    expect(defaultRelation(a, b)).toBe('generalization');
    expect(defaultRelation(u, v)).toBe('include');
    const c = componentNode('c', { x: 0, y: 0 }, 'component', 'C'), d = componentNode('d', { x: 0, y: 0 }, 'component', 'D');
    const p = componentNode('p', { x: 0, y: 0 }, 'provided', 'I'), q = componentNode('q', { x: 0, y: 0 }, 'required', 'I');
    expect(defaultRelation(c, d)).toBe('dependency');
    expect(defaultRelation(c, p)).toBe('assembly');
    expect(defaultRelation(q, p)).toBe('assembly');
    const s1 = stateNode('s1', { x: 0, y: 0 }, { label: 'A' }), s2 = compositeNode('s2', { x: 0, y: 0 }, 'B');
    expect(defaultRelation(s1, s2)).toBe('transition');
    expect(defaultRelation(s1, c)).toBeUndefined();
  });
});
