import { describe, expect, it } from 'vitest';
import { buildHeroLayout, dashPolyline, HERO_LABELS, labelAnchor, packetCount, PITCH_X, PITCH_Y, ribbon, roundCorners, TILE, tileRect, type HeroVariant } from './heroLayout';
import { CAM_Z, FOV_DESKTOP, FOV_MOBILE, fitTiltedBox } from './cameraMap';

const overlap = (a: ReturnType<typeof tileRect>, b: ReturnType<typeof tileRect>, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
const segHitsRect = (p: { x: number; y: number }, q: { x: number; y: number }, r: ReturnType<typeof tileRect>) => {
  // sample the segment (axis-aligned or short arcs): dense sampling is plenty for a clearance test
  const n = Math.max(2, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.02));
  for (let i = 0; i <= n; i++) {
    const x = p.x + ((q.x - p.x) * i) / n;
    const y = p.y + ((q.y - p.y) * i) / n;
    if (x > r.x + 1e-6 && x < r.x + r.width - 1e-6 && y > r.y + 1e-6 && y < r.y + r.height - 1e-6) return true;
  }
  return false;
};

for (const variant of ['desktop', 'phone'] as HeroVariant[]) {
  describe(`hero layout (${variant})`, () => {
    const L = buildHeroLayout(variant);
    it('tiles never overlap and keep breathing room (>= 0.6 tile between neighbours)', () => {
      for (let i = 0; i < L.tiles.length; i++) for (let j = i + 1; j < L.tiles.length; j++) {
        expect(overlap(tileRect(L.tiles[i]), tileRect(L.tiles[j]), 0.6 * TILE * 0.5), `${L.tiles[i].id} vs ${L.tiles[j].id}`).toBe(false);
      }
    });
    it('tile ids are unique and sizes uniform except the (larger) Kubernetes tile', () => {
      expect(new Set(L.tiles.map((t) => t.id)).size).toBe(L.tiles.length);
      for (const t of L.tiles) expect(t.size).toBeCloseTo(t.id === 'k8s' ? TILE * 1.25 : TILE);
    });
    it('every flow connects existing tiles, with a real route that starts / ends on tile edges', () => {
      const byId = new Map(L.tiles.map((t) => [t.id, t]));
      expect(L.flows.length).toBeGreaterThanOrEqual(variant === 'phone' ? 5 : 8);
      for (const f of L.flows) {
        const a = byId.get(f.from)!;
        const b = byId.get(f.to)!;
        expect(a, f.id).toBeTruthy();
        expect(b, f.id).toBeTruthy();
        expect(f.points.length).toBeGreaterThanOrEqual(2);
        const onEdge = (p: { x: number; y: number }, t: typeof a) => {
          const r = tileRect(t);
          const near = (u: number, v: number) => Math.abs(u - v) < 0.12;
          const inX = p.x >= r.x - 0.12 && p.x <= r.x + r.width + 0.12;
          const inY = p.y >= r.y - 0.12 && p.y <= r.y + r.height + 0.12;
          return inX && inY && (near(p.x, r.x) || near(p.x, r.x + r.width) || near(p.y, r.y) || near(p.y, r.y + r.height));
        };
        expect(onEdge(f.points[0], a), `${f.id} start`).toBe(true);
        expect(onEdge(f.points[f.points.length - 1], b), `${f.id} end`).toBe(true);
      }
    });
    it('routes are orthogonal, never cross a tile that is not one of their endpoints, and have no stubs past the end tile', () => {
      for (const f of L.flows) {
        for (let i = 1; i < f.points.length; i++) expect(Math.abs(f.points[i].x - f.points[i - 1].x) < 1e-6 || Math.abs(f.points[i].y - f.points[i - 1].y) < 1e-6, `${f.id} orthogonal`).toBe(true);
        for (const t of L.tiles.filter((x) => x.id !== f.from && x.id !== f.to)) {
          const r = tileRect(t);
          for (const path of [f.points, f.path]) for (let i = 1; i < path.length; i++) expect(segHitsRect(path[i - 1], path[i], r), `${f.id} crosses ${t.id}`).toBe(false);
        }
        // the line may only touch its own two tiles at the ends (no poking through / out past the far side)
        for (const own of [L.tiles.find((x) => x.id === f.from)!, L.tiles.find((x) => x.id === f.to)!]) {
          const r = tileRect(own);
          for (let i = 1; i < f.points.length; i++) expect(segHitsRect(f.points[i - 1], f.points[i], r), `${f.id} runs through ${own.id}`).toBe(false);
        }
      }
    });
    it('rounded paths keep the end points and stay close to the raw route', () => {
      for (const f of L.flows) {
        expect(f.path[0]).toEqual(f.points[0]);
        expect(f.path.at(-1)).toEqual(f.points.at(-1));
        expect(f.path.length).toBeGreaterThanOrEqual(f.points.length);
      }
    });
    it('every plate wraps its members and nothing else', () => {
      for (const p of L.plates) {
        const r = { x: p.x - p.width / 2, y: p.y - p.height / 2, width: p.width, height: p.height };
        const inside = L.tiles.filter((t) => { const q = tileRect(t); return q.x >= r.x && q.y >= r.y && q.x + q.width <= r.x + r.width && q.y + q.height <= r.y + r.height; }).map((t) => t.id).sort();
        expect(inside).toEqual(['k8s', 'kafka', 'mongo', 'postgres', 'redis']);
      }
    });
    it('every hero node has a label, and the label sits inside the layout bounds', () => {
      for (const t of L.tiles) {
        expect(t.label, t.id).toBe(HERO_LABELS[t.id]);
        expect(t.label.length).toBeGreaterThan(0);
        const a = labelAnchor(t);
        expect(a.y).toBeLessThan(t.y - t.size / 2);
        expect(a.y).toBeGreaterThan(L.bounds.y0);
      }
    });
    it('the plate also contains the labels of its members', () => {
      for (const p of L.plates) for (const id of ['k8s', 'kafka', 'postgres', 'redis', 'mongo']) {
        const t = L.tiles.find((x) => x.id === id)!;
        expect(labelAnchor(t).y - 0.2).toBeGreaterThanOrEqual(p.y - p.height / 2);
      }
    });
    it('the grid pitch leaves >= 1.6 tile widths between column / row centres', () => {
      expect(PITCH_X / TILE).toBeGreaterThanOrEqual(1.6);
      expect(PITCH_Y / TILE).toBeGreaterThanOrEqual(1.6);
    });
    it('fit to viewport: all tiles stay inside the hero box for widths 360..2560 (tilted plane, with perspective)', () => {
      const w = L.bounds.x1 - L.bounds.x0;
      const h = L.bounds.y1 - L.bounds.y0;
      const sizes: [number, number][] = [[360, 780], [390, 844], [768, 1024], [1024, 700], [1280, 800], [1440, 900], [1920, 1080], [2560, 1300]];
      for (const [vw, vh] of sizes) {
        const mobile = vw < 760;
        const box = mobile ? { left: 0, top: 0, width: vw, height: vh * 0.45 } : { left: vw * 0.42, top: 0, width: vw * 0.58, height: Math.min(vh, 820) };
        const fit = fitTiltedBox(box, vw, vh, mobile ? FOV_MOBILE : FOV_DESKTOP, CAM_Z, w, h, -0.21, -0.26);
        expect(fit.widthPx, `${vw}x${vh}`).toBeLessThanOrEqual(box.width * 0.92 + 0.5);
        expect(fit.heightPx, `${vw}x${vh}`).toBeLessThanOrEqual(box.height * 0.92 + 0.5);
        expect(fit.scale).toBeGreaterThan(0);
        // centred in the box
        const cxPx = box.left + box.width / 2;
        expect(cxPx).toBeGreaterThan(0);
      }
    });
  });
}

