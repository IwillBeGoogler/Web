import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../store/diagramStore';
import { executeAction } from './actions';
import { useDialogStore } from './dialogs';
import { instantiate } from '../clusters/regenerate';
import { kafkaProfile } from '../clusters/profiles/kafka';
import { monitoringStack } from '../templates/monitoringStack';
import { normalizeLocks } from './graph';
import { parseProject, serializeProject, createProject } from './project';
import type { DiagramEdge, DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const base = (id: string, type: DiagramNode['type'], x: number, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type, position: { x, y }, width: 120, height: 80, data: { label: id }, ...extra });
beforeEach(() => s().reset());

const gone = (id: string) => !s().nodes.some((n) => n.id === id);
/** delete like the Delete key does; a group with children asks first: answer "Delete with children" */
const del = async (id: string) => {
  s().selectOnly('node', id);
  executeAction('delete', { nodeId: id });
  const ask = useDialogStore.getState().stack[0];
  if (ask?.kind === 'choice') useDialogStore.getState().close(ask.id, 'all');
  else if (ask?.kind === 'confirm') useDialogStore.getState().close(ask.id, true);
  await new Promise((r) => setTimeout(r, 0));
};

describe('every kind of node can be selected and deleted', () => {
  const kinds: [string, DiagramNode][] = [
    ['icon node', base('k', 'icon', 0, 0, { data: { label: 'k', iconId: 'service' } })],
    ['shape', base('k', 'shape', 0, 0, { data: { label: '', shape: 'diamond' } })],
    ['text', base('k', 'text', 0, 0)],
    ['sticky note', base('k', 'sticky', 0, 0)],
    ['drawing', base('k', 'draw', 0, 0, { data: { label: '', path: 'M0 0 L10 10' } })],
    ['group', base('k', 'group', 0, 0, { width: 300, height: 200 })],
    ['cluster', base('k', 'cluster', 0, 0, { width: 300, height: 200 })],
  ];
  for (const [name, node] of kinds)
    it(name, async () => {
      s().addNode(node);
      await del('k');
      expect(gone('k')).toBe(true);
    });
  it('collapsed cluster (the compact proxy node)', async () => {
    s().addNode(base('C', 'cluster', 0, 0, { width: 400, height: 300 }));
    s().addNode(base('m', 'icon', 20, 60, { parentId: 'C' }));
    s().toggleCollapse('C');
    await del('C');
    expect(s().nodes).toHaveLength(0);
  });
  it('profile-generated nodes: broker, AZ sub-group, controller, optional component', async () => {
    const g = instantiate(kafkaProfile, { ...kafkaProfile.defaults, brokers: 6, azs: 3, schemaRegistry: true }, 'k', { x: 0, y: 0 });
    for (const n of g.nodes) s().addNode(n);
    s().addEdge({ source: 'k-broker-1', target: 'k-broker-2' });
    for (const id of ['k-broker-1', 'k-az-1', 'k-ctrl-1', 'k-sr']) {
      const before = s().nodes.length;
      await del(id);
      expect(gone(id), id).toBe(true);
      expect(s().nodes.length).toBeLessThan(before);
    }
  });
  it('template nodes (nested in groups)', async () => {
    const t = monitoringStack();
    s().loadDiagram(t);
    for (const id of ['go', 'exporters', 'alertmanager', 'g-apps', 'title', 'grafana']) {
      await del(id);
      expect(gone(id), id).toBe(true);
    }
  });
  it('a node that was locked and unlocked again is deletable', async () => {
    s().addNode(base('a', 'icon', 0));
    s().selectOnly('node', 'a');
    s().toggleLock();
    expect(s().nodes[0].deletable).toBe(false);
    s().toggleLock();
    expect(s().nodes[0].deletable).toBeUndefined();
    await del('a');
    expect(gone('a')).toBe(true);
  });
  it('legacy nodes carrying stale deletable:false / draggable:false are repaired on load (and are deletable)', async () => {
    s().loadDiagram({ nodes: [base('old', 'icon', 0, 0, { deletable: false, draggable: false })], edges: [] });
    expect(s().nodes[0].deletable).toBeUndefined();
    await del('old');
    expect(gone('old')).toBe(true);
    const p = createProject('x');
    p.pages[0].nodes = [base('old2', 'icon', 0, 0, { deletable: false, selectable: false })];
    const r = parseProject(serializeProject(p));
    expect(r.ok && r.project.pages[0].nodes[0].deletable).toBeUndefined();
    s().loadProject(r.ok ? r.project : p);
    expect(s().nodes[0].selectable).toBeUndefined();
    expect(normalizeLocks([base('l', 'icon', 0, 0, { data: { label: 'l', locked: true } })])[0]).toMatchObject({ draggable: false, deletable: false });
  });
  it('locked descendants of a group are kept (with a notice) while the rest is deleted', async () => {
    s().addNode(base('g', 'group', 0, 0, { width: 400, height: 300 }));
    s().addNode(base('a', 'icon', 20, 60, { parentId: 'g' }));
    s().addNode(base('b', 'icon', 160, 60, { parentId: 'g', data: { label: 'b', locked: true } }));
    s().selectOnly('node', 'g');
    expect(s().deleteSelection()).toBe(1);
    expect(s().nodes.map((n) => n.id)).toEqual(['b']);
    expect(s().nodes[0].parentId).toBeUndefined();
  });
});

