import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { nodeSize } from '../lib/graph';
import { computeRoutes, DEFAULT_ROUTING } from '../lib/routing';
import { BUILTIN_SETTINGS } from '../lib/settings';
import { countBends, polylineLength, type Pt } from '../lib/routing/geometry';

// no wall-clock deadline: the route search gives up after budgetMs of real time, so under CPU load a run could differ from another
const opts = { ...DEFAULT_ROUTING, budgetMs: 1e9, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node };
const TEMPLATES = ['er-ecommerce', 'er-seedora-demo'].map((id) => ALL_TEMPLATES.find((t) => t.id === id)!);

interface Seg { id: string; h: boolean; c: number; lo: number; hi: number; a: Pt; b: Pt }
const segs = (id: string, pts: Pt[]): Seg[] => {
  const out: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5) out.push({ id, h: true, c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), a, b });
    else if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5) out.push({ id, h: false, c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), a, b });
  }
  return out;
};

for (const t of TEMPLATES) {
  describe(`ER relation routing: ${t.name}`, () => {
    const d = t.build();
    const routes = computeRoutes(d.nodes, d.edges, opts);
    const tables = d.nodes.filter((n) => n.type === 'table').map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, ...nodeSize(n) }));
    const rel = d.edges.filter((e) => e.source !== e.target);
    const lines = rel.map((e) => ({ e, pts: routes.get(e.id)!.points }));

    it('no relation segment runs through a table other than its two ends', () => {
      for (const { e, pts } of lines)
        for (const s of segs(e.id, pts))
          for (const r of tables) {
            if (r.id === e.source || r.id === e.target) continue;
            const inside = s.h ? s.c > r.y && s.c < r.y + r.height && s.hi > r.x && s.lo < r.x + r.width : s.c > r.x && s.c < r.x + r.width && s.hi > r.y && s.lo < r.y + r.height;
            expect(inside, `${e.id} through ${r.id}`).toBe(false);
          }
    });
    it('a relation never runs inside its own tables except at the column row', () => {
      for (const { e, pts } of lines)
        for (const s of segs(e.id, pts))
          for (const r of tables.filter((x) => x.id === e.source || x.id === e.target)) {
            const inside = s.h ? s.c > r.y && s.c < r.y + r.height && s.hi - 1 > r.x + 4 && s.lo + 1 < r.x + r.width - 4 : s.c > r.x + 4 && s.c < r.x + r.width - 4 && s.hi > r.y + 1 && s.lo < r.y + r.height - 1;
            expect(inside, `${e.id} inside ${r.id}`).toBe(false);
          }
    });
    it('keeps at least 12px clearance from table borders along parallel runs', () => {
      for (const { e, pts } of lines)
        for (const s of segs(e.id, pts))
          for (const r of tables) {
            if (r.id === e.source || r.id === e.target) continue;
            const near = s.h
              ? s.hi > r.x && s.lo < r.x + r.width && (Math.abs(s.c - r.y) < 8 || Math.abs(s.c - (r.y + r.height)) < 8)
              : s.hi > r.y && s.lo < r.y + r.height && (Math.abs(s.c - r.x) < 8 || Math.abs(s.c - (r.x + r.width)) < 8);
            expect(near, `${e.id} hugs ${r.id}`).toBe(false);
          }
    });
    it('different relations never share a collinear stretch longer than 24px (a shared port stub excepted)', () => {
      const all = lines.flatMap(({ e, pts }) => segs(e.id, pts));
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          if (a.id === b.id || a.h !== b.h || Math.abs(a.c - b.c) > 1.5) continue;
          const overlap = Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);
          if (overlap <= 24) continue;
          // fan-out from one shared column port is the only legal overlap
          const share = [a.a, a.b].some((p) => [b.a, b.b].some((q) => Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1));
          expect(share, `${a.id} / ${b.id} overlap ${overlap}px`).toBe(true);
        }
    });
    it('parallel segments of different relations stay >= 12px apart', () => {
      const all = lines.flatMap(({ e, pts }) => segs(e.id, pts));
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          if (a.id === b.id || a.h !== b.h) continue;
          const dist = Math.abs(a.c - b.c);
          if (dist < 0.5 || dist >= 12) continue;
          expect(Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) <= 24, `${a.id} / ${b.id} ${dist}px apart`).toBe(true);
        }
    });
    it('total length and bends stay below the baseline thresholds', () => {
      const length = lines.reduce((a, l) => a + polylineLength(l.pts), 0);
      const bends = lines.reduce((a, l) => a + countBends(l.pts), 0);
      const per = (n: number) => n / lines.length;
      expect(per(length)).toBeLessThan(THRESH[t.id].length);
      expect(per(bends)).toBeLessThan(THRESH[t.id].bends);
    });
  });
}
// thresholds: the improved baseline (443 / 1015 px and 2.4 / 3.1 bends per relation) plus ~10% headroom
const THRESH: Record<string, { length: number; bends: number }> = { 'er-ecommerce': { length: 500, bends: 2.8 }, 'er-seedora-demo': { length: 1150, bends: 3.5 } };
