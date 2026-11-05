import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { executeAction } from '../actions';
import { getMenuItems, flattenMenu } from '../menu';
import { parseDiagram, serializeDiagram } from '../serialization';
import { buildSdd, readSdd } from '../sdd/sdd';
import { createProject } from '../project';
import { monitoringStack } from '../../templates/monitoringStack';
import type { DiagramNode } from '../../types';

const s = () => useDiagramStore.getState();
const n = (id: string, x: number, y = 0): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id } });
beforeEach(() => {
  s().reset();
  for (const x of [n('a', 0), n('b', 400), n('c', 800)]) s().addNode(x);
});

describe('edge route state', () => {
  it('user connections float: no side is pinned, ends follow the shapes', () => {
    s().connect({ source: 'a', target: 'b', sourceHandle: 'bottom', targetHandle: 'top' });
    expect(s().edges[0].data?.pinSource).toBeUndefined();
    expect(s().edges[0].data?.pinTarget).toBeUndefined();
    s().addEdge({ source: 'b', target: 'c' });
    expect(s().edges[1].data?.pinSource).toBeUndefined();
  });
  it('setEdgeRoute marks the edge manual with waypoints; resetRoute returns it to auto (undoable)', () => {
    s().addEdge({ source: 'a', target: 'b' });
    const id = s().edges[0].id;
    s().setEdgeRoute(id, [{ x: 200, y: -50 }, { x: 300, y: -50 }]);
    expect(s().edges[0].data).toMatchObject({ manual: true, waypoints: [{ x: 200, y: -50 }, { x: 300, y: -50 }] });
    s().resetRoute(id);
    expect(s().edges[0].data?.manual).toBeUndefined();
    expect(s().edges[0].data?.waypoints).toBeUndefined();
    s().undo();
    expect(s().edges[0].data?.manual).toBe(true);
  });
  it('record:false edits (live dragging) do not add history entries', () => {
    s().addEdge({ source: 'a', target: 'b' });
    const id = s().edges[0].id;
    s().snapshot();
    const past = s().past.length;
    s().setEdgeRoute(id, [{ x: 1, y: 1 }], false);
    s().setEdgeRoute(id, [{ x: 2, y: 2 }], false);
    s().setLabelPosition(id, 0.3, 4, false);
    expect(s().past.length).toBe(past);
    expect(s().edges[0].data).toMatchObject({ waypoints: [{ x: 2, y: 2 }], labelT: 0.3, labelOffset: 4 });
    s().undo(); // one undo undoes the whole drag
    expect(s().edges[0].data?.waypoints).toBeUndefined();
  });
  it('label position is clamped to 0..1', () => {
    s().addEdge({ source: 'a', target: 'b' });
    s().setLabelPosition(s().edges[0].id, 4);
    expect(s().edges[0].data?.labelT).toBe(1);
    s().setLabelPosition(s().edges[0].id, -2);
    expect(s().edges[0].data?.labelT).toBe(0);
  });
  it('reconnectEdge changes the ends and leaves the moved end floating; invalid targets are ignored', () => {
    s().addEdge({ source: 'a', target: 'b' });
    const id = s().edges[0].id;
    expect(s().reconnectEdge(id, { target: 'c', targetSide: 'top' })).toBe(true);
    expect(s().edges[0]).toMatchObject({ source: 'a', target: 'c' });
    expect(s().edges[0].data?.pinTarget).toBeUndefined();
    expect(s().edges[0].data?.manual).toBeUndefined(); // route resets when an end moves
    expect(s().reconnectEdge(id, { target: 'nope' })).toBe(false);
    expect(s().reconnectEdge(id, { source: 'c', target: 'c' })).toBe(false);
  });
  it('tidyEdges / "Re-route all edges" clears every manual route and label offset', () => {
    s().addEdge({ source: 'a', target: 'b' });
    s().addEdge({ source: 'b', target: 'c' });
    s().setEdgeRoute(s().edges[0].id, [{ x: 1, y: 1 }]);
    s().setEdgeRoute(s().edges[1].id, [{ x: 2, y: 2 }]);
    s().tidyEdges();
    expect(s().edges.every((e) => !e.data?.manual && !e.data?.waypoints)).toBe(true);
    s().undo();
    expect(s().edges.every((e) => e.data?.manual)).toBe(true);
  });
  it('locked edges are not reconnected or rerouted', () => {
    s().addEdge({ source: 'a', target: 'b', data: { locked: true } });
    expect(s().reconnectEdge(s().edges[0].id, { target: 'c' })).toBe(false);
  });
});