describe('roundCorners', () => {
  it('keeps the ends, rounds the bends and never overshoots a short segment', () => {
    const r = roundCorners([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 0.28, 4);
    expect(r[0]).toEqual({ x: 0, y: 0 });
    expect(r.at(-1)).toEqual({ x: 1, y: 1 });
    expect(r.length).toBeGreaterThan(3);
    for (const p of r) expect(p.x >= -1e-9 && p.x <= 1 + 1e-9 && p.y >= -1e-9 && p.y <= 1 + 1e-9).toBe(true);
    const tight = roundCorners([{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }], 0.5, 4);
    for (const p of tight) expect(p.x <= 0.1 + 1e-9 && p.y <= 0.1 + 1e-9).toBe(true);
  });
});

describe('hero labels', () => {
  it('desktop labels cover the named stack', () => {
    const L = buildHeroLayout('desktop');
    expect(L.tiles.map((t) => t.label).sort()).toEqual(['Elastic', 'Grafana', 'Kafka', 'Kubernetes', 'MongoDB', 'PostgreSQL', 'Prometheus', 'Redis', 'Users', 'nginx']);
  });
});

describe('desktop grid', () => {
  it('observability row sits directly beneath the plate on the same columns as the tiers above', () => {
    const L = buildHeroLayout('desktop');
    const by = (id: string) => L.tiles.find((t) => t.id === id)!;
    const plate = L.plates[0];
    const obs = ['elastic', 'prom', 'grafana'].map(by);
    expect(new Set(obs.map((t) => t.y)).size).toBe(1);
    for (const t of obs) expect(t.y + t.size / 2).toBeLessThan(plate.y - plate.height / 2);
    // same columns: nginx / k8s / data tier
    expect(by('elastic').x).toBeCloseTo(by('nginx').x);
    expect(by('prom').x).toBeCloseTo(by('k8s').x);
    expect(by('grafana').x).toBeCloseTo(by('postgres').x);
    // tight: the gap between plate and the row is under one pitch
    expect(plate.y - plate.height / 2 - (obs[0].y + obs[0].size / 2)).toBeLessThan(PITCH_Y);
  });
});

describe('dashPolyline', () => {
  it('splits a polyline into dashes of the requested length, in order, ending on the path', () => {
    const d = dashPolyline([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 0.2, 0.1);
    expect(d.length).toBeGreaterThanOrEqual(6);
    expect(d[0][0]).toEqual({ x: 0, y: 0 });
    for (const seg of d) {
      let len = 0;
      for (let i = 1; i < seg.length; i++) len += Math.hypot(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y);
      expect(len).toBeLessThanOrEqual(0.2 + 1e-9);
    }
    // a dash may bend around the corner
    expect(d.some((s) => s.length > 2)).toBe(true);
  });
});

describe('ribbon (thin line as a quad strip)', () => {
  it('builds 2 vertices per point, 2 triangles per segment, with the requested width', () => {
    const r = ribbon([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 0.1);
    expect(r.positions.length).toBe(3 * 2 * 3);
    expect(r.indices.length).toBe(2 * 3 * 2);
    expect(Math.abs(r.positions[1] - r.positions[4])).toBeCloseTo(0.1); // y of the pair
  });
  it('degenerate input yields an empty strip', () => {
    expect(ribbon([{ x: 0, y: 0 }], 0.1).indices.length).toBe(0);
  });
});

describe('packetCount', () => {
  it('spaces packets evenly: longer flows get more, at least one, never above the cap', () => {
    expect(packetCount(0.5, 3)).toBe(1);
    expect(packetCount(6, 3)).toBe(2);
    expect(packetCount(30, 3, 4)).toBe(4);
  });
});
