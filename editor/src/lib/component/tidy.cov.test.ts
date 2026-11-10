import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { umlEdge } from '../uml/edges';
import { componentNode } from '../uml2/nodes';
import { nestInNode, tidyComponents, unnestComponents } from './tidy';

const cn = (id: string, x: number, y: number, kind: 'component' | 'node' = 'component', extra: Partial<DiagramNode> = {}) => ({ ...componentNode(id, { x, y }, kind, id), ...extra }) as DiagramNode;

describe('tidyComponents', () => {
  it('returns null without components', () => {
    expect(tidyComponents([], [])).toBeNull();
    expect(tidyComponents([componentNode('i', { x: 0, y: 0 }, 'provided')], [])).toBeNull();
  });
  it('lays clients left of providers, offset by top-left, keeps others untouched', () => {
    const a = cn('a', 500, 300), b = cn('b', 700, 400, 'component', { width: 200, height: 90 });
    const other = { id: 'z', type: 'class', position: { x: 1, y: 2 }, data: { label: 'z' } } as unknown as DiagramNode;
    const edges: DiagramEdge[] = [umlEdge('e', 'a', 'b', { kind: 'dependency' })];
    const r = tidyComponents([a, b, other], edges)!;
    expect(r.count).toBe(2);
    const na = r.nodes.find((n) => n.id === 'a')!, nb = r.nodes.find((n) => n.id === 'b')!;
    expect(na.position.x).toBeLessThan(nb.position.x);
    expect(Math.min(na.position.x, nb.position.x)).toBe(500);
    expect(Math.min(na.position.y, nb.position.y)).toBe(300);
    expect(r.nodes.find((n) => n.id === 'z')).toBe(other);
  });
  it('sizes containers around children and positions nested relative', () => {
    const p = cn('p', 100, 100, 'node');
    const k = cn('k', 5, 5, 'component', { parentId: 'p' });
    const r = tidyComponents([p, k], [])!;
    const np = r.nodes.find((n) => n.id === 'p')!, nk = r.nodes.find((n) => n.id === 'k')!;
    expect(np.width).toBeGreaterThan(150);
    expect((np.data as { container?: boolean }).container).toBe(true);
    expect(np.style).toMatchObject({ width: np.width, height: np.height });
    expect(nk.position.y).toBeGreaterThanOrEqual(52);
    expect(nk.width).toBe(150);
  });
});

describe('nestInNode', () => {
  it('returns null when nothing nestable is selected', () => {
    expect(nestInNode([cn('a', 0, 0)], ['x'], 'n')).toBeNull();
    expect(nestInNode([cn('a', 0, 0, 'component', { parentId: 'q' })], ['a'], 'n')).toBeNull();
    expect(nestInNode([componentNode('i', { x: 0, y: 0 }, 'provided')], ['i'], 'n')).toBeNull();
  });
  it('wraps selection in a new container, children relative, container selected', () => {
    const a = cn('a', 100, 100, 'component', { width: 100, height: 50, selected: true }), b = cn('b', 300, 200);
    const r = nestInNode([a, b, cn('c', 0, 0)], ['a', 'b'], 'N')!;
    const box = r.find((n) => n.id === 'N')!;
    expect(box.selected).toBe(true);
    expect(box.position).toEqual({ x: 72, y: 48 });
    expect((box.data as { compKind: string }).compKind).toBe('node');
    expect(box.width).toBe(300 + 150 - 100 + 56);
    const ra = r.find((n) => n.id === 'a')!;
    expect(ra.parentId).toBe('N');
    expect(ra.position).toEqual({ x: 28, y: 52 });
    expect(ra.selected).toBe(false);
    expect(r.find((n) => n.id === 'c')!.parentId).toBeUndefined();
    expect(r.findIndex((n) => n.id === 'N')).toBeLessThan(r.findIndex((n) => n.id === 'a'));
  });
});

describe('unnestComponents', () => {
  it('returns null when nothing nested selected', () => {
    expect(unnestComponents([cn('a', 0, 0)], ['a'])).toBeNull();
    expect(unnestComponents([cn('a', 0, 0, 'component', { parentId: 'g' })], ['a'])).toBeNull();
  });
  it('moves child to absolute position; empty parent loses container, non-empty keeps it', () => {
    const p = cn('p', 100, 100, 'node'); (p.data as Record<string, unknown>).container = true;
    const k = cn('k', 10, 20, 'component', { parentId: 'p' });
    const r = unnestComponents([p, k], ['k'])!;
    const nk = r.find((n) => n.id === 'k')!;
    expect(nk.parentId).toBeUndefined();
    expect(nk.position).toEqual({ x: 110, y: 120 });
    expect((r.find((n) => n.id === 'p')!.data as { container?: boolean }).container).toBeUndefined();

    const p2 = cn('p', 100, 100, 'node'); (p2.data as Record<string, unknown>).container = true;
    const k1 = cn('k', 1, 1, 'component', { parentId: 'p' }), k2 = cn('k2', 2, 2, 'component', { parentId: 'p' });
    const r2 = unnestComponents([p2, k1, k2], ['k'])!;
    expect(r2.find((n) => n.id === 'p')!.data).toMatchObject({ container: true });
    expect(r2.find((n) => n.id === 'k2')!.parentId).toBe('p');
  });
});

describe('tidy edge cases', () => {
  it('treats a node whose parent is not a component as top level', () => {
    const grp = { id: 'g', type: 'group', position: { x: 0, y: 0 }, data: { label: 'g' } } as unknown as DiagramNode;
    const a = cn('a', 40, 60, 'component', { parentId: 'g' });
    const r = tidyComponents([grp, a], [])!;
    expect(r.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 40, y: 60 });
  });
  it('nestInNode uses default size when width unset and ignores already nested', () => {
    const a = cn('a', 0, 0);
    const r = nestInNode([a], ['a'], 'N')!;
    expect(r.find((n) => n.id === 'N')!.width).toBe(150 + 56);
    expect(r.find((n) => n.id === 'N')!.height).toBe(72 + 52 + 28);
  });
});

describe('tidy branch extras', () => {
  it('unsized node and container without style still tidy', () => {
    const p = cn('p', 0, 0, 'node'), k = cn('k', 0, 0, 'component', { parentId: 'p' });
    delete (p as { style?: unknown }).style;
    delete (k as { width?: number }).width;
    const r = tidyComponents([p, k], [])!;
    expect(r.nodes.find((n) => n.id === 'p')!.style).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
    expect(r.nodes.find((n) => n.id === 'k')!.parentId).toBe('p');
  });
  it('nestInNode with only one dimension set', () => {
    const a = cn('a', 0, 0, 'component', { width: 300 }), b = cn('b', 0, 0, 'component', { height: 300 });
    delete (a as { height?: number }).height;
    delete (b as { width?: number }).width;
    const box = nestInNode([a, b], ['a', 'b'], 'N')!.find((n) => n.id === 'N')!;
    expect(box.width).toBe(300 + 56);
    expect(box.height).toBe(300 + 52 + 28);
  });
});
