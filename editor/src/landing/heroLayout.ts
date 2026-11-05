// Data-driven layout of the landing hero: a tidy left-to-right architecture on a plane. Pure (no three.js): tests check it.
import type { DiagramEdge, DiagramNode } from '../types';
import { computeRoutes, DEFAULT_ROUTING } from '../lib/routing';
import { resolveSettings } from '../lib/settings';

export type HeroVariant = 'desktop' | 'phone';
export type FlowKind = 'request' | 'metrics' | 'logs';
export type Side = 'top' | 'right' | 'bottom' | 'left';
export interface Pt { x: number; y: number }

export interface TileDef { id: string; icon: string; col: number; row: number; /** 1 = standard tile */ scale?: number }
export interface FlowDef { id: string; from: string; to: string; kind: FlowKind; out: Side; into: Side }
export interface PlateDef { id: string; label: string; icon: string; members: string[] }

/** tile edge length and grid pitch, world units (pitch >= 1.6 tile widths) */
export const TILE = 1.15;
export const PITCH_X = 2.5;
export const PITCH_Y = 2.0;
const PX = 100; // router pixels per world unit

/** short names drawn under every hero tile */
export const HERO_LABELS: Record<string, string> = {
  users: 'Users', nginx: 'nginx', k8s: 'Kubernetes', kafka: 'Kafka', postgres: 'PostgreSQL', redis: 'Redis', mongo: 'MongoDB', prom: 'Prometheus', grafana: 'Grafana', elastic: 'Elastic',
};
/** world units reserved under a tile for its label */
export const LABEL_GAP = 0.2;
export const LABEL_ROOM = 0.5;

export const FLOW_COLORS: Record<FlowKind, number> = { request: 0x22c7d6, metrics: 0xff7a3d, logs: 0xa78bfa };

interface Spec { tiles: TileDef[]; flows: FlowDef[]; plates: PlateDef[] }

const DESKTOP: Spec = {
  tiles: [
    { id: 'users', icon: 'users', col: 0, row: 0 },
    { id: 'nginx', icon: 'nginx', col: 1, row: 0 },
    { id: 'k8s', icon: 'kubernetes', col: 2, row: 0, scale: 1.25 },
    { id: 'kafka', icon: 'kafka', col: 3, row: 1 },
    { id: 'postgres', icon: 'postgresql', col: 3, row: 0 },
    { id: 'redis', icon: 'redis', col: 3, row: -1 },
    { id: 'mongo', icon: 'mongodb', col: 4, row: 1 },
    { id: 'elastic', icon: 'elasticsearch', col: 1, row: -2.6 },
    { id: 'prom', icon: 'prometheus', col: 2, row: -2.6 },
    { id: 'grafana', icon: 'grafana', col: 3, row: -2.6 },
  ],
  flows: [
    { id: 'f-users', from: 'users', to: 'nginx', kind: 'request', out: 'right', into: 'left' },
    { id: 'f-nginx', from: 'nginx', to: 'k8s', kind: 'request', out: 'right', into: 'left' },
    { id: 'f-kafka', from: 'k8s', to: 'kafka', kind: 'request', out: 'right', into: 'left' },
    { id: 'f-pg', from: 'k8s', to: 'postgres', kind: 'request', out: 'right', into: 'left' },
    { id: 'f-redis', from: 'k8s', to: 'redis', kind: 'request', out: 'right', into: 'left' },
    { id: 'f-mongo', from: 'kafka', to: 'mongo', kind: 'request', out: 'right', into: 'left' },
    { id: 'f-prom', from: 'k8s', to: 'prom', kind: 'metrics', out: 'bottom', into: 'top' },
    { id: 'f-graf', from: 'prom', to: 'grafana', kind: 'metrics', out: 'right', into: 'left' },
    { id: 'f-logs', from: 'k8s', to: 'elastic', kind: 'logs', out: 'bottom', into: 'top' },
  ],
  plates: [{ id: 'aws', label: 'AWS', icon: 'aws', members: ['k8s', 'kafka', 'postgres', 'redis', 'mongo'] }],
};

