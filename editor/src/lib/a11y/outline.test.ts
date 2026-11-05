import { describe, expect, it } from 'vitest';
import { buildOutline } from './outline';
import type { DiagramEdge, DiagramNode } from '../../types';

const node = (id: string, label: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label }, ...extra });
const edge = (id: string, source: string, target: string, label?: string): DiagramEdge => ({ id, source, target, ...(label ? { label } : {}), data: {} } as DiagramEdge);

describe('buildOutline', () => {
  const pages = [{ id: 'p1', name: 'Overview' }, { id: 'p2', name: 'Details' }];
  const content = {
    p1: { nodes: [node('a', 'API', 0, 0), node('b', 'DB', 300, 0)], edges: [edge('e1', 'a', 'b', 'reads')] },
    p2: { nodes: [node('c', 'Cache')], edges: [] as DiagramEdge[] },
  };
  const tree = buildOutline(pages, 'p1', (id) => content[id as 'p1' | 'p2']);

  it('lists pages > nodes > connections', () => {
    expect(tree.map((p) => p.name)).toEqual(['Overview', 'Details']);
    expect(tree[0].active).toBe(true);
    expect(tree[0].nodes.map((n) => n.label)).toEqual(['API', 'DB']);
    expect(tree[0].nodes[0].connections).toEqual([{ id: 'e1', text: 'API to DB, reads', direction: 'out', otherId: 'b' }]);
    expect(tree[0].nodes[1].connections).toEqual([{ id: 'e1', text: 'DB from API, reads', direction: 'in', otherId: 'a' }]);
  });
  it('falls back to a readable label for unnamed nodes and counts connections', () => {
    const t = buildOutline([{ id: 'p', name: 'P' }], 'p', () => ({ nodes: [node('x', ''), node('y', 'Y')], edges: [edge('e', 'x', 'y')] }));
    expect(t[0].nodes[0].label).toBe('Unnamed icon');
    expect(t[0].nodes[0].connections[0].text).toBe('Unnamed icon to Y');
  });
  it('nests nodes under their group', () => {
    const t = buildOutline([{ id: 'p', name: 'P' }], 'p', () => ({ nodes: [node('g', 'VPC', 0, 0, { type: 'group' }), node('i', 'Web', 10, 10, { parentId: 'g' })], edges: [] }));
    expect(t[0].nodes[0].label).toBe('VPC');
    expect(t[0].nodes[0].children.map((c) => c.label)).toEqual(['Web']);
    expect(t[0].nodes).toHaveLength(1);
  });
});
