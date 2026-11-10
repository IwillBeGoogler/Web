import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { umlEdge } from '../uml/edges';
import { deploymentNode } from './nodes';
import { nestInDeploymentNode, tidyDeployment, unnestDeployment } from './tidy';

const dn = (id: string, x: number, y: number, kind: 'node' | 'artifact' | 'device' = 'node', extra: Partial<DiagramNode> = {}) => ({ ...deploymentNode(id, { x, y }, kind, id), ...extra }) as DiagramNode;

describe('tidyDeployment', () => {
  it('null without deployment elements', () => {
    expect(tidyDeployment([], [])).toBeNull();
    expect(tidyDeployment([{ id: 'c', type: 'class', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode], [])).toBeNull();
  });
  it('lays left to right from the top-left origin, keeps sizes and foreign nodes', () => {
    const a = dn('a', 500, 300), b = dn('b', 700, 400, 'node', { width: 222, height: 111 });
    const other = { id: 'z', type: 'class', position: { x: 1, y: 2 }, data: {} } as unknown as DiagramNode;
    const r = tidyDeployment([a, b, other], [umlEdge('e', 'a', 'b', { kind: 'communication' })])!;
    expect(r.count).toBe(2);
    const na = r.nodes.find((n) => n.id === 'a')!, nb = r.nodes.find((n) => n.id === 'b')!;
    expect(na.position.x).toBeLessThan(nb.position.x);
    expect(Math.min(na.position.x, nb.position.x)).toBe(500);
    expect(Math.min(na.position.y, nb.position.y)).toBe(300);
    expect(r.nodes.find((n) => n.id === 'z')).toBe(other);
  });
  it('containers sized around children; nested relative; parent outside model treated top level', () => {
    const p = dn('p', 100, 100), k = dn('k', 5, 5, 'artifact', { parentId: 'p' });
    const grp = { id: 'g', type: 'group', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode;
    const t = dn('t', 300, 300, 'node', { parentId: 'g' });
    const r = tidyDeployment([grp, p, k, t], [])!;
    const np = r.nodes.find((n) => n.id === 'p')!, nk = r.nodes.find((n) => n.id === 'k')!;
    expect(np.data).toMatchObject({ container: true });
    expect(np.style).toMatchObject({ width: np.width, height: np.height });
    expect(nk.position.y).toBeGreaterThanOrEqual(44);
    expect(nk.parentId).toBe('p');
    expect(r.nodes.find((n) => n.id === 't')!.position.x).toBeGreaterThanOrEqual(100);
    expect(r.nodes.find((n) => n.id === 'g')).toBe(grp);
  });
  it('size callback ignores nodes with only one dimension', () => {
    const a = dn('a', 0, 0, 'node', { width: 400, height: undefined });
    expect(tidyDeployment([a], [])!.count).toBe(1);
  });
});

describe('nestInDeploymentNode', () => {
  it('null when nothing nestable', () => {
    expect(nestInDeploymentNode([dn('a', 0, 0)], ['x'], 'N')).toBeNull();
    expect(nestInDeploymentNode([dn('a', 0, 0, 'node', { parentId: 'q' })], ['a'], 'N')).toBeNull();
    expect(nestInDeploymentNode([{ id: 'c', type: 'class', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode], ['c'], 'N')).toBeNull();
  });
  it('wraps selection in container, children relative, defaults when size unset', () => {
    const a = dn('a', 100, 100, 'node', { width: 100, height: 50, selected: true }), b = dn('b', 300, 200);
    const r = nestInDeploymentNode([a, b, dn('c', 0, 0)], ['a', 'b'], 'N')!;
    const box = r.find((n) => n.id === 'N')!;
    expect(box.selected).toBe(true);
    expect(box.position).toEqual({ x: 72, y: 56 });
    expect(box.width).toBe(300 + 160 - 100 + 56);
    expect(box.data).toMatchObject({ container: true, depKind: 'node' });
    const ra = r.find((n) => n.id === 'a')!;
    expect(ra).toMatchObject({ parentId: 'N', selected: false, position: { x: 28, y: 44 } });
    expect(r.find((n) => n.id === 'c')!.parentId).toBeUndefined();
    expect(r.findIndex((n) => n.id === 'N')).toBeLessThan(r.findIndex((n) => n.id === 'a'));
  });
});

describe('branch extras', () => {
  it('container without style gets one; nest handles single dimension and missing style', () => {
    const p = dn('p', 0, 0), k = dn('k', 0, 0, 'artifact', { parentId: 'p' });
    delete (p as { style?: unknown }).style;
    expect(tidyDeployment([p, k], [])!.nodes[0].style).toMatchObject({ width: expect.any(Number) });
    const a = dn('a', 0, 0, 'node', { width: 300, height: undefined }), b = dn('b', 0, 0, 'node', { width: undefined, height: 300 });
    const r = nestInDeploymentNode([a, b], ['a', 'b'], 'N')!;
    expect(r.find((n) => n.id === 'N')!.width).toBe(300 + 56);
    expect(r.find((n) => n.id === 'N')!.height).toBe(300 + 72);
  });
});

describe('unnestDeployment', () => {
  it('null when nothing nested', () => {
    expect(unnestDeployment([dn('a', 0, 0)], ['a'])).toBeNull();
    expect(unnestDeployment([dn('a', 0, 0, 'node', { parentId: 'g' })], ['a'])).toBeNull();
    const g = { id: 'g', type: 'group', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode;
    expect(unnestDeployment([g, dn('a', 0, 0, 'node', { parentId: 'g' })], ['a'])).toBeNull();
  });
  it('moves out to absolute position; emptied parent loses container and resizes; non-empty keeps', () => {
    const p = dn('p', 100, 100); (p.data as Record<string, unknown>).container = true; p.width = 700; p.height = 600;
    const k = dn('k', 10, 20, 'artifact', { parentId: 'p' });
    const other = dn('o', 0, 0);
    const r = unnestDeployment([p, k, other], ['k'])!;
    const nk = r.find((n) => n.id === 'k')!;
    expect(nk.parentId).toBeUndefined();
    expect(nk.position).toEqual({ x: 110, y: 120 });
    const np = r.find((n) => n.id === 'p')!;
    expect((np.data as { container?: boolean }).container).toBeUndefined();
    expect(np.width).toBe(160);
    expect(r.find((n) => n.id === 'o')).toBe(other);

    const p2 = dn('p', 100, 100); (p2.data as Record<string, unknown>).container = true;
    const r2 = unnestDeployment([p2, dn('k', 1, 1, 'artifact', { parentId: 'p' }), dn('k2', 2, 2, 'artifact', { parentId: 'p' })], ['k'])!;
    expect(r2.find((n) => n.id === 'p')!.data).toMatchObject({ container: true });
  });
});
