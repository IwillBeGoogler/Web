import { describe, expect, it } from 'vitest';
import { chevronSpots, lapSeconds, measure, packetCount, packetDistances, pointAt, reversePoints, SPEED_PX } from './geometry';
import { buildFlowPaths, type FlowEdgeIn } from './paths';
import { traceFlow } from './trace';
import { BASE_FLOW, edgeFlows, PRESET_FLOW, resolveFlowDir, resolveFlowLook } from './resolve';
import { computeFrame } from './frame';
import { flowExportMarkup } from './export';
import { validateDiagram } from '../serialization';
import { validateProject } from '../project';
import { buildSdd, readSdd } from '../sdd/sdd';
import type { Diagram, Project } from '../../types';

const P = (x: number, y: number) => ({ x, y });
const L = [P(0, 0), P(100, 0), P(100, 50), P(200, 50)]; // 100 + 50 + 100 = 250

describe('polyline math', () => {
  it('measure: cumulative lengths and total', () => {
    const m = measure(L);
    expect(m.lens).toEqual([0, 100, 150, 250]);
    expect(m.total).toBe(250);
    expect(measure([P(3, 4)]).total).toBe(0);
  });
  it('pointAt follows the orthogonal bends exactly (position + heading)', () => {
    const m = measure(L);
    expect(pointAt(m, 0)).toMatchObject({ x: 0, y: 0, angle: 0 });
    expect(pointAt(m, 50)).toMatchObject({ x: 50, y: 0 });
    expect(pointAt(m, 100)).toMatchObject({ x: 100, y: 0 });
    const down = pointAt(m, 125);
    expect(down).toMatchObject({ x: 100, y: 25 });
    expect(down.angle).toBeCloseTo(Math.PI / 2);
    expect(pointAt(m, 200)).toMatchObject({ x: 150, y: 50 });
    expect(pointAt(m, 250)).toMatchObject({ x: 200, y: 50 });
    expect(pointAt(m, -5)).toMatchObject({ x: 0, y: 0 }); // clamped
    expect(pointAt(m, 999)).toMatchObject({ x: 200, y: 50 });
  });
  it('reverse path runs the other way', () => {
    const r = measure(reversePoints(L));
    expect(pointAt(r, 0)).toMatchObject({ x: 200, y: 50 });
    expect(pointAt(r, 250)).toMatchObject({ x: 0, y: 0 });
  });
  it('packet count follows density (per 100px), at least one, none on stubs', () => {
    expect(packetCount(250, 1.2)).toBe(3);
    expect(packetCount(250, 4)).toBe(10);
    expect(packetCount(40, 0.5)).toBe(1);
    expect(packetCount(5, 2)).toBe(0);
  });
  it('packet distances: evenly spaced, advance with time * speed, wrap around, phase shifts them', () => {
    const d0 = packetDistances(300, 3, 0, 100);
    expect(d0).toEqual([0, 100, 200]);
    expect(packetDistances(300, 3, 1, 100)).toEqual([100, 200, 0]);
    expect(packetDistances(300, 3, 2.5, 100).map(Math.round)).toEqual([250, 50, 150]);
    expect(packetDistances(300, 3, 0, 100, 0.5)).toEqual([50, 150, 250]);
    expect(packetDistances(300, 0, 0, 100)).toEqual([]);
    for (const t of [0, 0.37, 5, 123.4]) for (const d of packetDistances(250, 4, t, 80)) { expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThan(250); }
  });
  it('speeds: slow < normal < fast; lap time = length / speed', () => {
    expect(SPEED_PX.slow).toBeLessThan(SPEED_PX.normal);
    expect(SPEED_PX.normal).toBeLessThan(SPEED_PX.fast);
    expect(lapSeconds(160, 80)).toBe(2);
  });
  it('chevron spots for the static rendering sit on the line, evenly', () => {
    const spots = chevronSpots(measure(L), 64);
    expect(spots.length).toBe(3);
    for (const s of spots) expect(s.y === 0 || s.y === 50 || (s.x === 100 && s.y > 0 && s.y < 50)).toBe(true);
    expect(chevronSpots(measure([P(0, 0), P(10, 0)]))).toEqual([]);
  });
});

