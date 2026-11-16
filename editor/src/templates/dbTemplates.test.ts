import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { serializeDiagram, parseDiagram } from '../lib/serialization';
import { nodeSize } from '../lib/graph';
import { computeRoutes, DEFAULT_ROUTING } from '../lib/routing';
import { BUILTIN_SETTINGS } from '../lib/settings';
import { relationOf } from '../lib/er/tableData';

const DB = ALL_TEMPLATES.filter((t) => t.id.startsWith('db-'));

describe('DB schema templates', () => {
  it('registers the eight schemas with db / er / schema tags', () => {
    expect(DB.map((t) => t.id)).toEqual(['db-saas-multitenant', 'db-banking-ledger', 'db-chat', 'db-ride-hailing', 'db-lms', 'db-hotel-booking', 'db-social-network', 'db-inventory']);
    for (const t of DB) expect(t.tags, t.id).toEqual(expect.arrayContaining(['db', 'er', 'schema']));
  });
  for (const t of DB) {
    describe(t.name, () => {
      const d = t.build();
      const tables = d.nodes.filter((n) => n.type === 'table');
      it('has 7+ tables, 6+ relations and valid serialization', () => {
        expect(tables.length).toBeGreaterThanOrEqual(7);
        expect(d.edges.length).toBeGreaterThanOrEqual(6);
        expect(new Set(d.nodes.map((n) => n.id)).size).toBe(d.nodes.length);
        expect(parseDiagram(serializeDiagram(d)).ok).toBe(true);
      });
      it('lays out without overlap and routes every relation', () => {
        const rs = d.nodes.map((n) => ({ ...n.position, ...nodeSize(n) }));
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i], b = rs[j];
            expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
          }
        const routes = computeRoutes(d.nodes, d.edges, { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node });
        for (const e of d.edges) expect(routes.has(e.id)).toBe(true);
        expect(d.edges.every((e) => relationOf(e))).toBe(true);
      });
    });
  }
  it('the social network has a self-referencing follows junction', () => {
    const d = DB[6].build();
    expect(d.edges.filter((e) => e.source === e.target).length).toBeGreaterThanOrEqual(1);
  });
});
