import { describe, expect, it } from 'vitest';
import '../data/bootstrap';
import '../data/icons';
import { aws3Tier, azureWebApp, devopsCicd, gcpServerless, k8sApp, TEMPLATES } from './cloudTemplates';
import { ALL_TEMPLATES } from './index';
import { getRef } from '../data/icons/registry';
import { GENERIC_ICONS } from '../data/icons/generic';
import { parseDiagram, serializeDiagram } from '../lib/serialization';
import { absolutePosition, levelOf, nodeSize } from '../lib/graph';
import { overlaps } from '../lib/placement';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from '../lib/routing';
import { polylineIntersectsRects } from '../lib/routing/geometry';
import { resolveSettings } from '../lib/settings';
import { isContainer } from '../lib/graph';

const cases = [
  ['AWS 3-tier web app', aws3Tier, { nodes: 16, provider: 'aws' }],
  ['GCP serverless backend', gcpServerless, { nodes: 11, provider: 'gcp' }],
  ['Azure web app', azureWebApp, { nodes: 16, provider: 'azure' }],
  ['Kubernetes app', k8sApp, { nodes: 14, provider: 'k8s' }],
  ['DevOps CI/CD pipeline', devopsCicd, { nodes: 19, provider: '' }],
] as const;

const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
const known = (iconId?: string) => !!iconId && (!!getRef(iconId) || iconId in GENERIC_ICONS);

describe('cloud + devops templates', () => {
  it('are registered (so they appear in the home gallery and the Templates menu)', () => {
    for (const [name] of cases) expect(ALL_TEMPLATES.some((t) => t.name === name), name).toBe(true);
    expect(TEMPLATES).toHaveLength(5);
  });
  for (const [name, build, spec] of cases) {
    describe(name, () => {
      const t = build();
      it('has the expected size and every icon is a REAL pack icon (no initials badges)', () => {
        expect(t.nodes.length).toBe(spec.nodes);
        for (const n of t.nodes) {
          if (n.type === 'icon') expect(known(n.data.iconId), `${n.id} ${n.data.iconId}`).toBe(true);
          if (n.type === 'group' && n.data.groupIcon) expect(known(n.data.groupIcon as string), `${n.id} group icon`).toBe(true);
        }
        if (spec.provider) expect(t.nodes.some((n) => String(n.data.iconId ?? '').startsWith(spec.provider) || n.type === 'group'), 'uses the provider pack').toBe(true);
      });
      it('nests at most 3 levels, children inside their group, leaves never overlap', () => {
        for (const n of t.nodes.filter(isContainer)) expect(levelOf(t.nodes, n.id), n.id).toBeLessThanOrEqual(3);
        for (const n of t.nodes.filter((x) => x.parentId)) {
          const p = t.nodes.find((x) => x.id === n.parentId)!;
          const s = nodeSize(n);
          const ps = nodeSize(p);
          expect(n.position.x, `${n.id} x`).toBeGreaterThanOrEqual(0);
          expect(n.position.y, `${n.id} y`).toBeGreaterThanOrEqual(0);
          expect(n.position.x + s.width, `${n.id} right edge inside ${p.id}`).toBeLessThanOrEqual(ps.width);
          expect(n.position.y + s.height, `${n.id} bottom edge inside ${p.id}`).toBeLessThanOrEqual(ps.height);
        }
        const leaves = t.nodes.filter((n) => !isContainer(n));
        const box = (n: (typeof leaves)[number]) => ({ ...absolutePosition(t.nodes, n), ...nodeSize(n) });
        for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) expect(overlaps(box(leaves[i]), box(leaves[j]), 0), `${leaves[i].id} / ${leaves[j].id}`).toBe(false);
      });
      it('every edge is routed around nodes (no fallback, no crossing)', () => {
        const routes = computeRoutes(t.nodes, t.edges, opts);
        const ids = new Set(t.nodes.map((n) => n.id));
        for (const e of t.edges) {
          expect(ids.has(e.source) && ids.has(e.target), e.id).toBe(true);
          const r = routes.get(e.id)!;
          expect(r.routed, `${e.source}->${e.target} fell back`).toBe(true);
          const others = t.nodes.filter((n) => !isContainer(n) && n.id !== e.source && n.id !== e.target).map((n) => rectOf(t.nodes, n));
          expect(polylineIntersectsRects(r.points, others), `${e.source}->${e.target} crosses a node`).toBe(false);
        }
      });
      it('round-trips through serialization', () => {
        expect(parseDiagram(serializeDiagram(t)).ok).toBe(true);
        expect(new Set(t.nodes.map((n) => n.id)).size).toBe(t.nodes.length);
      });
    });
  }
});

describe('k8sApp edge labels do not collide with other lines or nodes', () => {
  it('every label box is clear of other edges and of icon nodes (SQL :5432 vs the dashed "scales" edge)', async () => {
    const { computeRoutes, DEFAULT_ROUTING, rectOf } = await import('../lib/routing');
    const { resolveSettings } = await import('../lib/settings');
    const { segmentIntersectsRect } = await import('../lib/routing/geometry');
    const d = k8sApp();
    const routes = computeRoutes(d.nodes, d.edges, { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge });
    const leaves = d.nodes.filter((n) => n.type === 'icon').map((n) => rectOf(d.nodes, n));
    const bad: string[] = [];
    for (const e of d.edges) {
      if (!e.label) continue;
      const r = routes.get(e.id)!;
      const w = String(e.label).length * 7 + 14; const h = 20;
      const box = { x: r.labelPt.x - w / 2, y: r.labelPt.y - h / 2, width: w, height: h };
      for (const o of d.edges) {
        if (o.id === e.id) continue;
        const pts = routes.get(o.id)!.points;
        for (let i = 1; i < pts.length; i++) if (segmentIntersectsRect(pts[i - 1], pts[i], box)) bad.push(`${e.label} x ${o.label ?? o.id}`);
      }
      for (const n of leaves) if (box.x < n.x + n.width && box.x + box.width > n.x && box.y < n.y + n.height && box.y + box.height > n.y) bad.push(`${e.label} on a node`);
    }
    expect(bad).toEqual([]);
  });
});
