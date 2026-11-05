import { describe, expect, it } from 'vitest';
import { collectFlowPaths, flowTip, traceEdges } from './build';
import { resolveSettings } from '../settings';
import { computeRoutes, DEFAULT_ROUTING } from '../routing';
import type { DiagramEdge, DiagramNode } from '../../types';

const settings = resolveSettings(undefined, undefined);
const node = (id: string, x: number, y: number, type: DiagramNode['type'] = 'icon'): DiagramNode => ({ id, type, position: { x, y }, width: type === 'junction' ? 10 : 120, height: type === 'junction' ? 10 : 96, data: { label: id } });
const edge = (id: string, source: string, target: string, data: DiagramEdge['data'] = {}): DiagramEdge => ({ id, source, target, data: { arrows: 'end', ...data } });
const run = (nodes: DiagramNode[], edges: DiagramEdge[], pageFlow = true) => {
  const routes = computeRoutes(nodes, edges, { ...DEFAULT_ROUTING, edgeDefaults: settings.edge });
  return { routes, paths: collectFlowPaths(nodes, edges, routes, settings, pageFlow) };
};

describe('collectFlowPaths', () => {
  const nodes = [node('a', 0, 0), node('b', 400, 0), node('c', 400, 300)];
  it('page flow on: every directed edge gets a path along its routed points, in the edge colour', () => {
    const edges = [edge('e1', 'a', 'b', { color: '#d9480f' }), edge('e2', 'b', 'c')];
    const { routes, paths } = run(nodes, edges);
    expect(paths.map((p) => p.edgeIds.join())).toEqual(['e1', 'e2']);
    expect(paths[0].color).toBe('#d9480f');
    expect(paths[0].points).toEqual(routes.get('e1')!.points);
  });
  it('page flow off: nothing, unless an edge forces it on; per-edge off wins when the page is on', () => {
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c', { dataFlow: true })];
    expect(run(nodes, edges, false).paths.map((p) => p.edgeIds[0])).toEqual(['e2']);
    expect(run(nodes, [edge('e1', 'a', 'b', { dataFlow: false })], true).paths).toEqual([]);
  });
  it('arrowheads decide the direction: none = no packets, both = two paths, start = reversed', () => {
    const { paths } = run(nodes, [edge('n', 'a', 'b', { arrows: 'none' }), edge('d', 'b', 'c', { arrows: 'both' })]);
    expect(paths.filter((p) => p.edgeIds[0] === 'n')).toHaveLength(0);
    expect(paths.filter((p) => p.edgeIds[0] === 'd')).toHaveLength(2);
    const r = run(nodes, [edge('s', 'a', 'b', { arrows: 'start' })]);
    expect(r.paths[0].from).toBe('b');
    expect(r.paths[0].points[0]).toEqual(r.routes.get('s')!.points.at(-1));
  });
  it('preset defaults reach the path look; explicit flow fields override them', () => {
    const { paths } = run(nodes, [edge('m', 'a', 'b', { preset: 'metrics' }), edge('t', 'b', 'c', { preset: 'traces', flowStyle: 'dash', flowSpeed: 'slow' })]);
    expect(paths[0].look).toMatchObject({ speed: 'fast', style: 'dot' });
    expect(paths[1].look).toMatchObject({ speed: 'slow', style: 'dash' });
  });
  it('a junction bus is stitched into one timing path', () => {
    const jn = [node('s', 0, 0), node('j', 300, 40, 'junction'), node('t', 600, 0)];
    const { paths } = run(jn, [edge('in', 's', 'j', { arrows: 'none' }), edge('out', 'j', 't')]);
    // `in` has no arrowhead of its own (junction ends hide them): explicit direction makes it flow
    const forced = run(jn, [edge('in', 's', 'j', { flowDir: 'forward' }), edge('out', 'j', 't')]);
    expect(forced.paths).toHaveLength(1);
    expect(forced.paths[0].edgeIds).toEqual(['in', 'out']);
    expect(paths.every((p) => p.edgeIds.length >= 1)).toBe(true);
  });
});

describe('traceEdges / tooltip', () => {
  it('traceEdges resolves directions from arrowheads (null when none)', () => {
    const t = traceEdges([edge('a', 'x', 'y'), edge('b', 'x', 'y', { arrows: 'none' }), edge('c', 'x', 'y', { arrows: 'both' })], settings);
    expect(t.map((e) => e.dir)).toEqual(['forward', null, 'both']);
  });
  it('flowTip shows the label and stats; plain label when not flowing', () => {
    const nodes = [node('a', 0, 0), node('b', 400, 0)];
    const e = { ...edge('e', 'a', 'b', { preset: 'logs' }), label: 'logs :3100' };
    const { routes } = run(nodes, [e]);
    const tip = flowTip(e, routes.get('e'), settings, true);
    expect(tip).toContain('logs :3100');
    expect(tip).toMatch(/forward, normal, dashs/);
    expect(tip).toMatch(/\d+ packets? on \d+px/);
    expect(flowTip(e, routes.get('e'), settings, false)).toBe('logs :3100');
  });
});
