import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { serializeDiagram, parseDiagram } from '../lib/serialization';
import { nodeSize } from '../lib/graph';
import { computeRoutes, DEFAULT_ROUTING } from '../lib/routing';
import { BUILTIN_SETTINGS } from '../lib/settings';
import { relationOf } from '../lib/er/tableData';

const ER = ALL_TEMPLATES.filter((t) => t.id.startsWith('er-'));

describe('ER templates', () => {
  it('registers e-commerce, blog and the Seedora demo', () => {
    expect(ER.map((t) => t.name)).toEqual(['ER — e-commerce', 'ER — blog', 'ER — Seedora demo']);
  });
  for (const t of ER) {
    describe(t.name, () => {
      const d = t.build();
      const tables = d.nodes.filter((n) => n.type === 'table');
      it('has tables with relations and valid serialization', () => {
        expect(tables.length).toBeGreaterThanOrEqual(7);
        expect(d.edges.length).toBeGreaterThanOrEqual(6);
        expect(parseDiagram(serializeDiagram(d)).ok).toBe(true);
      });
      it('lays tables out without overlap', () => {
        const rs = d.nodes.map((n) => ({ ...n.position, ...nodeSize(n) }));
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i], b = rs[j];
            expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
          }
      });
      it('routes every relation', () => {
        const routes = computeRoutes(d.nodes, d.edges, { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node });
        for (const e of d.edges) expect(routes.has(e.id)).toBe(true);
        expect(d.edges.every((e) => relationOf(e))).toBe(true);
      });
    });
  }
  it('the blog has a 1:1, a self reference, a junction and an enum', () => {
    const d = ER[1].build();
    expect(d.edges.some((e) => relationOf(e)?.cardinality === '1:1')).toBe(true);
    expect(d.edges.some((e) => e.source === e.target)).toBe(true);
    expect(d.nodes.some((n) => n.type === 'table' && (n.data as { tableKind?: string }).tableKind === 'enum')).toBe(true);
  });
});
