import type { DiagramEdge, DiagramNode } from '../../types';
import { absolutePosition, ancestorsOf, isContainer, nodeSize } from '../graph';
import { BUILTIN_SETTINGS, resolveEdgeStyle, type Settings } from '../settings';
import { arrowMetrics, markerBox, resolveMarkers, shortenEnds } from '../arrow';
import { MIN_END_SEGMENT, SIDES, center, countBends, ensureEndSegments, polylineIntersectsRects, isHorizontalSide, removeShortSegments, sideVector, inflate, segmentIntersectsRect, nearestSides, polylineLength, portPoint, type Port, type Pt, type Rect, type Side } from './geometry';
import { computeHops, curvedRoute, labelAnchor, labelPoint, polylineToPath } from './path';
import { distributePorts, parallelIndex, parallelOffset } from './ports';
import { orthogonalFromWaypoints } from './manual';
import { RectGrid } from './spatial';
import { smartRoute, stepRoute, DEFAULT_PAD } from './router';
import { placeLabels } from './labels';
import { MIN_TRACK_GAP, preferredSegs, separateTracks, type PreferredSeg } from './bundle';
import { isJunction } from '../junction';
import { portById, portOffsetPoint } from '../component/ports';
import type { ComponentData } from '../uml2/types';
import { anchorY, isTableRelation, relationSides, selfLoopPoints } from '../er/anchor';
import { umlOf } from '../uml/edges';
import { endLabels } from '../uml/labels';
import { nodeSelfLoop } from '../state/loop';
import { classOf, memberCenterY } from '../uml/geometry';
import { relationOf } from '../er/tableData';

/** ER relations: clearance kept around tables, bend cost and the cost factor for hugging a table border */
export const ER_CLEARANCE = 12;
export const ER_BEND = 90;
export const ER_BORDER = 0.8;
/** minimum distance between parallel segments of different relations */
export const ER_TRACK_GAP = 12;

/** above this many edges a page is routed in "fast" mode: a few ms per edge, no side-combination search (long edges may fall back to simple steps) */
export const FAST_ROUTING_EDGES = 3000;
export const FAST_BUDGET_MS = 3;
/** only nodes with this many edges (hubs) pay for the side-combination search when their routes run on top of other edges */
export const HUB_DEGREE = 5;

export interface RoutingOptions {
  jumps: boolean;
  cornerRadius: number;
  pad: number;
  keepManual: boolean;
  autoRoute: boolean;
  budgetMs: number;
  edgeDefaults: Settings['edge'];
  /** global node style: decides which icon nodes have a visible card (attach to the card, not the glyph) */
  nodeDefaults?: Settings['node'];
  /** UML class associations attach at the attribute row that holds the reference (default on) */
  umlAnchorRows?: boolean;
  now?: () => number;
}

export interface Route {
  points: Pt[];
  /** SVG path data */
  d: string;
  labelPt: Pt;
  src: Port;
  dst: Port;
  orthogonal: boolean;
  lineType: string;
  manual: boolean;
  /** true when the obstacle-avoiding router found the path (false = plain step fallback / straight / curved) */
  routed: boolean;
  /** px the drawn line is trimmed at the start / end so it stops at the arrowhead base (the tip stays on the attach point) */
  startCut: number;
  endCut: number;
}

export const rectOf = (nodes: DiagramNode[], n: DiagramNode): Rect => {
  const p = absolutePosition(nodes, n);
  const s = nodeSize(n);
  return { x: p.x, y: p.y, width: s.width, height: s.height };
};

/**
 * Incremental routing state. Pass the same cache to successive computeRoutes calls (one per drag frame): only edges
 * touching a moved node, or whose previous path ran near a moved node's old position / crosses its new one, are re-routed.
 */
export interface RouteCache {
  routes: Map<string, Route>;
  sigs: Map<string, string>;
  rects: Map<string, Rect>;
  /** edges re-routed / reused by the last computeRoutes call */
  recomputed: number;
  reused: number;
}
export const createRouteCache = (): RouteCache => ({ routes: new Map(), sigs: new Map(), rects: new Map(), recomputed: 0, reused: 0 });

const sameRect = (a: Rect | undefined, b: Rect) => !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const pathHits = (pts: Pt[], r: Rect) => {
  for (let i = 0; i < pts.length - 1; i++) if (segmentIntersectsRect(pts[i], pts[i + 1], r)) return true;
  return false;
};

/** px between a transparent icon's glyph box and where its edges start / their arrowheads end */
export const ATTACH_GAP = 4;
/** px between a visible card / shape / group border and where edges attach */
export const CARD_GAP = 3;
/** below this an orthogonal segment is merged away (a visible "jog") */
export const MIN_SEGMENT = 10;
/** facing ports closer than this (perpendicular) are snapped onto one straight line */
export const ALIGN_SNAP = 40; // facing ports closer than this snap onto one straight line (no small jogs)
export const ALIGN_SNAP_SHARED = 12; // same, when a side carries several lines (their ports are spread apart on purpose)
const ICON_GLYPH = 48;
/** clearance kept between a nudged edge segment and any node it does not touch */
export const NODE_CLEARANCE = 12;
const ICON_PAD = 6; // .node-icon padding

