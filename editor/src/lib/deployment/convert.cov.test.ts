import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { umlEdge } from '../uml/edges';
import { deploymentModelToDiagram, diagramToDeploymentModel, isDeploymentNode, withDeploymentSize } from './convert';
import { deploymentNode } from './nodes';
import type { DeploymentModel } from './types';

describe('deploymentModelToDiagram', () => {
  it('nests, offsets only top-levels, carries stereotype/icon/container, skips dangling links', () => {
    const model: DeploymentModel = {
      nodes: [
        { id: 'kid', name: 'k', kind: 'artifact', parent: 'srv', stereotype: 'jar', iconId: 'ic' },
        { id: 'srv', name: 'S', kind: 'node' },
        { id: 'orphan', name: 'O', kind: 'device', parent: 'ghost' },
      ],
      links: [
        { from: 'srv', to: 'orphan', kind: 'communication', label: 'http' },
        { from: 'kid', to: 'srv', kind: 'deploy' },
        { from: 'kid', to: 'nope', kind: 'manifest' },
      ],
    };
    const d = deploymentModelToDiagram(model, { x: 100, y: 200 });
    expect(d.nodes.map((n) => n.id)).toEqual(['dp1', 'dp2', 'dp3']);
    const srv = d.nodes.find((n) => n.data.label === 'S')!;
    const kid = d.nodes.find((n) => n.data.label === 'k')!;
    expect(kid.parentId).toBe(srv.id);
    expect(kid.data).toMatchObject({ stereotype: 'jar', iconId: 'ic' });
    expect(srv.data).toMatchObject({ container: true });
    expect(srv.position.x).toBeGreaterThanOrEqual(100);
    expect(kid.position.x).toBeLessThan(100 + 1000);
    expect(kid.position.x).toBeGreaterThanOrEqual(0);
    expect(kid.position.x).toBeLessThan(100);
    expect(srv.style).toMatchObject({ width: srv.width, height: srv.height });
    const orphan = d.nodes.find((n) => n.data.label === 'O')!;
    expect(orphan.parentId).toBeUndefined();
    expect(d.edges).toHaveLength(2);
    expect(d.edges[0].label).toBe('http');
  });
});

describe('diagramToDeploymentModel', () => {
  it('roundtrips, drops foreign kinds, default-label, dangling', () => {
    const p = deploymentNode('p', { x: 0, y: 0 }, 'node', 'P', { container: true });
    const a = { ...deploymentNode('a', { x: 0, y: 0 }, 'artifact', 'a.jar', { stereotype: 's', iconId: 'i' }), parentId: 'p' } as DiagramNode;
    const out = { ...deploymentNode('o', { x: 0, y: 0 }, 'device', 'O'), parentId: 'missing' } as DiagramNode;
    const cls = { id: 'c', type: 'class', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode;
    const edges: DiagramEdge[] = [
      umlEdge('e1', 'a', 'p', { kind: 'deploy' }, { label: '«deploy»' }),
      umlEdge('e2', 'p', 'o', { kind: 'communication' }, { label: 'ssh' }),
      umlEdge('e3', 'p', 'o', { kind: 'manifest' }, { label: 5 as unknown as string }),
      umlEdge('e4', 'p', 'o', { kind: 'association' }),
      umlEdge('e5', 'p', 'c', { kind: 'deploy' }),
      { id: 'e6', source: 'p', target: 'o' } as DiagramEdge,
    ];
    const m = diagramToDeploymentModel([p, a, out, cls], edges);
    expect(m.nodes).toEqual([
      { id: 'p', name: 'P', kind: 'node' },
      { id: 'a', name: 'a.jar', kind: 'artifact', stereotype: 's', iconId: 'i', parent: 'p' },
      { id: 'o', name: 'O', kind: 'device' },
    ]);
    expect(m.links).toEqual([
      { from: 'a', to: 'p', kind: 'deploy' },
      { from: 'p', to: 'o', kind: 'communication', label: 'ssh' },
      { from: 'p', to: 'o', kind: 'manifest' },
    ]);
  });
  it('re-exports', () => {
    expect(isDeploymentNode(deploymentNode('x', { x: 0, y: 0 }))).toBe(true);
    expect(isDeploymentNode(undefined)).toBe(false);
    expect(typeof withDeploymentSize).toBe('function');
  });
});
