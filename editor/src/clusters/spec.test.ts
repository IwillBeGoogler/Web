import { describe, expect, it } from 'vitest';
import { comp, defineSpecProfile, grp, num, withExporter, type ClusterSpec } from './spec';

type A = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const base = (): ClusterSpec<A> => ({
  id: 't', tech: 'T', label: 'T', iconId: 'service', accent: '#000', category: 'Databases', topologies: ['mesh'], roles: ['data'],
  fields: [num('n', 'Nodes', 1, 6, 4)],
  groups: [grp('g', 'nodes', [comp('node', 'node', (p) => p.n, { role: 'data' })])],
  links: [{ from: 'node', to: 'node', mode: 'mesh' }],
});

describe('spec link mode "mesh"', () => {
  it('links every unordered pair exactly once', () => {
    const g = defineSpecProfile<A>(base()).generate({ n: 4 }, 'c');
    expect(g.edges).toHaveLength(6);
    const keys = g.edges.map((e) => [e.source, e.target].sort().join('|'));
    expect(new Set(keys).size).toBe(6);
  });
  it('single node: no edges', () => {
    expect(defineSpecProfile<A>(base()).generate({ n: 1 }, 'c').edges).toHaveLength(0);
  });
});

describe('withExporter (optional metrics sidecar)', () => {
  const spec = withExporter(base(), { target: 'node', port: 9100, label: 'node-exporter' });
  const p = defineSpecProfile<A>(spec);
  it('adds a boolean field, off by default, no node when off', () => {
    expect(p.fields.find((f) => f.key === 'exporter')).toMatchObject({ type: 'boolean', default: false });
    expect(p.generate(p.defaults, 'c').nodes.some((n) => n.data.label?.startsWith('node-exporter'))).toBe(false);
  });
  it('when on: one exporter outside the cluster scraping the first node with port in label', () => {
    const g = p.generate({ ...p.defaults, exporter: true }, 'c');
    const ex = g.nodes.find((n) => n.data.label?.startsWith('node-exporter'))!;
    expect(ex.data.label).toContain(':9100');
    expect(ex.parentId).toBeUndefined();
    expect(g.edges.some((e) => e.source === ex.id && e.label === 'scrape')).toBe(true);
    expect(p.summarize({ ...p.defaults, exporter: true })).toMatch(/exporter/);
  });
});

describe('spec link mode "ring" and dynamic group layout', () => {
  const ring = (): ClusterSpec<A> => ({ ...base(), groups: [grp('g', 'nodes', [comp('node', 'node', (p) => p.n)], { layout: (p) => (p.n > 2 ? 'ring' : 'rows') })], links: [{ from: 'node', to: 'node', mode: 'ring' }] });
  it('closes the chain from last back to first (n>2), no duplicate for n=2', () => {
    const p = defineSpecProfile<A>(ring());
    const g = p.generate({ n: 4 }, 'c');
    expect(g.edges).toHaveLength(4);
    expect(g.edges.some((e) => e.source === 'c-node-4' && e.target === 'c-node-1')).toBe(true);
    expect(p.generate({ n: 2 }, 'c').edges).toHaveLength(1);
  });
  it('layout may be a function of params', () => {
    const p = defineSpecProfile<A>(ring());
    const pos = (n: number) => p.generate({ n }, 'c').nodes.filter((x) => x.type === 'icon').map((x) => x.position);
    expect(new Set(pos(5).map((q) => Math.round(q.y))).size).toBeGreaterThan(2);
    expect(new Set(pos(2).map((q) => Math.round(q.y))).size).toBe(1);
  });
});