/** phone: 7 nodes in 3 compact rows (request path, then the data tier, then the stream sink); no observability, no plate */
const PHONE: Spec = {
  tiles: [
    { id: 'users', icon: 'users', col: 0, row: 0 },
    { id: 'nginx', icon: 'nginx', col: 0.9, row: 0 },
    { id: 'k8s', icon: 'kubernetes', col: 1.8, row: 0, scale: 1.25 },
    { id: 'postgres', icon: 'postgresql', col: 0, row: -1.25 },
    { id: 'redis', icon: 'redis', col: 0.9, row: -1.25 },
    { id: 'kafka', icon: 'kafka', col: 1.8, row: -1.25 },
    { id: 'mongo', icon: 'mongodb', col: 1.8, row: -2.4 },
  ],
  flows: [
    { id: 'f-users', from: 'users', to: 'nginx', kind: 'request', out: 'right', into: 'left' },
    { id: 'f-nginx', from: 'nginx', to: 'k8s', kind: 'request', out: 'right', into: 'left' },
    { id: 'f-pg', from: 'k8s', to: 'postgres', kind: 'request', out: 'bottom', into: 'top' },
    { id: 'f-redis', from: 'k8s', to: 'redis', kind: 'request', out: 'bottom', into: 'top' },
    { id: 'f-kafka', from: 'k8s', to: 'kafka', kind: 'request', out: 'bottom', into: 'top' },
    { id: 'f-mongo', from: 'kafka', to: 'mongo', kind: 'request', out: 'bottom', into: 'top' },
  ],
  plates: [],
};

export interface Tile { id: string; icon: string; label: string; x: number; y: number; size: number }
export interface Flow { id: string; from: string; to: string; kind: FlowKind; color: number; /** orthogonal route, world coords (y up) */ points: Pt[]; /** same route with rounded corners, densely sampled */ path: Pt[] }
export interface Plate { id: string; label: string; icon: string; x: number; y: number; width: number; height: number }
export interface HeroLayout { variant: HeroVariant; tiles: Tile[]; flows: Flow[]; plates: Plate[]; /** tight bounds around everything drawn */ bounds: { x0: number; y0: number; x1: number; y1: number } }

/** world position (centre-top of the text) of the label under a tile */
export const labelAnchor = (t: Tile): Pt => ({ x: t.x, y: t.y - t.size / 2 - LABEL_GAP });

export const tileRect = (t: Tile) => ({ x: t.x - t.size / 2, y: t.y - t.size / 2, width: t.size, height: t.size });