/** Auto-sized icon nodes attach to the icon glyph's box, not the whole label block (so lines never start beside the caption). */
export function isAutoIcon(n: DiagramNode): boolean {
  const st = (n.style ?? {}) as { width?: number; height?: number };
  return n.type === 'icon' && n.width === undefined && n.height === undefined && st.width === undefined && st.height === undefined;
}
/** Does the node draw a visible card / background / border? (then edges attach to its bounds, CARD_GAP outside) */
export function hasVisibleCard(n: DiagramNode, nodeDefaults: Settings['node'] = BUILTIN_SETTINGS.node): boolean {
  switch (n.type) {
    case 'card': case 'shape': case 'sticky': case 'group': case 'cluster': case 'table': case 'class': return true;
    case 'icon': return (n.data.background ?? nodeDefaults.background) === 'filled' || (n.data.border ?? nodeDefaults.border) === true;
    default: return false; // text, free drawing, junction
  }
}
/** Only transparent auto-sized icons attach to the glyph box. */
const usesGlyphBox = (n: DiagramNode, nd?: Settings['node']) => isAutoIcon(n) && !hasVisibleCard(n, nd);
export function portRectOf(nodes: DiagramNode[], n: DiagramNode, nodeDefaults?: Settings['node']): Rect {
  const full = rectOf(nodes, n);
  // a collapsed cluster draws stack layers behind its card (styles .stack-2 reaches the right / bottom edge): ports sit on the outer edge, outside COLLAPSED_STACK
  if (!usesGlyphBox(n, nodeDefaults)) return full;
  const g = Math.min((n.data.iconSize as number | undefined) ?? ICON_GLYPH, full.width - 2 * ICON_PAD);
  return { x: full.x + (full.width - g) / 2, y: full.y + ICON_PAD, width: g, height: g };
}

