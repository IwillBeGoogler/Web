import { describe, expect, it } from 'vitest';
import { makeBenchPage, makeBenchProject, BENCH_SIZES } from './fixture';

describe('benchmark fixture', () => {
  it('produces the requested node count with valid, deterministic edges', () => {
    const a = makeBenchPage(500);
    const b = makeBenchPage(500);
    expect(a.nodes).toHaveLength(500);
    expect(a.edges.length).toBeGreaterThan(500);
    const ids = new Set(a.nodes.map((n) => n.id));
    expect(ids.size).toBe(500);
    for (const e of a.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
      expect(e.source).not.toBe(e.target);
    }
    expect(new Set(a.edges.map((e) => e.id)).size).toBe(a.edges.length);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // same input, same fixture
  });
  it('nodes do not overlap (a grid with gutters)', () => {
    const { nodes } = makeBenchPage(300);
    const keys = new Set(nodes.map((n) => `${n.position.x},${n.position.y}`));
    expect(keys.size).toBe(300);
  });
  it('wraps a page into a valid project and exposes the 5k / 10k sizes', () => {
    expect(BENCH_SIZES).toEqual([5000, 10000]);
    const p = makeBenchProject(50);
    expect(p.pages[0].nodes).toHaveLength(50);
    expect(p.activePageId).toBe(p.pages[0].id);
  });
});
