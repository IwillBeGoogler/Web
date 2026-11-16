import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from '../lib/routing';
import { BUILTIN_SETTINGS } from '../lib/settings';
import { ALL_TEMPLATES } from './index';

const opts = { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node, umlAnchorRows: true };

/** true when the polyline passes through the inside of the rect (touching the border at an end does not count) */
const crosses = (pts: { x: number; y: number }[], r: { x: number; y: number; width: number; height: number }, shrink = 3) => {
  const x0 = r.x + shrink, x1 = r.x + r.width - shrink, y0 = r.y + shrink, y1 = r.y + r.height - shrink;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
    if (hi.x > x0 && lo.x < x1 && hi.y > y0 && lo.y < y1) return true;
  }
  return false;
};

describe('UML template routes', () => {
  it('uml-repository: no relation line runs through a class it does not connect', () => {
    const d = ALL_TEMPLATES.find((t) => t.id === 'uml-repository')!.build();
    const routes = computeRoutes(d.nodes, d.edges, opts);
    const bad: string[] = [];
    for (const e of d.edges) {
      const r = routes.get(e.id);
      if (!r) continue;
      for (const n of d.nodes) {
        if (n.id === e.source || n.id === e.target || n.type !== 'class') continue;
        if (crosses(r.points, rectOf(d.nodes, n))) bad.push(`${e.source}->${e.target} crosses ${n.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
