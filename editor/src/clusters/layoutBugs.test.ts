import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { useDiagramStore } from '../store/diagramStore';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from '../lib/routing';
import { segmentIntersectsRect, type Rect } from '../lib/routing/geometry';
import { resolveSettings } from '../lib/settings';
import { isContainer } from '../lib/graph';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const opts = () => ({ ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge });
const hit = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const topRects = () => s().nodes.filter((n) => !n.parentId && !n.hidden).map((n) => [n.id, rectOf(s().nodes, n)] as const);
const mongo = () => s().createCluster('mongodb', { mode: 'replica-set', members: 3, arbiter: false }, { x: 0, y: 0 })!;
const leaves = (root: string) => s().nodes.filter((n) => n.id.startsWith(root) && !isContainer(n));
beforeEach(() => s().reset());

describe('cluster placement never overlaps', () => {
  it('a new cluster dropped onto another one is moved clear of it', () => {
    const a = mongo();
    const b = s().createCluster('postgresql', {}, { x: 20, y: 230 })!;
    const ra = rectOf(s().nodes, s().nodes.find((n) => n.id === a)!);
    const rb = rectOf(s().nodes, s().nodes.find((n) => n.id === b)!);
    expect(hit(ra, rb)).toBe(false);
  });
  it('expanding a collapsed cluster pushes the siblings it would cover', () => {
    const a = mongo();
    s().toggleCollapse(a); // compact
    const b = s().createCluster('postgresql', {}, { x: 0, y: 160 })!;
    s().toggleCollapse(a); // expand: grows into b
    const all = topRects();
    for (const [i, [ida, ra]] of all.entries()) for (const [idb, rb] of all.slice(i + 1)) expect(hit(ra, rb), `${ida} x ${idb}`).toBe(false);
    void b;
  });
  it('collapsing a cluster whose neighbour was pushed keeps them apart', () => {
    const a = mongo();
    const b = s().createCluster('postgresql', {}, { x: 0, y: 400 })!;
    s().toggleCollapse(b);
    s().toggleCollapse(b);
    const all = topRects();
    for (const [i, [ida, ra]] of all.entries()) for (const [idb, rb] of all.slice(i + 1)) expect(hit(ra, rb), `${ida} x ${idb}`).toBe(false);
    void a;
  });
});

describe('mongodb replica set routing', () => {
  it('every member is as tall as its rendered content (role pill included)', () => {
    const a = mongo();
    for (const n of leaves(a)) expect(n.height).toBeGreaterThanOrEqual(116);
  });
  it('the first replica is reached by a direct horizontal line; the others never detour above the row', () => {
    const a = mongo();
    const routes = computeRoutes(s().nodes, s().edges, opts());
    const members = leaves(a);
    const rects = members.map((n) => rectOf(s().nodes, n));
    const top = Math.min(...rects.map((r) => r.y));
    const e1 = routes.get(s().edges[0].id)!;
    expect(e1.points).toHaveLength(2);
    expect(e1.points[0].y).toBe(e1.points[1].y);
    for (const e of s().edges) {
      const r = routes.get(e.id)!;
      for (const p of r.points) expect(p.y).toBeGreaterThanOrEqual(top);
      // no segment cuts through a member that is not an endpoint
      members.filter((m) => m.id !== e.source && m.id !== e.target).forEach((m) => {
        for (let i = 1; i < r.points.length; i++) expect(segmentIntersectsRect(r.points[i - 1], r.points[i], rectOf(s().nodes, m))).toBe(false);
      });
    }
  });
  it('member-to-member edges carry no label chip (the role pills and the dashed style say it)', () => {
    mongo();
    for (const e of s().edges) expect(e.label, e.id).toBeUndefined();
  });
});

describe('selection outline', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  it('a resizable selected cluster shows one outline (the resizer), not a second offset one', () => {
    expect(css).toMatch(/\.node-cluster\.selected\.resizable\s*\{[^}]*outline-color:\s*transparent/);
  });
  it('the collapsed stack layers stay inside the node box (edges attach at the visible border)', () => {
    for (const rule of ['.stack-1', '.stack-2']) {
      const m = new RegExp(`\\${rule}\\s*\\{([^}]*)\\}`).exec(css)!;
      expect(m[1], rule).not.toMatch(/(right|bottom):\s*-\d/);
    }
  });
});
void ({} as DiagramNode);
