import { describe, expect, it } from 'vitest';
import { actorNode, boundaryNode, componentNode, defaultRelation, useCaseNode } from './nodes';
import type { DiagramNode } from '../../types';

const n = (type: string, data: object): DiagramNode => ({ id: 'x', type, position: { x: 0, y: 0 }, data } as unknown as DiagramNode);

describe('uml2 node factories', () => {
  it('actor / use case defaults and labels', () => {
    expect(actorNode('a', { x: 1, y: 2 }).data).toMatchObject({ label: 'Actor', ucKind: 'actor' });
    expect(useCaseNode('u', { x: 0, y: 0 }, 'Pay').data).toMatchObject({ label: 'Pay', ucKind: 'usecase' });
  });
  it('component kinds: names and facing only for interfaces', () => {
    expect(componentNode('c', { x: 0, y: 0 }).data).toMatchObject({ label: 'Component', compKind: 'component' });
    expect((componentNode('c', { x: 0, y: 0 }).data as Record<string, unknown>).facing).toBeUndefined();
    expect(componentNode('c', { x: 0, y: 0 }, 'artifact').data.label).toBe('artifact.jar');
    expect(componentNode('c', { x: 0, y: 0 }, 'node').data.label).toBe('Node');
    expect(componentNode('c', { x: 0, y: 0 }, 'provided').data).toMatchObject({ label: 'IProvided', facing: 'right' });
    expect(componentNode('c', { x: 0, y: 0 }, 'required', 'Mine').data).toMatchObject({ label: 'Mine', facing: 'right' });
  });
  it('boundary is a sized group', () => {
    const b = boundaryNode('b', { x: 0, y: 0 });
    expect(b).toMatchObject({ type: 'group', width: 420, height: 320, data: { variant: 'boundary', label: 'System' } });
    expect(boundaryNode('b', { x: 0, y: 0 }, 'S', 10, 20)).toMatchObject({ width: 10, height: 20 });
  });
});

describe('defaultRelation', () => {
  it('state-like pairs', () => {
    expect(defaultRelation(n('state', {}), n('state', {}))).toBe('transition');
  });
  it('activity notes', () => {
    expect(defaultRelation(n('activity', { actKind: 'action' }), n('activity', { actKind: 'action' }))).toBe('transition');
    expect(defaultRelation(n('activity', { actKind: 'note' }), n('activity', { actKind: 'action' }))).toBe('note');
    expect(defaultRelation(n('activity', { actKind: 'action' }), n('activity', { actKind: 'note' }))).toBe('note');
  });
  it('use cases', () => {
    const a = n('usecase', { ucKind: 'actor' }), u = n('usecase', { ucKind: 'usecase' });
    expect(defaultRelation(a, a)).toBe('generalization');
    expect(defaultRelation(u, u)).toBe('include');
    expect(defaultRelation(a, u)).toBe('association');
  });
  it('objects, packages', () => {
    expect(defaultRelation(n('object', {}), n('object', {}))).toBe('link');
    expect(defaultRelation({ ...n('group', { variant: 'package' }) }, n('group', { variant: 'package' }))).toBe('dependency');
  });
  it('deployment', () => {
    const art = n('deployment', { depKind: 'artifact' }), comp = n('deployment', { depKind: 'component' }), node = n('deployment', { depKind: 'node' });
    expect(defaultRelation(art, comp)).toBe('manifest');
    expect(defaultRelation(art, node)).toBe('deploy');
    expect(defaultRelation(node, art)).toBe('communication');
    expect(defaultRelation(art, art)).toBe('communication');
  });
  it('components: interface ports assemble', () => {
    const c = n('component', { compKind: 'component' }), p = n('component', { compKind: 'provided' }), r = n('component', { compKind: 'required' });
    expect(defaultRelation(c, c)).toBe('dependency');
    expect(defaultRelation(p, c)).toBe('assembly');
    expect(defaultRelation(c, r)).toBe('assembly');
  });
  it('mismatched types have no relation', () => {
    expect(defaultRelation(n('class', {}), n('usecase', {}))).toBeUndefined();
  });
});