describe('every kind of edge can be selected and deleted', () => {
  const edgeKinds: [string, Partial<DiagramEdge>][] = [
    ['plain', {}],
    ['labelled', { label: 'x' }],
    ['dashed teal', { data: { dashed: true, color: '#0f7b6c' } }],
    ['straight', { data: { lineType: 'straight' } }],
    ['curved', { data: { lineType: 'curved' } }],
    ['manual route', { data: { manual: true, waypoints: [{ x: 5, y: 5 }] } }],
    ['replication', { data: { kind: 'replication', replMode: 'sync' } }],
    ['unlocked after lock', { data: { locked: false } }],
  ];
  for (const [name, extra] of edgeKinds)
    it(name, async () => {
      s().addNode(base('a', 'icon', 0));
      s().addNode(base('b', 'icon', 400));
      s().addEdge({ source: 'a', target: 'b', ...extra });
      const id = s().edges[0].id;
      s().selectOnly('edge', id);
      executeAction('delete', { edgeId: id });
      expect(s().edges).toHaveLength(0);
    });
  it('an edge locked and unlocked again is deletable (no stale deletable:false)', async () => {
    s().addNode(base('a', 'icon', 0));
    s().addNode(base('b', 'icon', 400));
    s().addEdge({ source: 'a', target: 'b' });
    s().selectOnly('edge', s().edges[0].id);
    s().toggleLock();
    expect((s().edges[0] as { deletable?: boolean }).deletable).toBe(false);
    s().toggleLock();
    expect((s().edges[0] as { deletable?: boolean }).deletable).toBeUndefined();
    executeAction('delete', { edgeId: s().edges[0].id });
    expect(s().edges).toHaveLength(0);
  });
  it('a merged display edge of a collapsed cluster deletes all underlying edges', async () => {
    s().addNode(base('C', 'cluster', 0, 0, { width: 400, height: 300 }));
    s().addNode(base('m1', 'icon', 20, 60, { parentId: 'C' }));
    s().addNode(base('m2', 'icon', 160, 60, { parentId: 'C' }));
    s().addNode(base('app', 'icon', 900, 0));
    s().addEdge({ source: 'app', target: 'm1', label: 'writes' });
    s().addEdge({ source: 'app', target: 'm2', label: 'writes' });
    s().toggleCollapse('C');
    const id = s().edges[0].id;
    s().selectOnly('edge', id);
    executeAction('delete', { edgeId: id });
    expect(s().edges).toHaveLength(0);
  });
});