const look = BASE_FLOW;
const edge = (id: string, source: string, target: string, pts: [number, number][], dir: FlowEdgeIn['dir'] = 'forward', color = '#111'): FlowEdgeIn => ({ id, source, target, points: pts.map(([x, y]) => P(x, y)), dir, color, look });

describe('junction chain stitching', () => {
  const isJ = (id: string) => id.startsWith('j');
  it('plain edges: one path each, forward / reverse / both', () => {
    const paths = buildFlowPaths([edge('a', 'x', 'y', [[0, 0], [100, 0]]), edge('b', 'x', 'y', [[0, 10], [100, 10]], 'reverse'), edge('c', 'x', 'y', [[0, 20], [100, 20]], 'both'), edge('d', 'x', 'y', [[0, 30], [100, 30]], null)], isJ);
    expect(paths).toHaveLength(4); // a, b, c(f), c(r); d has no packets
    expect(paths.find((p) => p.id === 'a:f')!.from).toBe('x');
    const rev = paths.find((p) => p.id === 'b:r')!;
    expect(rev.from).toBe('y');
    expect(rev.points[0]).toEqual(P(100, 10));
    expect(paths.filter((p) => p.edgeIds[0] === 'c')).toHaveLength(2);
  });
  it('src -> junction -> trunk -> target is ONE path with the combined length', () => {
    const paths = buildFlowPaths([edge('in', 's', 'j1', [[0, 0], [100, 0]]), edge('trunk', 'j1', 't', [[100, 0], [100, 80], [200, 80]])], isJ);
    expect(paths).toHaveLength(1);
    const p = paths[0];
    expect(p.edgeIds).toEqual(['in', 'trunk']);
    expect(p.from).toBe('s');
    expect(p.to).toBe('t');
    expect(p.points).toEqual([P(0, 0), P(100, 0), P(100, 80), P(200, 80)]); // joint not duplicated
    expect(p.m.total).toBe(100 + 80 + 100);
  });
  it('a bus: several sources share the trunk (one path per source), a fan-out junction forks into one path per target', () => {
    const bus = buildFlowPaths([edge('a', 's1', 'j1', [[0, 0], [50, 0]]), edge('b', 's2', 'j1', [[0, 50], [50, 50], [50, 0]]), edge('trunk', 'j1', 't', [[50, 0], [150, 0]])], isJ);
    expect(bus.map((p) => p.edgeIds.join('+')).sort()).toEqual(['a+trunk', 'b+trunk']);
    const fan = buildFlowPaths([edge('in', 's', 'j1', [[0, 0], [50, 0]]), edge('o1', 'j1', 't1', [[50, 0], [100, -40]]), edge('o2', 'j1', 't2', [[50, 0], [100, 40]])], isJ);
    expect(fan.map((p) => p.to).sort()).toEqual(['t1', 't2']);
  });
  it('chains of several junctions stitch end to end', () => {
    const paths = buildFlowPaths([edge('e1', 's', 'j1', [[0, 0], [10, 0]]), edge('e2', 'j1', 'j2', [[10, 0], [60, 0]]), edge('e3', 'j2', 't', [[60, 0], [120, 0]])], isJ);
    expect(paths).toHaveLength(1);
    expect(paths[0].m.total).toBe(120);
  });
  it('reverse edges stitch too (data flowing back through a junction)', () => {
    const paths = buildFlowPaths([edge('in', 's', 'j1', [[0, 0], [100, 0]], 'reverse'), edge('x', 'j1', 'u', [[100, 0], [100, 60]], 'reverse')], isJ);
    // reverse: j1 -> s, u -> j1 ; u->j1 continues into j1->s
    expect(paths).toHaveLength(1);
    expect(paths[0].from).toBe('u');
    expect(paths[0].to).toBe('s');
  });
  it('cycles through junctions terminate and orphan junction lines are kept', () => {
    const cyc = buildFlowPaths([edge('a', 'j1', 'j2', [[0, 0], [50, 0]]), edge('b', 'j2', 'j1', [[50, 0], [0, 0]])], isJ);
    expect(cyc.length).toBeGreaterThanOrEqual(1);
    expect(cyc.length).toBeLessThanOrEqual(2);
    const loop = buildFlowPaths([edge('s', 's', 'j1', [[0, 0], [10, 0]]), edge('a', 'j1', 'j2', [[10, 0], [50, 0]]), edge('b', 'j2', 'j1', [[50, 0], [10, 0]])], isJ);
    expect(loop.length).toBeGreaterThanOrEqual(1);
    for (const p of loop) expect(new Set(p.edgeIds).size).toBe(p.edgeIds.length); // an edge is used once per chain
  });
});

