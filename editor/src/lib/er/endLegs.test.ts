import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING } from '../routing';
import { BUILTIN_SETTINGS } from '../settings';
import { ER_MARKER_BOX } from '../arrow';
import { ALL_TEMPLATES } from '../../templates';

describe('crow-foot end legs', () => {
  it('first and last leg of every relation are at least as long as the 22px marker, so the marker points along the line', () => {
    for (const t of ALL_TEMPLATES.filter((x) => x.id.startsWith('er-'))) {
      const d = t.build();
      const routes = computeRoutes(d.nodes, d.edges, { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node });
      for (const e of d.edges) {
        if (e.source === e.target) continue;
        const p = routes.get(e.id)!.points;
        const len = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
        expect(len(p[0], p[1]), `${t.id}/${e.id} start`).toBeGreaterThanOrEqual(ER_MARKER_BOX.length);
        expect(len(p[p.length - 1], p[p.length - 2]), `${t.id}/${e.id} end`).toBeGreaterThanOrEqual(ER_MARKER_BOX.length);
      }
    }
  });
});
