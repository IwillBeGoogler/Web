import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { parseDiagram, serializeDiagram } from '../lib/serialization';
import { nodeSize } from '../lib/graph';
import { computeRoutes, DEFAULT_ROUTING } from '../lib/routing';
import { BUILTIN_SETTINGS } from '../lib/settings';

const LLD = ALL_TEMPLATES.filter((t) => t.id.startsWith('lld-'));
const opts = { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node };

describe('LLD class-diagram templates', () => {
  it('registers five designs with uml / lld tags', () => {
    expect(LLD.map((t) => t.name)).toEqual(['LLD — Parking lot', 'LLD — Library', 'LLD — Elevator', 'LLD — ATM', 'LLD — Hotel booking']);
    for (const t of LLD) expect(t.tags, t.id).toEqual(expect.arrayContaining(['uml', 'class', 'oop', 'ood', 'lld']));
  });
  for (const t of LLD) {
    describe(t.name, () => {
      const d = t.build();
      const classes = d.nodes.filter((n) => n.type === 'class');
      it('has 5-9 classes, valid ids and edges, and survives a round trip', () => {
        expect(classes.length).toBeGreaterThanOrEqual(5);
        expect(classes.length).toBeLessThanOrEqual(9);
        const ids = new Set(d.nodes.map((n) => n.id));
        expect(ids.size).toBe(d.nodes.length);
        for (const e of d.edges) { expect(ids.has(e.source), e.id).toBe(true); expect(ids.has(e.target), e.id).toBe(true); }
        expect(parseDiagram(serializeDiagram(d)).ok).toBe(true);
      });
      it('lays out without overlap and routes every edge', () => {
        const rs = d.nodes.map((n) => ({ id: n.id, ...n.position, ...nodeSize(n) }));
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i], b = rs[j];
            expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, `${a.id}/${b.id}`).toBe(false);
          }
        const routes = computeRoutes(d.nodes, d.edges, opts);
        for (const e of d.edges) expect(routes.has(e.id), e.id).toBe(true);
      });
    });
  }
});
