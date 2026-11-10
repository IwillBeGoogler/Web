import { describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { deploymentSize, withDeploymentSize } from './sizes';
import { DEPLOYMENT_KINDS, DEPLOYMENT_LABEL, DEPLOYMENT_DEFAULT_NAME, DEPLOYMENT_LINK_KINDS, emptyDeploymentModel, isDepContainerKind } from './types';

describe('deploymentSize', () => {
  it('per kind heights and minimum widths', () => {
    expect(deploymentSize({ depKind: 'device', label: 'x' })).toEqual({ width: 160, height: 110 });
    expect(deploymentSize({ depKind: 'executionEnvironment', label: 'x' })).toEqual({ width: 150, height: 80 });
    expect(deploymentSize({ depKind: 'artifact', label: 'x' })).toEqual({ width: 130, height: 72 });
    expect(deploymentSize({ depKind: 'component', label: 'x' })).toEqual({ width: 150, height: 72 });
    expect(deploymentSize({ depKind: 'node', label: 'x' })).toEqual({ width: 160, height: 96 });
  });
  it('width grows with label and snaps to 10; missing label ok', () => {
    const w = deploymentSize({ depKind: 'node', label: 'a'.repeat(40) }).width;
    expect(w).toBe(Math.round((40 * 7.6 + 70) / 10) * 10);
    expect(w % 10).toBe(0);
    expect(deploymentSize({ depKind: 'node' }).width).toBe(160);
  });
});

describe('withDeploymentSize', () => {
  const node = (data: Record<string, unknown>, extra: Partial<DiagramNode> = {}) => ({ id: 'n', type: 'deployment', position: { x: 0, y: 0 }, data, ...extra }) as unknown as DiagramNode;
  it('container with size is kept as is', () => {
    const n = node({ label: 'x', depKind: 'node', container: true }, { width: 500, height: 400 });
    expect(withDeploymentSize(n)).toBe(n);
  });
  it('container without size, or plain node, gets computed size and style', () => {
    const c = withDeploymentSize(node({ label: 'x', depKind: 'node', container: true }, { width: 500 }));
    expect(c.width).toBe(160);
    expect(c.style).toMatchObject({ width: 160, height: 96 });
    const p = withDeploymentSize(node({ label: 'x', depKind: 'artifact' }, { width: 999, height: 999, style: { color: 'red' } }));
    expect(p).toMatchObject({ width: 130, height: 72, style: { color: 'red', width: 130, height: 72 } });
  });
});

describe('types', () => {
  it('constants and helpers', () => {
    expect(DEPLOYMENT_KINDS.filter(isDepContainerKind)).toEqual(['node', 'device', 'executionEnvironment']);
    expect(isDepContainerKind('artifact')).toBe(false);
    expect(Object.keys(DEPLOYMENT_LABEL)).toEqual(DEPLOYMENT_KINDS);
    expect(DEPLOYMENT_DEFAULT_NAME.artifact).toBe('artifact.jar');
    expect(DEPLOYMENT_LINK_KINDS).toContain('manifest');
    expect(emptyDeploymentModel()).toEqual({ nodes: [], links: [] });
  });
});