/** Compute routed geometry for every edge. Pure: nodes + edges + options in, routes out (optionally incremental via `cache`). */
export function computeRoutes(nodes: DiagramNode[], edges: DiagramEdge[], opts: RoutingOptions, cache?: RouteCache): Map<string, Route> {
  const rects = new Map<string, Rect>();
  for (const n of nodes) if (!n.hidden) rects.set(n.id, rectOf(nodes, n));
  // rectangles that changed since the last call: where they are now (may block a path) and where they were (a detour may be unnecessary)
  const dirty: Rect[] = [];
  if (cache) {
    for (const [id, r] of rects) {
      const old = cache.rects.get(id);
      if (!sameRect(old, r)) {
        dirty.push(inflate(r, 2));
        if (old) dirty.push(inflate(old, opts.pad + 4));
      }
    }
    for (const [id, old] of cache.rects) if (!rects.has(id)) dirty.push(inflate(old, opts.pad + 4));
    cache.recomputed = 0;
    cache.reused = 0;
  }
  const newSigs = new Map<string, string>();
  const fresh = new Set<string>();
  const usable = edges.filter((e) => rects.has(e.source) && rects.has(e.target) && e.source !== e.target);
  // attachment boxes (icon glyph for auto-sized icon nodes, the node itself otherwise)
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const prects = new Map<string, Rect>();
  for (const [id] of rects) prects.set(id, portRectOf(nodes, nodeById.get(id)!, opts.nodeDefaults));
  /** move a port point to where lines actually attach: below the caption for the bottom side, ATTACH_GAP outside icons */
  const attach = (id: string, side: Side, pt: Pt): Pt => {
    const n = nodeById.get(id)!;
    if (isJunction(n)) return center(prects.get(id)!); // junctions: every edge ends exactly on the centre (seamless T / cross join)
    if (!usesGlyphBox(n, opts.nodeDefaults)) {
      if (!hasVisibleCard(n, opts.nodeDefaults)) return pt;
      const c = sideVector(side);
      return { x: pt.x + c.x * CARD_GAP, y: pt.y + c.y * CARD_GAP };
    }
    const full = rects.get(id)!;
    const v = side === 'bottom' ? { x: pt.x, y: full.y + full.height } : pt;
    const o = sideVector(side);
    return { x: v.x + o.x * ATTACH_GAP, y: v.y + o.y * ATTACH_GAP };
  };

  // 1. sides: pinned handle, else the nearest side (floating ports)
  // ER relations only exist on pages with table nodes: other pages pay nothing for them
  const hasTables = nodes.some((n) => n.type === 'table');
  const relEdges = hasTables ? new Set(usable.filter((e) => isTableRelation(nodeById, e)).map((e) => e.id)) : new Set<string>();
  // UML associations whose end sits on an attribute row: attach there (needs two class nodes)
  const rowEdges = new Set<string>();
  if (opts.umlAnchorRows !== false)
    for (const e of usable) {
      const u = umlOf(e);
      if (u && (u.sourceMember || u.targetMember) && nodeById.get(e.source)?.type === 'class' && nodeById.get(e.target)?.type === 'class') rowEdges.add(e.id);
    }
  // component connectors attached to an interface port: the line starts / ends on the port, which sits on the border
  const compPort = (id: string, portId: string | undefined) => {
    const n = nodeById.get(id);
    return portId && n?.type === 'component' ? portById(n.data as unknown as ComponentData, portId) : undefined;
  };
  const ends = usable.map((e) => {
    const [ns, nt] = relEdges.has(e.id) || rowEdges.has(e.id) ? relationSides(prects.get(e.source)!, prects.get(e.target)!) : nearestSides(prects.get(e.source)!, prects.get(e.target)!);
    const pu = umlOf(e);
    return { id: e.id, source: e.source, target: e.target, sourceSide: (e.data?.pinSource ?? compPort(e.source, pu?.sourcePort)?.side ?? ns) as Side, targetSide: (e.data?.pinTarget ?? compPort(e.target, pu?.targetPort)?.side ?? nt) as Side };
  });
  const endsById = new Map(ends.map((x) => [x.id, x]));
  const usableById = new Map(usable.map((x) => [x.id, x]));
  const ports = distributePorts(ends, prects);
  // how many line ends share a node side: a big snap would stack those spread-out ports onto one line
  const sideUse = new Map<string, number>();
  for (const en of ends) for (const k of [`${en.source}:${en.sourceSide}`, `${en.target}:${en.targetSide}`]) sideUse.set(k, (sideUse.get(k) ?? 0) + 1);
  // gaps, caption-clearing bottoms, and snapping of nearly aligned facing ports onto one straight line
  for (const en of ends) {
    const pp = ports.get(en.id)!;
    pp.src = attach(en.source, en.sourceSide, pp.src);
    pp.dst = attach(en.target, en.targetSide, pp.dst);
    const pe = umlOf(usableById.get(en.id)!);
    const sp = compPort(en.source, pe?.sourcePort), tp = compPort(en.target, pe?.targetPort);
    if (sp || tp) {
      if (sp) { const r = rects.get(en.source)!, o = portOffsetPoint(r.width, r.height, sp); pp.src = { x: r.x + o.x, y: r.y + o.y }; }
      if (tp) { const r = rects.get(en.target)!, o = portOffsetPoint(r.width, r.height, tp); pp.dst = { x: r.x + o.x, y: r.y + o.y }; }
      continue;
    }
    if (relEdges.has(en.id)) {
      // ER relation: the line leaves / enters at the centre of the column row, never at a spread-out port
      const rel = relationOf(usableById.get(en.id)!)!;
      pp.src = { ...pp.src, y: anchorY(rects.get(en.source)!, nodeById.get(en.source)!, rel.fromCol) };
      pp.dst = { ...pp.dst, y: anchorY(rects.get(en.target)!, nodeById.get(en.target)!, rel.toCol) };
      continue;
    }
    if (rowEdges.has(en.id)) {
      const u = umlOf(usableById.get(en.id)!)!;
      const sn = nodeById.get(en.source)!, tn = nodeById.get(en.target)!;
      if (u.sourceMember) pp.src = { ...pp.src, y: rects.get(en.source)!.y + memberCenterY(classOf(sn), u.sourceMember) };
      if (u.targetMember) pp.dst = { ...pp.dst, y: rects.get(en.target)!.y + memberCenterY(classOf(tn), u.targetMember) };
      continue;
    }
    const horizontal = en.sourceSide === 'right' && en.targetSide === 'left' || en.sourceSide === 'left' && en.targetSide === 'right';
    const vertical = en.sourceSide === 'bottom' && en.targetSide === 'top' || en.sourceSide === 'top' && en.targetSide === 'bottom';
    if (!horizontal && !vertical) continue;
    const axis = horizontal ? 'y' : 'x';
    const d = Math.abs(pp.src[axis] - pp.dst[axis]);
    const alone = sideUse.get(`${en.source}:${en.sourceSide}`) === 1 && sideUse.get(`${en.target}:${en.targetSide}`) === 1;
    if (d === 0 || d >= (alone ? ALIGN_SNAP : ALIGN_SNAP_SHARED)) continue;
    const jSrc = isJunction(nodeById.get(en.source));
    const jDst = isJunction(nodeById.get(en.target));
    if (jSrc || jDst) {
      // the junction never moves: slide the OTHER end onto the junction's line when its side is wide enough
      if (jSrc && jDst) continue;
      const other = jSrc ? en.target : en.source;
      const r = prects.get(other)!;
      const [o0, o1] = horizontal ? [r.y + 4, r.y + r.height - 4] : [r.x + 4, r.x + r.width - 4];
      const jv = jSrc ? pp.src[axis] : pp.dst[axis];
      if (jv >= o0 && jv <= o1) {
        if (jSrc) pp.dst = { ...pp.dst, [axis]: jv };
        else pp.src = { ...pp.src, [axis]: jv };
      }
      continue;
    }
    const span = (id: string) => {
      const r = prects.get(id)!;
      return horizontal ? [r.y + 4, r.y + r.height - 4] : [r.x + 4, r.x + r.width - 4];
    };
    const [a0, a1] = span(en.source);
    const [b0, b1] = span(en.target);
    const lo = Math.max(a0, b0);
    const hi = Math.min(a1, b1);
    if (lo > hi) continue; // the sides do not overlap enough to attach on one line
    const v = Math.min(hi, Math.max(lo, (pp.src[axis] + pp.dst[axis]) / 2));
    pp.src = { ...pp.src, [axis]: v };
    pp.dst = { ...pp.dst, [axis]: v };
  }
  // staggered first / last legs: edges leaving (entering) one node side and turning the same way get stubs MIN_TRACK_GAP apart,
  // the port farthest along the turn direction the shortest, so the fan nests without crossing and first bends never share a coordinate
  const stubs = new Map<string, { src?: number; dst?: number }>();
  {
    const groups = new Map<string, { id: string; end: 'src' | 'dst'; along: number; turn: number }[]>();
    for (const en of ends) {
      if (relEdges.has(en.id) || rowEdges.has(en.id)) continue;
      const pp = ports.get(en.id)!;
      for (const [end, node, side, other, pt] of [['src', en.source, en.sourceSide, en.target, pp.src], ['dst', en.target, en.targetSide, en.source, pp.dst]] as const) {
        const h = isHorizontalSide(side), oc = center(prects.get(other)!), along = h ? pt.y : pt.x, d = (h ? oc.y : oc.x) - along;
        const k = `${node}:${side}`, l = groups.get(k) ?? [];
        l.push({ id: en.id, end, along, turn: Math.abs(d) <= 6 ? 0 : Math.sign(d) });
        groups.set(k, l);
      }
    }
    for (const l of groups.values())
      for (const t of [-1, 1]) {
        const same = l.filter((u) => u.turn === t).sort((a, b) => (t > 0 ? b.along - a.along : a.along - b.along));
        if (same.length < 2) continue;
        same.forEach((u, k) => { const v = stubs.get(u.id) ?? {}; v[u.end] = MIN_END_SEGMENT + Math.min(k, 5) * MIN_TRACK_GAP; stubs.set(u.id, v); });
      }
  }
  const par = parallelIndex(usable);
  const containers = nodes.filter((n) => isContainer(n) && !n.hidden);
  // expanded group / cluster borders: soft bands the router avoids running along
  const bands = containers.filter((n) => !(n.type === 'cluster' && n.data.collapsed)).map((n) => rects.get(n.id)!);
  // obstacles come from a bucket grid: only the nodes around an edge matter to its route (the router itself looks +-160px around the ports)
  const leafGrid = new RectGrid<string>(400);
  for (const n of nodes) if ((!isContainer(n) || (n.type === 'cluster' && n.data.collapsed)) && !n.hidden) leafGrid.insert(n.id, rects.get(n.id)!);
  const OBSTACLE_REACH = 500;
  const near = (box: Rect, reach: number) => ({ x: box.x - reach, y: box.y - reach, width: box.width + 2 * reach, height: box.height + 2 * reach });
  const leafRects = (excl: Set<string>, around: Rect) => leafGrid.query(near(around, OBSTACLE_REACH)).filter((id) => !excl.has(id)).map((id) => rects.get(id)!);
  const ancestorIds = new Map<string, Set<string>>();
  const ancestorsSet = (id: string) => {
    let a = ancestorIds.get(id);
    if (!a) ancestorIds.set(id, (a = new Set(ancestorsOf(nodes, id).map((x) => x.id))));
    return a;
  };

  const fast = usable.length > FAST_ROUTING_EDGES;
  const budgetMs = fast ? Math.min(opts.budgetMs, FAST_BUDGET_MS) : opts.budgetMs;
  const out = new Map<string, Route>();
  // segments of the orthogonal routes made so far: later edges keep away from them (distinct corridors / tracks)
  const occGrid = new RectGrid<{ id: string; preset?: string; seg: PreferredSeg }>(240);
  const occupiedNear = (id: string, preset: string | undefined, box: Rect) => fast ? undefined : occGrid.query(box).filter((o) => o.id !== id && !(preset && o.preset === preset)).map((o) => o.seg);
  const altUse = new Map<string, number>();
  const degree = new Map<string, number>();
  for (const e of usable) for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
  for (const e of usable) {
    const en = endsById.get(e.id)!;
    const pp = ports.get(e.id)!;
    const src: Port = { pt: pp.src, side: en.sourceSide };
    const dst: Port = { pt: pp.dst, side: en.targetSide };
    const style = resolveEdgeStyle(e.data ?? {}, { edge: opts.edgeDefaults });
    // junction / bus edges follow the chosen line style too, unless the user keeps buses orthogonal
    // use case diagrams are drawn with straight lines unless the edge picked a line type itself
    const useCaseLine = !e.data?.lineType && (nodeById.get(e.source)?.type === 'usecase' || nodeById.get(e.target)?.type === 'usecase');
    const lineType = useCaseLine ? 'straight' : opts.edgeDefaults.keepBusesOrthogonal && (isJunction(nodeById.get(e.source)) || isJunction(nodeById.get(e.target))) ? 'orthogonal' : style.lineType;
    const mk = resolveMarkers(nodes, e, style.arrows);
    const am = arrowMetrics(style.width, opts.edgeDefaults.arrowSize);
    const startCut = mk.start === 'none' ? 0 : markerBox(mk.start, am).length;
    const endCut = mk.end === 'none' ? 0 : markerBox(mk.end, am).length;
    const sig = cache
      ? JSON.stringify([rects.get(e.source), rects.get(e.target), pp, en.sourceSide, en.targetSide, lineType, e.data?.waypoints, e.data?.manual, par.get(e.id), opts.pad, opts.autoRoute, opts.keepManual, opts.cornerRadius, e.data?.cornerRadius, e.data?.labelT, e.data?.labelOffset, style.width, style.arrows, e.data?.startMarker, e.data?.endMarker, opts.edgeDefaults.arrowSize, lineType])
      : '';
    if (cache) {
      const prev = cache.routes.get(e.id);
      if (prev && cache.sigs.get(e.id) === sig && !dirty.some((r) => pathHits(prev.points, r))) {
        out.set(e.id, prev);
        newSigs.set(e.id, sig);
        cache.reused++;
        continue;
      }
      cache.recomputed++;
    }
    fresh.add(e.id);
    newSigs.set(e.id, sig);
    const manualWps = e.data?.manual && opts.keepManual && e.data.waypoints?.length ? e.data.waypoints : undefined;
    let points: Pt[];
    let d: string;
    let routed = false;
    let orthogonal = lineType === 'orthogonal' || lineType === 'step-rounded';
    if (lineType === 'curved') {
      const { index, count } = par.get(e.id)!;
      // the bezier is built from ports pulled back along their side normals, so it ends at the arrowhead base
      const back = (p: Port, cut: number): Port => (cut ? { ...p, pt: { x: p.pt.x + sideVector(p.side).x * cut, y: p.pt.y + sideVector(p.side).y * cut } } : p);
      const c = curvedRoute(back(src, startCut), back(dst, endCut), e.data?.waypoints ?? [], count > 1 ? parallelOffset(index, count) : 0);
      points = c.points;
      d = c.d;
    } else if (lineType === 'straight') {
      const { index, count } = par.get(e.id)!;
      const off = count > 1 ? parallelOffset(index, count) : 0;
      const dx = dst.pt.x - src.pt.x;
      const dy = dst.pt.y - src.pt.y;
      const l = Math.hypot(dx, dy) || 1;
      const o = { x: (-dy / l) * off, y: (dx / l) * off };
      points = [{ x: src.pt.x + o.x, y: src.pt.y + o.y }, ...(e.data?.waypoints ?? []), { x: dst.pt.x + o.x, y: dst.pt.y + o.y }];
      d = polylineToPath(shortenEnds(points, startCut, endCut), { radius: 0 });
      orthogonal = false;
    } else if (manualWps) {
      points = orthogonalFromWaypoints(src, dst, manualWps);
      d = '';
    } else if (opts.autoRoute) {
      const excl = new Set([e.source, e.target]);
      const unrelated = containers.filter((c) => {
        if (excl.has(c.id)) return false;
        return !ancestorsSet(e.source).has(c.id) && !ancestorsSet(e.target).has(c.id);
      });
      const rs = rects.get(e.source)!;
      const rt = rects.get(e.target)!;
      const x0 = Math.min(rs.x, rt.x), y0 = Math.min(rs.y, rt.y);
      // the edge's own end nodes are obstacles too (no running along / through the target's body or its stack); not for junctions or containers
      const ownEnds = relEdges.has(e.id) ? [] : [e.source, e.target].filter((id) => { const n = nodeById.get(id)!; return !isJunction(n) && (!isContainer(n) || (n.type === 'cluster' && !!n.data.collapsed)); }).map((id) => prects.get(id)!);
      const base = leafRects(excl, { x: x0, y: y0, width: Math.max(rs.x + rs.width, rt.x + rt.width) - x0, height: Math.max(rs.y + rs.height, rt.y + rt.height) - y0 }).concat(ownEnds);
      // same-preset edges routed so far: reuse their collinear tracks (bundle) instead of opening a new parallel one
      const preset = e.data?.preset;
      const prefer = preset ? usable.flatMap((o) => (o.id !== e.id && o.data?.preset === preset && out.get(o.id)?.orthogonal && !out.get(o.id)!.manual ? preferredSegs(out.get(o.id)!.points) : [])) : [];
      // ER crow's-foot ends are 22px long: the first / last leg must be longer than the marker so it points along the line
      const isRel = relEdges.has(e.id);
      const erEnd = isRel ? Math.max(startCut, endCut) + 20 : 0;
      // relations: a long first / last leg for the crow's foot, but the padding around tables stays small so lines fit between tables
      const legPad = isRel ? ER_CLEARANCE : opts.pad;
      const ro = isRel ? { stub: erEnd, bendPenalty: ER_BEND, borderPenalty: ER_BORDER, corridors: true, budgetMs: Math.max(opts.budgetMs, 40) } : { budgetMs };
      const st = stubs.get(e.id);
      const obsAll = [...base, ...unrelated.map((c) => rects.get(c.id)!)];
      let r = smartRoute(src, dst, obsAll, { pad: legPad, ...ro, ...(st && !fast ? { srcStub: st.src, dstStub: st.dst } : {}), fast, now: opts.now, prefer: isRel ? undefined : prefer, occupied: isRel ? undefined : occupiedNear(e.id, preset, { x: Math.min(src.pt.x, dst.pt.x) - 160, y: Math.min(src.pt.y, dst.pt.y) - 160, width: Math.abs(src.pt.x - dst.pt.x) + 320, height: Math.abs(src.pt.y - dst.pt.y) + 320 }), bands });
      if (!r.routed && st && !fast) r = smartRoute(src, dst, obsAll, { pad: legPad, ...ro, fast, now: opts.now, prefer, occupied: occupiedNear(e.id, preset, { x: Math.min(src.pt.x, dst.pt.x) - 160, y: Math.min(src.pt.y, dst.pt.y) - 160, width: Math.abs(src.pt.x - dst.pt.x) + 320, height: Math.abs(src.pt.y - dst.pt.y) + 320 }), bands }); // staggered legs did not fit: plain ones
      if (!r.routed && unrelated.length) {
        const r2 = smartRoute(src, dst, base, { pad: legPad, ...ro, fast, now: opts.now, bands });
        if (r2.routed) r = r2;
      }
      points = r.points;
      routed = r.routed;
      let usedSrc = src;
      let usedDst = dst;
      // blocked on the nearest sides (tight layout), or running on top of other edges' tracks? try the other side combinations, unless the user pinned the sides
      const bbox = (pts: Pt[]): Rect => { const b = pointsBox(pts); return { x: b.x - MIN_TRACK_GAP, y: b.y - MIN_TRACK_GAP, width: b.width + 2 * MIN_TRACK_GAP, height: b.height + 2 * MIN_TRACK_GAP }; };
      const clashes = (pts: Pt[], gap = MIN_TRACK_GAP) => {
        const others = occGrid.query(bbox(pts)).filter((o) => o.id !== e.id && !(preset && o.preset === preset)).map((o) => o.seg);
        return preferredSegs(pts).filter((a) => others.some((b) => a.horizontal === b.horizontal && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 2 && Math.abs(a.c - b.c) < gap)).length;
      };
      const crowded = !fast && routed && (degree.get(e.source)! >= HUB_DEGREE || degree.get(e.target)! >= HUB_DEGREE) && !isRel && !(e.data?.pinSource && e.data?.pinTarget) && clashes(points) > 0;
      if (!fast && (!routed || crowded) && !(e.data?.pinSource && e.data?.pinTarget) && !relEdges.has(e.id)) {
        let bestScore = crowded ? countBends(points) * 60 + polylineLength(points) + (clashes(points) * 150 + clashes(points, 5) * 400) : Infinity;
        const obstaclesAll = [...base, ...unrelated.map((c) => rects.get(c.id)!)];
        // alternative ports spread along their side so several edges taking the same side do not share one point
        const altPort = (id: string, side: Side): Port => {
          const r = prects.get(id)!, k = `${id}:${side}`, n = altUse.get(k) ?? 0, len = isHorizontalSide(side) ? r.height : r.width;
          return { pt: attach(id, side, portPoint(r, side, Math.max(0.1, Math.min(0.9, 0.5 + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 12 / (len || 1))))), side };
        };
        let alt0: [Port, Port] | undefined;
        for (const ss of e.data?.pinSource ? [e.data.pinSource as Side] : SIDES)
          for (const ts of e.data?.pinTarget ? [e.data.pinTarget as Side] : SIDES) {
            if (ss === src.side && ts === dst.side) continue;
            const a = altPort(e.source, ss), b = altPort(e.target, ts);
            const alt = smartRoute(a, b, obstaclesAll, { pad: opts.pad, budgetMs: opts.budgetMs, now: opts.now, bands, occupied: occupiedNear(e.id, preset, bbox([a.pt, b.pt])) });
            if (!alt.routed) continue;
            const score = countBends(alt.points) * 60 + polylineLength(alt.points) + (clashes(alt.points) * 150 + clashes(alt.points, 5) * 400);
            if (score < bestScore) {
              bestScore = score;
              points = alt.points;
              usedSrc = a;
              usedDst = b;
              alt0 = [a, b];
              routed = true;
            }
          }
        if (alt0) for (const [x, id] of [[alt0[0], e.source], [alt0[1], e.target]] as const) altUse.set(`${id}:${x.side}`, (altUse.get(`${id}:${x.side}`) ?? 0) + 1);
      }
      points = removeShortSegments(points, MIN_SEGMENT);
      const longEnds = ensureEndSegments(points, Math.max(MIN_END_SEGMENT, erEnd));
      // lengthening end legs shifts a track: never onto (within 3px of) another edge's track
      if (!polylineIntersectsRects(longEnds, [...base, ...unrelated.map((c) => rects.get(c.id)!)]) && (fast || clashes(longEnds, 3) <= clashes(points, 3))) points = longEnds;
      src.pt = usedSrc.pt;
      src.side = usedSrc.side;
      dst.pt = usedDst.pt;
      dst.side = usedDst.side;
      d = '';
    } else {
      const stepEnd = relEdges.has(e.id) ? Math.max(startCut, endCut) + 20 : 0;
      points = ensureEndSegments(removeShortSegments(stepRoute(src, dst, Math.max(opts.pad, stepEnd)), MIN_SEGMENT), Math.max(MIN_END_SEGMENT, stepEnd));
      d = '';
    }
    out.set(e.id, { points, d, labelPt: { x: 0, y: 0 }, src, dst, orthogonal, lineType, manual: !!manualWps || !!e.data?.manual, routed, startCut, endCut });
    if (!fast && orthogonal && !manualWps) for (const seg of preferredSegs(points)) occGrid.insert({ id: e.id, preset: e.data?.preset, seg }, seg.horizontal ? { x: seg.lo, y: seg.c - 1, width: seg.hi - seg.lo, height: 2 } : { x: seg.c - 1, y: seg.lo, width: 2, height: seg.hi - seg.lo });
  }

  // 1a. self-referencing ER relations: a loop on the right side (the router skips source === target)
  const selfIds: string[] = [];
  for (const e of edges) {
    if (e.source !== e.target) continue;
    const r = hasTables ? relationOf(e) : undefined;
    const node = nodeById.get(e.source);
    const rect = rects.get(e.source);
    if (!node || !rect) continue;
    const stateLoop = node.type === 'state' && umlOf(e)?.kind === 'transition';
    if (!(r && node.type === 'table') && !stateLoop) continue;
    const loop = stateLoop ? nodeSelfLoop(rect, CARD_GAP, typeof e.label === 'string' ? e.label.length * 6.4 + 14 : 0) : selfLoopPoints(rect, node, r?.fromCol, r?.toCol, CARD_GAP);
    const style = resolveEdgeStyle(e.data ?? {}, { edge: opts.edgeDefaults });
    const mk = resolveMarkers(nodes, e, style.arrows);
    const am = arrowMetrics(style.width, opts.edgeDefaults.arrowSize);
    const startCut = mk.start === 'none' ? 0 : markerBox(mk.start, am).length;
    const endCut = mk.end === 'none' ? 0 : markerBox(mk.end, am).length;
    const d = polylineToPath(shortenEnds(loop.points, startCut, endCut), { radius: 8 });
    const mid = { x: loop.points[1].x, y: (loop.points[1].y + loop.points[2].y) / 2 };
    out.set(e.id, { points: loop.points, d, labelPt: mid, src: loop.src, dst: loop.dst, orthogonal: true, lineType: 'step-rounded', manual: false, routed: true, startCut, endCut });
    selfIds.push(e.id);
  }

  // 1b. tracks: bundle same-preset parallels, keep >= MIN_TRACK_GAP between other parallel segments
  if (opts.autoRoute) {
    const tracked = usable.filter((e) => out.get(e.id)!.orthogonal && !out.get(e.id)!.manual);
    const spanFor = (id: string, side: Side): [number, number] => {
      const r = prects.get(id)!;
      return isHorizontalSide(side) ? [r.y + 4, r.y + r.height - 4] : [r.x + 4, r.x + r.width - 4];
    };
    // an end segment may slide along its node side (port point stays on the side) when it leaves along the side normal
    const slides = (pts: Pt[], i: number, side: Side) => pts.length >= 3 && (Math.abs(pts[i].y - pts[i + (i === 0 ? 1 : -1)].y) < 1e-6) === isHorizontalSide(side);
    const moved = tracked.map((e) => {
      const r = out.get(e.id)!;
      return {
        id: e.id, points: r.points, preset: e.data?.preset,
        ...(relEdges.has(e.id) ? { minEnd: Math.max(r.startCut, r.endCut) + 20 } : {}),
        ...(slides(r.points, 0, r.src.side) && !isJunction(nodeById.get(e.source)) && !relEdges.has(e.id) ? { srcSpan: spanFor(e.source, r.src.side) } : {}),
        ...(slides(r.points, r.points.length - 1, r.dst.side) && !isJunction(nodeById.get(e.target)) && !relEdges.has(e.id) ? { dstSpan: spanFor(e.target, r.dst.side) } : {}),
      };
    });
    const endpoints = new Map(usable.map((e) => [e.id, new Set([e.source, e.target])]));
    const obstaclesFor = (id: string) => {
      const pts = out.get(id)!.points;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const ends2 = endpoints.get(id)!;
      return leafGrid.query(near({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, 160)).filter((nid) => !ends2.has(nid)).map((nid) => inflate(rects.get(nid)!, (relEdges.has(id) ? ER_CLEARANCE : NODE_CLEARANCE) - 2));
    };
    if (separateTracks(moved, obstaclesFor, relEdges.size ? ER_TRACK_GAP : undefined, undefined, cache ? fresh : undefined)) {
      // clash checks only look at the moved edges around a route
      const movedGrid = new RectGrid<number>(240);
      moved.forEach((o, i) => { const b = pointsBox(o.points); movedGrid.insert(i, { x: b.x - MIN_TRACK_GAP, y: b.y - MIN_TRACK_GAP, width: b.width + 2 * MIN_TRACK_GAP, height: b.height + 2 * MIN_TRACK_GAP }); });
      const nearMoved = (pts: Pt[]) => { const b = pointsBox(pts); return movedGrid.query({ x: b.x - MIN_TRACK_GAP, y: b.y - MIN_TRACK_GAP, width: b.width + 2 * MIN_TRACK_GAP, height: b.height + 2 * MIN_TRACK_GAP }).map((i) => moved[i]); };
      for (const m of moved) {
        const r = out.get(m.id)!;
        if (m.points !== r.points) {
          // tracks moved: a hook next to an end may have shrunk again. Lengthen it only if that keeps the tracks apart.
          const fixed = ensureEndSegments(m.points, relEdges.has(m.id) ? Math.max(MIN_END_SEGMENT, Math.max(r.startCut, r.endCut) + 20) : MIN_END_SEGMENT);
          const clash = (pts: Pt[]) => {
            const mine = preferredSegs(pts);
            return nearMoved(pts).some((o) => o.id !== m.id && preferredSegs(o.points).some((b) => mine.some((a) => a.horizontal === b.horizontal && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 2 && Math.abs(a.c - b.c) < MIN_TRACK_GAP && !(Math.abs(a.c - b.c) < 1e-6 && !!m.preset && m.preset === o.preset))));
          };
          r.points = fixed !== m.points && !polylineIntersectsRects(fixed, obstaclesFor(m.id)) && !clash(fixed) ? fixed : m.points;
          r.src = { ...r.src, pt: m.points[0] };
          r.dst = { ...r.dst, pt: m.points[m.points.length - 1] };
          fresh.add(m.id);
        }
      }
    }
  }

  // 2. line jumps, paths, label anchors
  const hops = opts.jumps ? computeHops(new Map([...out].filter(([, r]) => r.orthogonal).map(([id, r]) => [id, r.points]))) : new Map<string, Pt[]>();
  for (const e of usable) {
    const r = out.get(e.id)!;
    if (!opts.jumps && !fresh.has(e.id)) continue; // reused route: path and label are already built
    if (r.orthogonal) {
      const radius = r.lineType === 'step-rounded' ? e.data?.cornerRadius ?? opts.cornerRadius : 0;
      r.d = polylineToPath(shortenEnds(r.points, r.startCut, r.endCut), { radius, hops: hops.get(e.id) });
    }
    r.labelPt = r.lineType === 'curved' ? labelPoint(r.points, e.data?.labelT ?? 0.5, e.data?.labelOffset ?? 0) : labelAnchor(r.points, e.data?.labelT, e.data?.labelOffset ?? 0);
  }
  // 3. labelled edges: longest straight segment, slid clear of nodes / group titles / other edges / other labels
  const labelled = usable.filter((e) => typeof e.label === 'string' && e.label && out.get(e.id)!.lineType !== 'curved');
  if (labelled.length) {
    const obstacles: Rect[] = [];
    for (const n of nodes) {
      if (n.hidden || isJunction(n)) continue;
      const r = rects.get(n.id)!;
      obstacles.push(isContainer(n) ? { x: r.x, y: r.y, width: r.width, height: 44 } : inflate(r, 3)); // containers: only the title band; other nodes with a small margin so a chip never touches a border
    }
    // keep chips clear of arrowheads / diamonds and of the multiplicity and role-name chips at the ends of every edge
    for (const e of usable) {
      const r = out.get(e.id)!;
      const pts = r.points;
      if (pts.length < 2) continue;
      for (const [a, b, cut] of [[pts[0], pts[1], r.startCut], [pts[pts.length - 1], pts[pts.length - 2], r.endCut]] as [Pt, Pt, number][]) {
        if (!cut) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const half = cut / 2 + 3;
        obstacles.push({ x: a.x + ((b.x - a.x) / len) * (cut / 2) - half, y: a.y + ((b.y - a.y) / len) * (cut / 2) - half, width: half * 2, height: half * 2 });
      }
      const uml = e.data?.uml;
      if (uml && r.lineType !== 'curved')
        for (const l of endLabels(pts, uml, { startCut: r.startCut, endCut: r.endCut })) {
          const w = Math.min(120, l.text.length * 6.5 + 8);
          obstacles.push({ x: l.anchor === 'center' ? l.x - w / 2 : l.anchor === 'end' ? l.x - w : l.x, y: l.y - 8, width: w, height: 16 });
        }
    }
    const placed = placeLabels(
      labelled.map((e) => ({ id: e.id, points: out.get(e.id)!.points, text: e.label as string, t: e.data?.labelT, offset: e.data?.labelOffset ?? 0 })),
      obstacles,
      new Map([...out].map(([id, r]) => [id, r.points])),
    );
    for (const [id, p] of placed) out.get(id)!.labelPt = p;
  }
  if (cache) {
    cache.routes = out;
    cache.sigs = newSigs;
    cache.rects = rects;
  }
  return out;
}

function pointsBox(pts: Pt[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export const DEFAULT_ROUTING: Omit<RoutingOptions, 'edgeDefaults'> = { jumps: false, cornerRadius: 8, pad: DEFAULT_PAD, keepManual: true, autoRoute: true, budgetMs: 8 };
