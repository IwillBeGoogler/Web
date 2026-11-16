import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { parseDiagram, serializeDiagram } from '../lib/serialization';
import { nodeSize } from '../lib/graph';
import { computeRoutes, DEFAULT_ROUTING } from '../lib/routing';
import { BUILTIN_SETTINGS } from '../lib/settings';

const SD = ALL_TEMPLATES.filter((t) => t.id.startsWith('sd-'));
const opts = { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node };

describe('system design templates', () => {
  it('registers the eight classics', () => {
    expect(SD.map((t) => t.id)).toEqual(expect.arrayContaining(['sd-url-shortener', 'sd-chat', 'sd-news-feed', 'sd-rate-limiter', 'sd-video-streaming', 'sd-ride-hailing', 'sd-notification', 'sd-web-crawler']));
    for (const t of SD) expect(t.tags, t.id).toEqual(expect.arrayContaining(['system-design', 'architecture']));
  });
  for (const t of SD) {
    describe(t.name, () => {
      const d = t.build();
      it('has a title, 8+ nodes, valid ids and edges, and survives a round trip', () => {
        expect(d.nodes.some((n) => n.type === 'text')).toBe(true);
        expect(d.nodes.length).toBeGreaterThanOrEqual(8);
        const ids = new Set(d.nodes.map((n) => n.id));
        expect(ids.size).toBe(d.nodes.length);
        for (const e of d.edges) { expect(ids.has(e.source), e.id).toBe(true); expect(ids.has(e.target), e.id).toBe(true); expect(e.data?.lineType, e.id).toBeUndefined(); }
        expect(parseDiagram(serializeDiagram(d)).ok).toBe(true);
      });
      it('siblings do not overlap and every edge is routed', () => {
        const rs = d.nodes.map((n) => ({ n, ...n.position, ...nodeSize(n) }));
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i], b = rs[j];
            if (a.n.parentId !== b.n.parentId || a.n.type === 'group' || b.n.type === 'group') continue;
            expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, `${a.n.id}/${b.n.id}`).toBe(false);
          }
        const routes = computeRoutes(d.nodes, d.edges, opts);
        for (const e of d.edges) expect(routes.has(e.id), e.id).toBe(true);
      });
    });
  }
});