/** replace sharp corners by arcs of `radius` (world units), sampled with `steps` points per arc */
export function roundCorners(pts: Pt[], radius: number, steps = 6): Pt[] {
  if (pts.length < 3) return pts.map((p) => ({ ...p }));
  const out: Pt[] = [{ ...pts[0] }];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 1e-6) { out.push({ ...b }); continue; }
    const p1 = { x: b.x + ((a.x - b.x) / l1) * r, y: b.y + ((a.y - b.y) / l1) * r };
    const p2 = { x: b.x + ((c.x - b.x) / l2) * r, y: b.y + ((c.y - b.y) / l2) * r };
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // quadratic bezier p1 -> b -> p2
      out.push({ x: (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * b.x + t * t * p2.x, y: (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * b.y + t * t * p2.y });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

export function buildHeroLayout(variant: HeroVariant): HeroLayout {
  const spec = variant === 'phone' ? PHONE : DESKTOP;
  const tiles: Tile[] = spec.tiles.map((t) => ({ id: t.id, icon: t.icon, label: HERO_LABELS[t.id] ?? t.id, x: t.col * PITCH_X, y: t.row * PITCH_Y, size: TILE * (t.scale ?? 1) }));
  const byId = new Map(tiles.map((t) => [t.id, t]));

  // route on the plane with our own router (2D, y down), then flip to y up
  const nodes: DiagramNode[] = tiles.map((t) => ({ id: t.id, type: 'icon', position: { x: (t.x - t.size / 2) * PX, y: (-t.y - t.size / 2) * PX }, width: t.size * PX, height: t.size * PX, data: { label: t.id } }));
  const edges: DiagramEdge[] = spec.flows.map((f) => ({ id: f.id, source: f.from, target: f.to, data: { lineType: 'orthogonal', pinSource: f.out, pinTarget: f.into } }));
  const routes = computeRoutes(nodes, edges, { ...DEFAULT_ROUTING, pad: 16, budgetMs: 200, edgeDefaults: resolveSettings(undefined, undefined).edge });
  const flows: Flow[] = spec.flows.map((f) => {
    const r = routes.get(f.id);
    const a = byId.get(f.from)!;
    const b = byId.get(f.to)!;
    const points = (r?.points ?? [{ x: a.x * PX, y: -a.y * PX }, { x: b.x * PX, y: -b.y * PX }]).map((p) => ({ x: p.x / PX, y: -p.y / PX }));
    return { id: f.id, from: f.from, to: f.to, kind: f.kind, color: FLOW_COLORS[f.kind], points, path: roundCorners(points, 0.28) };
  });

  const plates: Plate[] = spec.plates.map((p) => {
    const ms = p.members.map((m) => byId.get(m)!);
    const pad = 0.55;
    const x0 = Math.min(...ms.map((m) => m.x - m.size / 2)) - pad;
    const x1 = Math.max(...ms.map((m) => m.x + m.size / 2)) + pad;
    const y0 = Math.min(...ms.map((m) => m.y - m.size / 2)) - pad - LABEL_ROOM; // the labels live inside the plate
    const y1 = Math.max(...ms.map((m) => m.y + m.size / 2)) + pad + 0.35; // room for the label
    return { id: p.id, label: p.label, icon: p.icon, x: (x0 + x1) / 2, y: (y0 + y1) / 2, width: x1 - x0, height: y1 - y0 };
  });

  const xs = [...tiles.flatMap((t) => [t.x - t.size / 2, t.x + t.size / 2]), ...plates.flatMap((p) => [p.x - p.width / 2, p.x + p.width / 2])];
  const ys = [...tiles.flatMap((t) => [t.y - t.size / 2 - LABEL_ROOM, t.y + t.size / 2]), ...plates.flatMap((p) => [p.y - p.height / 2, p.y + p.height / 2])];
  return { variant, tiles, flows, plates, bounds: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } };
}

/** split a polyline into dashes (`dash` long, `gap` apart, world units); a dash may bend around a corner */
export function dashPolyline(pts: Pt[], dash: number, gap: number): Pt[][] {
  const out: Pt[][] = [];
  if (pts.length < 2 || dash <= 0) return out;
  let cur: Pt[] = [{ ...pts[0] }];
  let drawing = true;
  let left = dash;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (seg > 1e-9) {
      const step = Math.min(left, seg);
      const t = step / seg;
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (drawing) cur.push(q);
      seg -= step;
      left -= step;
      a = q;
      if (left <= 1e-9) {
        if (drawing) { out.push(cur); cur = []; } else cur = [{ ...q }];
        drawing = !drawing;
        left = drawing ? dash : gap;
      }
    }
  }
  if (drawing && cur.length > 1) out.push(cur);
  return out;
}

/** a thin line as a triangle strip (2 vertices per point, miter-averaged normals): crisp `width`-wide lines regardless of GL line limits */
export function ribbon(pts: Pt[], width: number): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  if (pts.length < 2) return { positions, indices };
  const h = width / 2;
  const dir = (a: Pt, b: Pt) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
  for (let i = 0; i < pts.length; i++) {
    const d0 = dir(pts[Math.max(0, i - 1)], pts[i]);
    const d1 = dir(pts[i], pts[Math.min(pts.length - 1, i + 1)]);
    let nx = -(d0.y + d1.y);
    let ny = d0.x + d1.x;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    const m = Math.min(1 / Math.max(0.5, nx * -d1.y + ny * d1.x), 1.6); // miter length, clamped
    positions.push(pts[i].x + nx * h * m, pts[i].y + ny * h * m, 0, pts[i].x - nx * h * m, pts[i].y - ny * h * m, 0);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { positions, indices };
}

/** packets per flow: evenly spaced (`spacing` world units apart), at least 1, at most `cap` */
export const packetCount = (length: number, spacing: number, cap = 5): number => Math.max(1, Math.min(cap, Math.round(length / spacing)));