describe('trace path (upstream / downstream)', () => {
  const E = (id: string, source: string, target: string, dir: 'forward' | 'reverse' | 'both' | null = 'forward') => ({ id, source, target, dir });
  const edges = [E('1', 'a', 'b'), E('2', 'b', 'c'), E('3', 'x', 'b'), E('4', 'c', 'd'), E('5', 'p', 'q')];
  it('splits into upstream and downstream and ignores unrelated edges', () => {
    const t = traceFlow('b', edges);
    expect([...t.upstream].sort()).toEqual(['a', 'x']);
    expect([...t.downstream].sort()).toEqual(['c', 'd']);
    expect([...t.nodeIds].sort()).toEqual(['a', 'b', 'c', 'd', 'x']);
    expect([...t.edgeIds].sort()).toEqual(['1', '2', '3', '4']);
    expect(t.nodeIds.has('p')).toBe(false);
  });
  it('terminates on cycles and includes every cycle member', () => {
    const t = traceFlow('a', [E('1', 'a', 'b'), E('2', 'b', 'c'), E('3', 'c', 'a'), E('4', 'c', 'z')]);
    expect([...t.downstream].sort()).toEqual(['b', 'c', 'z']);
    expect([...t.upstream].sort()).toEqual(['b', 'c']);
    expect(t.edgeIds.size).toBe(4);
  });
  it('respects reverse and bidirectional edges; undirected edges count both ways', () => {
    const t = traceFlow('b', [E('1', 'a', 'b', 'reverse'), E('2', 'b', 'c', 'both')]);
    expect([...t.downstream].sort()).toEqual(['a', 'c']); // reverse a-b: data goes b -> a
    expect([...t.upstream].sort()).toEqual(['c']);
    const u = traceFlow('b', [E('1', 'a', 'b', null)]);
    expect([...u.downstream, ...u.upstream].sort()).toEqual(['a', 'a']);
  });
  it('a node with no edges traces only itself; self loops are harmless', () => {
    expect([...traceFlow('n', []).nodeIds]).toEqual(['n']);
    expect(traceFlow('n', [E('1', 'n', 'n')]).nodeIds.size).toBe(1);
  });
});

describe('preset defaults and overrides', () => {
  it('metrics = fast dots, logs = normal dashes, traces = normal pulses', () => {
    expect(resolveFlowLook({ preset: 'metrics' })).toMatchObject({ speed: 'fast', style: 'dot' });
    expect(resolveFlowLook({ preset: 'logs' })).toMatchObject({ speed: 'normal', style: 'dash' });
    expect(resolveFlowLook({ preset: 'traces' })).toMatchObject({ speed: 'normal', style: 'pulse' });
    expect(resolveFlowLook({})).toEqual(BASE_FLOW);
    expect(PRESET_FLOW.metrics.density).toBeGreaterThan(PRESET_FLOW.traces.density);
  });
  it('edge data beats the preset; density is clamped; user presets can carry a look', () => {
    expect(resolveFlowLook({ preset: 'metrics', flowSpeed: 'slow', flowStyle: 'pulse', flowDensity: 3 })).toEqual({ speed: 'slow', style: 'pulse', density: 3 });
    expect(resolveFlowLook({ flowDensity: 99 }).density).toBe(8);
    expect(resolveFlowLook({ flowDensity: 0 }).density).toBe(BASE_FLOW.density);
    const user = [{ id: 'mine', name: 'Mine', color: '#fff', style: 'dash', speed: 'slow' }] as never;
    expect(resolveFlowLook({ preset: 'mine' }, user)).toMatchObject({ speed: 'slow', style: 'dash' });
  });
  it('per-edge on/off overrides the page mode; direction follows the arrowheads unless set', () => {
    expect(edgeFlows({}, true)).toBe(true);
    expect(edgeFlows({}, false)).toBe(false);
    expect(edgeFlows({ dataFlow: false }, true)).toBe(false);
    expect(edgeFlows({ dataFlow: true }, false)).toBe(true);
    expect(resolveFlowDir({}, 'end')).toBe('forward');
    expect(resolveFlowDir({}, 'start')).toBe('reverse');
    expect(resolveFlowDir({}, 'both')).toBe('both');
    expect(resolveFlowDir({}, 'none')).toBeNull();
    expect(resolveFlowDir({ flowDir: 'both' }, 'none')).toBe('both');
  });
});

