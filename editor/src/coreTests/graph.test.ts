import { describe, expect, it } from 'vitest';
import { addEdges, addNodes, deleteElements, slugId, uniqueId, updateNode } from '@core/graph';
import type { CPage } from '@core/types';

const page = (): CPage => ({ id: 'p', name: 'P', nodes: [], edges: [] });

describe('ids', () => {
  it('slugId', () => {
    expect(slugId('Hello  World!')).toBe('hello-world');
    expect(slugId('!!!')).toBe('node');
    expect(slugId('', 'x')).toBe('x');
    expect(slugId('a'.repeat(80))).toHaveLength(48);
  });
  it('uniqueId', () => {
    expect(uniqueId('a', new Set())).toBe('a');
    expect(uniqueId('a', new Set(['a', 'a-2']))).toBe('a-3');
  });
});

describe('addNodes', () => {
  it('validates label, id clash, parent, icon, cluster', () => {
    const p = page();
    addNodes(p, [{ id: 'g', label: 'G', type: 'group' }, { id: 'n', label: 'N' }]);
    const { added, errors } = addNodes(p, [
      { label: '  ' },
      { id: 'n', label: 'dup' },
      { label: 'x', parent: 'n' },
      { label: 'x', icon: 'definitely-not-an-icon-zzz' },
      { label: 'x', icon: 'cluster-kafka' },
      { label: 'ok', parent: 'g', icon: 'user' },
    ]);
    expect(errors.map((e) => e.message)).toEqual([
      'label is required',
      'node id "n" already exists',
      'parent "n" is not a group on this page',
      'unknown icon "definitely-not-an-icon-zzz" (use search_catalog)',
      '"cluster-kafka" is a cluster profile; add its member icons instead',
    ]);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ parentId: 'g', data: { iconId: 'user' }, position: { x: 24, y: 60 } });
  });
  it('group icon gets group type and size; explicit sizes and positions; subtitle', () => {
    const p = page();
    const { added } = addNodes(p, [
      { label: 'Acct', icon: 'aws-group-aws-account', x: 1, y: 2 },
      { label: 'S', subtitle: 'sub', width: 10, height: 20, data: { k: 1 } },
    ]);
    expect(added[0]).toMatchObject({ type: 'group', width: 360, height: 240, position: { x: 1, y: 2 }, data: { groupIcon: 'aws-group-aws-account' } });
    expect(added[1]).toMatchObject({ width: 10, height: 20, data: { subtitle: 'sub', k: 1 } });
  });
  it('auto placement under existing nodes, wraps at five per row; parent placement wraps at three', () => {
    const p = page();
    addNodes(p, [{ id: 'a', label: 'a', x: 50, y: 0, height: 100 }]);
    const { added } = addNodes(p, Array.from({ length: 6 }, (_, i) => ({ label: `n${i}` })));
    expect(added[0].position).toEqual({ x: 50, y: 160 });
    expect(added[5].position.y).toBe(160 + 96 + 60);
    const q = page();
    addNodes(q, [{ id: 'g', label: 'g', type: 'group' }]);
    const kids = addNodes(q, Array.from({ length: 4 }, (_, i) => ({ label: `k${i}`, parent: 'g' }))).added;
    expect(kids[3].position).toEqual({ x: 24, y: 180 });
    expect(addNodes(page(), [{ label: 'first' }]).added[0].position).toEqual({ x: 0, y: 0 });
  });
  it('duplicate labels get unique ids', () => {
    const p = page();
    const { added } = addNodes(p, [{ label: 'Same' }, { label: 'Same' }]);
    expect(added.map((n) => n.id)).toEqual(['same', 'same-2']);
  });
  it('accepts cluster parent', () => {
    const p = page();
    p.nodes.push({ id: 'c', type: 'cluster', position: { x: 0, y: 0 }, data: { label: 'c' } });
    expect(addNodes(p, [{ label: 'k', parent: 'c' }]).errors).toEqual([]);
  });
});

describe('addEdges', () => {
  it('validates and builds', () => {
    const p = page();
    addNodes(p, [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }]);
    const { added, errors } = addEdges(p, [
      { source: 'a', target: 'zz' },
      { source: 'zz', target: 'b' },
      { id: 'e1', source: 'a', target: 'b', label: 'L', preset: 'p', dashed: true, data: { x: 1 } },
      { id: 'e1', source: 'a', target: 'b' },
      { source: 'a', target: 'b' },
      { source: 'a', target: 'b' },
    ]);
    expect(errors.map((e) => e.message)).toEqual(['node "zz" not found', 'node "zz" not found', 'edge id "e1" already exists']);
    expect(added[0]).toEqual({ id: 'e1', source: 'a', target: 'b', label: 'L', data: { x: 1, preset: 'p', dashed: true } });
    expect(added[1]).toEqual({ id: 'e-a-b', source: 'a', target: 'b' });
    expect(added[2].id).toBe('e-a-b-2');
  });
});

describe('updateNode', () => {
  const mk = () => {
    const p = page();
    addNodes(p, [{ id: 'a', label: 'a', x: 1, y: 2 }]);
    return p;
  };
  it('throws on unknown node / icon', () => {
    expect(() => updateNode(mk(), 'q', {})).toThrow(/not found/);
    expect(() => updateNode(mk(), 'a', { icon: 'nope-zzz' })).toThrow(/unknown icon/);
    expect(() => updateNode(mk(), 'a', { icon: 'cluster-kafka' })).toThrow(/unknown icon/);
  });
  it('patches everything', () => {
    const n = updateNode(mk(), 'a', { icon: 'user', data: { z: 1 }, label: 'L', subtitle: 'S', x: 9, width: 5, height: 6 });
    expect(n).toMatchObject({ position: { x: 9, y: 2 }, width: 5, height: 6, data: { iconId: 'user', z: 1, label: 'L', subtitle: 'S' } });
    expect(updateNode(mk(), 'a', { y: 7 }).position).toEqual({ x: 1, y: 7 });
    expect(updateNode(mk(), 'a', { icon: 'aws-group-aws-account' }).data.groupIcon).toBe('aws-group-aws-account');
  });
});

describe('deleteElements', () => {
  it('removes descendants and attached edges, and edges by id', () => {
    const p = page();
    addNodes(p, [{ id: 'g', label: 'g', type: 'group' }, { id: 'c', label: 'c', type: 'group', parent: 'g' }, { id: 'd', label: 'd', parent: 'c' }, { id: 'o', label: 'o' }]);
    addEdges(p, [{ id: 'e1', source: 'd', target: 'o' }, { id: 'e2', source: 'o', target: 'o' }]);
    expect(deleteElements(p, ['g', 'e2', 'nope'])).toEqual({ nodes: 3, edges: 2 });
    expect(p.nodes.map((n) => n.id)).toEqual(['o']);
  });
});
