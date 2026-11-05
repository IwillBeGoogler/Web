import { describe, expect, it } from 'vitest';
import { validateProject } from '../lib/project';
import { starterProject } from './starter';

describe('starterProject', () => {
  it('DB diagram: one table node with its columns', () => {
    const p = starterProject('erd', 'Orders')!;
    expect(validateProject(p).ok).toBe(true);
    const nodes = p.pages[0]!.nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ type: 'table', data: { label: 'users' } });
    expect((nodes[0]!.data as unknown as { columns: unknown[] }).columns).toHaveLength(4);
  });
  it('OOD diagram: one class node', () => {
    const p = starterProject('uml', 'Shapes')!;
    expect(validateProject(p).ok).toBe(true);
    expect(p.pages[0]!.nodes).toHaveLength(1);
    expect(p.pages[0]!.nodes[0]).toMatchObject({ type: 'class', data: { label: 'User' } });
  });
  it('system design and board start empty (server default)', () => {
    expect(starterProject('sdd', 'x')).toBeNull();
    expect(starterProject('board', 'x')).toBeNull();
  });
});
