import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../store/diagramStore';
import { kafkaProfile } from './profiles/kafka';
import { createNodesFromPaletteItem, getItem } from '../data/palette';
import { projectEdges } from './collapse';
import { clusterSection } from './palette';
import { PROFILES } from './profiles';
import { searchItems, registerSections, SECTIONS } from '../data/catalog';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const K = (o: Record<string, unknown> = {}) => ({ ...kafkaProfile.defaults, ...o });
const mk = (id: string, kind: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 900 }, width: 100, height: 96, data: { label: id, iconId: kind, clientKind: kind as never }, ...extra });
beforeEach(() => s().reset());

describe('createCluster / updateCluster', () => {
  it('creates the generated nodes and edges at a position; the root is selected; one undo removes all', () => {
    const id = s().createCluster('kafka', K({ brokers: 6, azs: 3 }), { x: 300, y: 200 })!;
    expect(id).toMatch(/^c_/);
    const root = s().nodes.find((n) => n.id === id)!;
    expect(root.position).toEqual({ x: 300, y: 200 });
    expect(root.selected).toBe(true);
    expect(s().nodes.filter((n) => n.data.label.endsWith(':9092') && n.type === 'icon')).toHaveLength(6);
    expect(s().nodes.filter((n) => n.type === 'group' && /^AZ/.test(n.data.label))).toHaveLength(3);
    expect(s().edges.length).toBeGreaterThan(0);
    s().undo();
    expect(s().nodes).toHaveLength(0);
    expect(s().edges).toHaveLength(0);
  });
  it('rejects unknown profiles and invalid params', () => {
    expect(s().createCluster('nope', {})).toBeNull();
    expect(s().createCluster('kafka', K({ brokers: 99 }))).toBeNull();
    expect(s().nodes).toHaveLength(0);
  });
  it('updateCluster regenerates, keeps a moved node and user additions, and is undoable', () => {
    const id = s().createCluster('kafka', K({ brokers: 3 }), { x: 0, y: 0 })!;
    const b2 = `${id}-broker-2`;
    s().setNodePosition(b2, { x: 640, y: 480 });
    s().addNode({ id: 'mine', type: 'icon', parentId: id, position: { x: 5, y: 5 }, data: { label: 'mine', iconId: 'service' } });
    expect(s().updateCluster(id, K({ brokers: 5 }))).toBe(true);
    expect(s().nodes.filter((n) => /^broker-\d :9092$/.test(n.data.label))).toHaveLength(5);
    expect(s().nodes.find((n) => n.id === b2)!.position).toEqual({ x: 640, y: 480 });
    expect(s().nodes.some((n) => n.id === 'mine')).toBe(true);
    expect(s().nodes.find((n) => n.id === id)!.data.params).toMatchObject({ brokers: 5 });
    s().undo();
    expect(s().nodes.filter((n) => /^broker-\d :9092$/.test(n.data.label))).toHaveLength(3);
  });
  it('updateCluster refuses invalid params / non-profile clusters', () => {
    const id = s().createCluster('kafka', K(), { x: 0, y: 0 })!;
    expect(s().updateCluster(id, K({ brokers: 0 }))).toBe(false);
    s().addNode({ id: 'plain', type: 'cluster', position: { x: 2000, y: 0 }, width: 300, height: 200, data: { label: 'plain' } });
    expect(s().updateCluster('plain', K())).toBe(false);
  });
  it('a collapsed generated cluster collapses to x N with the generated summary line', () => {
    const id = s().createCluster('kafka', K({ brokers: 3 }), { x: 0, y: 0 })!;
    s().toggleCollapse(id);
    const root = s().nodes.find((n) => n.id === id)!;
    expect(root.data.collapsed).toBe(true);
    expect(root.data.subtitle).toBe('KRaft · 3 controllers · 3 brokers · 1 AZ · RF3 / minISR2');
  });
});

describe('producers and consumers attach to a Kafka cluster', () => {
  it('produce = arrow into the cluster, consume = arrow out, regardless of drag direction; topic label', () => {
    const id = s().createCluster('kafka', K({ topics: [{ name: 'orders', partitions: 3, rf: 3 }] }), { x: 0, y: 0 })!;
    s().addNode(mk('prod', 'producer', { position: { x: -400, y: 0 } }));
    s().addNode(mk('cons', 'consumer', { position: { x: 1400, y: 0 } }));
    s().connect({ source: id, target: 'prod', sourceHandle: 'left', targetHandle: 'right' }); // dragged backwards
    s().connect({ source: 'cons', target: id, sourceHandle: 'left', targetHandle: 'right' }); // dragged backwards
    const produce = s().edges.find((e) => e.source === 'prod' || e.target === 'prod')!;
    const consume = s().edges.find((e) => e.source === 'cons' || e.target === 'cons')!;
    expect(produce).toMatchObject({ source: 'prod', target: id, label: 'orders' });
    expect(consume).toMatchObject({ source: id, target: 'cons', label: 'orders' });
    expect(produce.sourceHandle).toBe('right'); // handles swapped along with the ends
  });
  it('edges stay attached when the cluster is collapsed', () => {
    const id = s().createCluster('kafka', K(), { x: 0, y: 0 })!;
    s().addNode(mk('prod', 'producer', { position: { x: -400, y: 0 } }));
    s().connect({ source: 'prod', target: id, sourceHandle: 'right', targetHandle: 'left' });
    s().toggleCollapse(id);
    const shown = projectEdges(s().nodes, s().edges).filter((e) => e.source === 'prod');
    expect(shown).toHaveLength(1);
    expect(shown[0].target).toBe(id);
  });
  it('palette: Producer / Consumer carry the client kind; Consumer group is a group of three consumers', () => {
    let n = 0;
    const gen = (p: string) => `${p}${++n}`;
    expect(createNodesFromPaletteItem(getItem('producer')!, { x: 0, y: 0 }, gen)[0].data).toMatchObject({ clientKind: 'producer', iconId: 'producer' });
    expect(createNodesFromPaletteItem(getItem('consumer')!, { x: 0, y: 0 }, gen)[0].data.clientKind).toBe('consumer');
    const grp = createNodesFromPaletteItem(getItem('consumer-group')!, { x: 10, y: 20 }, gen);
    expect(grp[0]).toMatchObject({ type: 'group', position: { x: 10, y: 20 } });
    expect(grp[0].data.label).toBe('group: orders-svc');
    expect(grp.slice(1)).toHaveLength(3);
    expect(grp.slice(1).every((c) => c.parentId === grp[0].id && c.data.clientKind === 'consumer')).toBe(true);
  });
});

describe('palette Clusters section', () => {
  it('lists every profile with its logo; searchable; "Generic > Cluster" exists', () => {
    const sec = clusterSection();
    expect(sec.subs.flatMap((s) => s.items).map((i) => i.profileId).sort()).toEqual(PROFILES.map((p) => p.id).sort());
    expect(sec.subs.map((s) => s.label)).toEqual(expect.arrayContaining(['Databases', 'Messaging', 'Observability']));
    registerSections([sec]);
    expect(SECTIONS.some((x) => x.id === 'clusters')).toBe(true);
    expect(searchItems('kafka cluster').some((i) => i.profileId === 'kafka')).toBe(true);
    expect(searchItems('ha').length).toBeGreaterThan(0);
    expect(getItem('cluster')).toMatchObject({ kind: 'cluster' });
  });
});