describe('frame computation and the reduced-motion fallback', () => {
  const paths = buildFlowPaths([edge('a', 'x', 'y', [[0, 0], [300, 0]])], () => false);
  it('animated: packets move between frames and stay on the line', () => {
    const f0 = computeFrame(paths, 0, false);
    const f1 = computeFrame(paths, 0.5, false);
    expect(f0.length).toBe(packetCount(300, look.density));
    expect(f0.every((i) => i.kind === 'packet' && i.y === 0)).toBe(true);
    expect(f1[0].x).not.toBe(f0[0].x);
  });
  it('reduced motion: static chevrons, identical for any time, no packets', () => {
    const a = computeFrame(paths, 0, true);
    const b = computeFrame(paths, 12.3, true);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((i) => i.kind === 'chevron')).toBe(true);
    expect(a).toEqual(b);
  });
  it('visibility filter (trace mode) removes dimmed paths', () => {
    expect(computeFrame(paths, 0, false, () => false)).toEqual([]);
  });
});

describe('export markup', () => {
  const paths = buildFlowPaths([edge('a', 'x', 'y', [[0, 0], [100, 0], [100, 80]], 'forward', '#d9480f')], () => false);
  it('animated SVG: SMIL animateMotion along the routed path in the edge colour', () => {
    const svg = flowExportMarkup(paths, true);
    expect(svg).toContain('<animateMotion');
    expect(svg).toContain('path="M0 0 L100 0 L100 80"');
    expect(svg).toContain('#d9480f');
    expect(svg).toContain('repeatCount="indefinite"');
  });
  it('static (PNG): positioned packets, no animation', () => {
    const svg = flowExportMarkup(paths, false);
    expect(svg).not.toContain('animate');
    expect(svg).toMatch(/translate\(/);
  });
});

describe('serialization of flow settings', () => {
  const diagram = (data: Record<string, unknown>): unknown => ({ version: 1, nodes: [{ id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'a' } }, { id: 'b', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'b' } }], edges: [{ id: 'e', source: 'a', target: 'b', data }] });
  it('per-edge flow fields round-trip and bad values are rejected', () => {
    const ok = validateDiagram(diagram({ dataFlow: true, flowSpeed: 'fast', flowDensity: 2.5, flowStyle: 'pulse', flowDir: 'both' }));
    expect(ok.ok && ok.diagram.edges[0].data).toMatchObject({ dataFlow: true, flowSpeed: 'fast', flowDensity: 2.5, flowStyle: 'pulse', flowDir: 'both' });
    for (const bad of [{ flowSpeed: 'warp' }, { flowStyle: 'star' }, { flowDir: 'up' }, { flowDensity: 'many' }, { dataFlow: 'yes' }]) expect(validateDiagram(diagram(bad)).ok, JSON.stringify(bad)).toBe(false);
  });
  const project = (flow?: boolean): Project => ({ version: 2, id: 'p', name: 'P', createdAt: 1, updatedAt: 2, activePageId: 'g1', pages: [{ id: 'g1', name: 'One', nodes: [], edges: [], ...(flow !== undefined ? { flow } : {}) }, { id: 'g2', name: 'Two', nodes: [], edges: [] }] });
  it('page flow mode is saved in the project (per page)', () => {
    const r = validateProject(JSON.parse(JSON.stringify(project(true))));
    expect(r.ok && r.project.pages.map((p) => p.flow)).toEqual([true, undefined]);
    expect(validateProject({ ...project(), pages: [{ ...project().pages[0], flow: 'on' }] }).ok).toBe(false);
  });
  it('and in the .sdd file', () => {
    const back = readSdd(buildSdd(project(true)));
    expect(back.project.pages.map((p) => p.flow)).toEqual([true, undefined]);
  });
  void ({} as Diagram);
});