describe('menu + actions', () => {
  it('edge menu offers Reset route only for manual edges; pane menu offers Re-route all edges', () => {
    const edge = { id: 'e', source: 'a', target: 'b', selected: true, data: {} };
    const ctx = { nodes: [], edges: [edge], hasClipboard: false, hasStyleClip: false, pageCount: 1 };
    expect(flattenMenu(getMenuItems({ type: 'edge', id: 'e' }, ctx)).some((i) => i.id === 'reset-route')).toBe(false);
    const manual = { ...ctx, edges: [{ ...edge, data: { manual: true } }] };
    expect(flattenMenu(getMenuItems({ type: 'edge', id: 'e' }, manual)).some((i) => i.id === 'reset-route')).toBe(true);
    const pane = flattenMenu(getMenuItems({ type: 'pane' }, ctx));
    expect(pane.some((i) => i.id === 'tidy-edges' && /re-route/i.test(i.label))).toBe(true);
  });
  it('actions: reset-route, tidy-edges, edgeKind, line types incl. step-rounded and markers', () => {
    s().addEdge({ source: 'a', target: 'b', selected: true });
    const id = s().edges[0].id;
    s().setEdgeRoute(id, [{ x: 1, y: 1 }]);
    executeAction('reset-route', { edgeId: id });
    expect(s().edges[0].data?.manual).toBeUndefined();
    executeAction('lineType:step-rounded', { edgeId: id });
    expect(s().edges[0].data?.lineType).toBe('step-rounded');
    executeAction('marker-end:diamond', { edgeId: id });
    executeAction('marker-start:crowfoot', { edgeId: id });
    expect(s().edges[0].data).toMatchObject({ endMarker: 'diamond', startMarker: 'crowfoot' });
    s().setEdgeRoute(id, [{ x: 5, y: 5 }]);
    executeAction('tidy-edges', {});
    expect(s().edges[0].data?.manual).toBeUndefined();
  });
});

describe('persistence', () => {
  it('waypoints, pinned sides, label position, manual flag, line type and markers round-trip through JSON and .sdd', () => {
    s().addEdge({ source: 'a', target: 'b', data: { manual: true, waypoints: [{ x: 10, y: 20 }], pinSource: 'top', pinTarget: 'bottom', labelT: 0.3, labelOffset: -6, lineType: 'step-rounded', cornerRadius: 10, startMarker: 'circle', endMarker: 'crowfoot' } });
    const data = s().edges[0].data;
    const j = parseDiagram(serializeDiagram({ version: 1, nodes: s().nodes, edges: s().edges }));
    expect(j.ok && j.diagram.edges[0].data).toEqual(data);
    const p = createProject('x');
    p.pages[0].nodes = s().nodes;
    p.pages[0].edges = s().edges;
    expect(readSdd(buildSdd(p)).project.pages[0].edges[0].data).toEqual(data);
  });
  it('invalid route fields are rejected on import', () => {
    const base = { version: 1, nodes: [n('a', 0), n('b', 1)], edges: [{ id: 'e', source: 'a', target: 'b', data: {} as Record<string, unknown> }] };
    for (const data of [{ waypoints: [{ x: 'a', y: 1 }] }, { waypoints: 'no' }, { manual: 'yes' }, { labelT: 'x' }, { pinSource: 'middle' }, { endMarker: 'star' }]) {
      const r = parseDiagram(JSON.stringify({ ...base, edges: [{ ...base.edges[0], data }] }));
      expect(r.ok, JSON.stringify(data)).toBe(false);
    }
  });
  it('the monitoring template has exactly the original edge labels (no duplicates on wrong edges)', () => {
    const labels = monitoringStack().edges.map((e) => e.label).filter(Boolean).sort();
    const expected = ['Metrics', '/metrics', 'Logs', 'OTLP traces · logs', 'Alerts', 'remote_write', 'span metrics', 'Traces', 'Logs', 'profiles (pull)', 'profiles (SDK push)', 'LogsQL', 'notify', 'Query', "dead man's switch"].sort();
    expect(labels).toEqual(expected);
    const by = (l: string) => monitoringStack().edges.filter((e) => e.label === l);
    expect(by('Logs')).toHaveLength(2);
    expect(by('span metrics')[0].data?.dashed).toBe(true);
    expect(by("dead man's switch")[0].data?.dashed).toBe(true);
    expect(by('profiles (SDK push)')[0].data).toMatchObject({ dashed: true, color: '#0f7b6c' });
  });
});
