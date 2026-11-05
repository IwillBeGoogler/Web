import { describe, expect, it } from 'vitest';
import type { Project } from '../types';
import { diffProjects, describeChange, diffSummary } from './versionDiff';

const n = (id: string, x = 0, y = 0, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ id, type: 'icon', position: { x, y }, data: { label: id, ...data }, ...extra });
const e = (id: string, source: string, target: string, extra: Record<string, unknown> = {}) => ({ id, source, target, ...extra });
const doc = (nodes: unknown[], edges: unknown[] = [], extra: Partial<Project> = {}): Project =>
  ({ version: 2, id: 'f', name: 'F', createdAt: 1, updatedAt: 1, activePageId: 'p', pages: [{ id: 'p', name: 'Page', nodes, edges }], ...extra }) as unknown as Project;

describe('diffProjects', () => {
  it('identical documents (and transient UI state) produce an empty diff', () => {
    const a = doc([n('a'), n('b')], [e('e1', 'a', 'b')]);
    const b = doc([n('a', 0, 0, {}, { selected: true, dragging: true, measured: { width: 9, height: 9 } }), n('b')], [e('e1', 'a', 'b', { selected: true })]);
    const d = diffProjects(a, b);
    expect(d.isEmpty).toBe(true);
    expect(diffSummary(d)).toBe('No differences');
  });

  it('added, removed and changed nodes and edges (by id)', () => {
    const a = doc([n('keep'), n('gone'), n('edited', 0, 0, { label: 'Old' })], [e('e1', 'keep', 'gone'), e('e2', 'keep', 'edited')]);
    const b = doc([n('keep'), n('edited', 0, 0, { label: 'New' }), n('fresh')], [e('e2', 'keep', 'edited', { label: 'calls' }), e('e3', 'keep', 'fresh')]);
    const d = diffProjects(a, b);
    expect(d.nodes.added.map((x) => x.id)).toEqual(['fresh']);
    expect(d.nodes.removed.map((x) => x.id)).toEqual(['gone']);
    expect(d.nodes.changed.map((x) => x.id)).toEqual(['edited']);
    expect(d.edges.added.map((x) => x.id)).toEqual(['e3']);
    expect(d.edges.removed.map((x) => x.id)).toEqual(['e1']);
    expect(d.edges.changed.map((x) => x.id)).toEqual(['e2']);
    expect(d.isEmpty).toBe(false);
    expect(diffSummary(d)).toBe('2 added, 2 removed, 2 changed');
  });

  it('says what changed in a node: moved, resized, renamed, restyled', () => {
    const a = doc([n('x', 10, 10, { label: 'A', fill: '#fff' }, { width: 100, height: 50 })]);
    const b = doc([n('x', 90, 10, { label: 'B', fill: '#000' }, { width: 200, height: 50 })]);
    const c = diffProjects(a, b).nodes.changed[0];
    expect(c.fields.sort()).toEqual(['label', 'moved', 'resized', 'style']);
    expect(describeChange(c)).toBe('moved, resized, renamed, restyled');
    expect(c.before.position).toEqual({ x: 10, y: 10 });
    expect(c.after.position).toEqual({ x: 90, y: 10 });
  });

  it('a pure move is only "moved"; nested data (table columns) counts as content', () => {
    const a = doc([n('t', 0, 0, { columns: [{ id: 'c1', name: 'id' }] })]);
    const moved = doc([n('t', 5, 5, { columns: [{ id: 'c1', name: 'id' }] })]);
    expect(diffProjects(a, moved).nodes.changed[0].fields).toEqual(['moved']);
    const edited = doc([n('t', 0, 0, { columns: [{ id: 'c1', name: 'id' }, { id: 'c2', name: 'email' }] })]);
    expect(diffProjects(a, edited).nodes.changed[0].fields).toEqual(['content']);
  });

  it('edges: relabelled, rerouted (endpoints), restyled', () => {
    const a = doc([n('a'), n('b'), n('c')], [e('e', 'a', 'b', { label: 'x', color: '#111' })]);
    const b = doc([n('a'), n('b'), n('c')], [e('e', 'a', 'c', { label: 'y', color: '#222' })]);
    const c = diffProjects(a, b).edges.changed[0];
    expect(c.fields.sort()).toEqual(['endpoints', 'label', 'style']);
    expect(describeChange(c)).toBe('rerouted, relabelled, restyled');
  });

  it('page / file level: renamed file, several pages are compared page by page (matched by id)', () => {
    const a = doc([n('a')], [], { name: 'Old name' });
    const b = doc([n('a'), n('b')], [], { name: 'New name' });
    const d = diffProjects(a, b);
    expect(d.nameChanged).toEqual({ from: 'Old name', to: 'New name' });
    const multiA = { ...a, pages: [...a.pages, { id: 'p2', name: 'Two', nodes: [n('z')], edges: [] }] } as Project;
    const multiB = { ...a, pages: [...a.pages, { id: 'p2', name: 'Two', nodes: [], edges: [] }] } as Project;
    const d2 = diffProjects(multiA, multiB);
    expect(d2.nodes.removed.map((x) => x.id)).toEqual(['z']);
  });

  it('is deterministic and does not mutate its input', () => {
    const a = doc([n('a'), n('b')]);
    const b = doc([n('b', 1, 1), n('a')]);
    const before = JSON.stringify([a, b]);
    expect(diffProjects(a, b)).toEqual(diffProjects(a, b));
    expect(JSON.stringify([a, b])).toBe(before);
  });

  it('large documents stay fast (5000 nodes)', () => {
    const big = (shift: number) => doc(Array.from({ length: 5000 }, (_, i) => n(`n${i}`, i + (i % 100 === 0 ? shift : 0), 0)));
    const t = performance.now();
    const d = diffProjects(big(0), big(1));
    expect(d.nodes.changed).toHaveLength(50);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe('diffProjects: UML data', () => {
  const only = (a: Project, b: Project) => diffProjects(a, b).nodes.changed[0]?.fields;
  const nd = (type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id: 'x', type, position: { x: 0, y: 0 }, data: { label: 'X', ...data }, ...extra });

  it('activity: kind, guard on a flow, swimlane parent and object state', () => {
    const a = doc([nd('activity', { actKind: 'action' }), nd('activity', { actKind: 'object', objectState: 'new' })].map((x, i) => ({ ...x, id: `a${i}` })), [e('f', 'a0', 'a1', { label: '[ok]', data: { uml: { kind: 'transition' } } })]);
    const b = doc([nd('activity', { actKind: 'decision' }), nd('activity', { actKind: 'object', objectState: 'paid' })].map((x, i) => ({ ...x, id: `a${i}` })), [e('f', 'a0', 'a1', { label: '[no]', data: { uml: { kind: 'transition' } } })]);
    const d = diffProjects(a, b);
    expect(d.nodes.changed.map((c) => [c.id, c.fields])).toEqual([['a0', ['content']], ['a1', ['content']]]);
    expect(d.edges.changed[0].fields).toEqual(['label']);
    const lane = doc([nd('activity', { actKind: 'action' }, { parentId: 'laneA' })]);
    const lane2 = doc([nd('activity', { actKind: 'action' }, { parentId: 'laneB' })]);
    expect(only(lane, lane2)).toEqual(['nested']);
    expect(describeChange(diffProjects(lane, lane2).nodes.changed[0])).toBe('reparented');
  });

  it('deployment: nesting into another node and the artifact kind', () => {
    const a = doc([nd('deployment', { depKind: 'artifact' }, { parentId: 'srv1' })]);
    const b = doc([nd('deployment', { depKind: 'artifact' }, { parentId: 'srv2' })]);
    expect(only(a, b)).toEqual(['nested']);
    const k = doc([nd('deployment', { depKind: 'component' }, { parentId: 'srv1' })]);
    expect(only(a, k)).toEqual(['content']);
  });

  it('object diagram: slots are their own change (value edit, added slot), a pure rename is not', () => {
    const slots = (v: string) => [{ id: 's1', name: 'qty', value: v }];
    const a = doc([nd('object', { className: 'Order', slots: slots('1') })]);
    expect(only(a, doc([nd('object', { className: 'Order', slots: slots('2') })]))).toEqual(['slots']);
    expect(only(a, doc([nd('object', { className: 'Order', slots: [...slots('1'), { id: 's2', name: 'x', value: 'y' }] })]))).toEqual(['slots']);
    expect(only(a, doc([nd('object', { label: 'Y', className: 'Order', slots: slots('1') })]))).toEqual(['label']);
    expect(describeChange(diffProjects(a, doc([nd('object', { className: 'Order', slots: slots('2') })])).nodes.changed[0])).toBe('slots edited');
  });

  it('timing diagram: changes, messages and durations are "waveforms edited", the title is a rename', () => {
    const base = { end: 100, unit: 'ms', lifelines: [{ id: 'l1', name: 'A', kind: 'robust', states: ['x', 'y'] }], changes: [{ id: 'c1', life: 'l1', t: 0, state: 'x' }], messages: [], durations: [] };
    const a = doc([nd('timing', base)]);
    expect(only(a, doc([nd('timing', { ...base, changes: [{ id: 'c1', life: 'l1', t: 10, state: 'x' }] })]))).toEqual(['timing']);
    expect(only(a, doc([nd('timing', { ...base, end: 200 })]))).toEqual(['timing']);
    expect(only(a, doc([nd('timing', { ...base, label: 'Y' })]))).toEqual(['label']);
    expect(describeChange(diffProjects(a, doc([nd('timing', { ...base, unit: 's' })])).nodes.changed[0])).toBe('waveforms edited');
  });

  it('communication diagram: numbered messages on a link are their own change, the derived label is not', () => {
    const link = (messages: unknown[], label: string, roles = {}) => e('l', 'a', 'b', { label, data: { uml: { kind: 'link', ...roles, ...(messages.length ? { messages } : {}) } } });
    const m1 = [{ id: 'm1', seq: '1', text: 'go()', dir: 'fwd' }];
    const m2 = [{ id: 'm1', seq: '1', text: 'stop()', dir: 'fwd' }];
    const a = doc([nd('object', {}, { id: 'a' }), nd('object', {}, { id: 'b' })], [link(m1, '1: go() →')]);
    const b = doc([nd('object', {}, { id: 'a' }), nd('object', {}, { id: 'b' })], [link(m2, '1: stop() →')]);
    expect(diffProjects(a, b).edges.changed[0].fields).toEqual(['messages']);
    expect(describeChange(diffProjects(a, b).edges.changed[0])).toBe('numbered messages edited');
    const c = doc([nd('object', {}, { id: 'a' }), nd('object', {}, { id: 'b' })], [link(m1, '1: go() →', { sourceRole: 'x' })]);
    expect(diffProjects(a, c).edges.changed[0].fields).toEqual(['relation']);
  });

  it('component: ports (add, side, rename) and connectors that move to another port', () => {
    const ports = (side: string, name = 'IPay') => [{ id: 'p1', name, kind: 'provided', side, offset: 0.5 }];
    const a = doc([nd('component', { compKind: 'component', ports: ports('left') })]);
    expect(only(a, doc([nd('component', { compKind: 'component', ports: ports('right') })]))).toEqual(['ports']);
    expect(only(a, doc([nd('component', { compKind: 'component', ports: ports('left', 'IPay2') })]))).toEqual(['ports']);
    expect(only(a, doc([nd('component', { compKind: 'component' })]))).toEqual(['ports']);
    const ea = doc([n('a'), n('b')], [e('c', 'a', 'b', { sourceHandle: 'port-p1' })]);
    const eb = doc([n('a'), n('b')], [e('c', 'a', 'b', { sourceHandle: 'port-p2' })]);
    expect(diffProjects(ea, eb).edges.changed[0].fields).toEqual(['endpoints']);
  });

  it('package relations: import -> access is a relation change, not "restyled"; label and style stay separate', () => {
    const rel = (kind: string, extra: Record<string, unknown> = {}) => doc([n('p1'), n('p2')], [e('r', 'p1', 'p2', { data: { uml: { kind, ...extra } } })]);
    const d = diffProjects(rel('import'), rel('access'));
    expect(d.edges.changed[0].fields).toEqual(['relation']);
    expect(describeChange(d.edges.changed[0])).toBe('relation changed');
    expect(diffProjects(rel('import'), rel('import', { srcMult: '1' })).edges.changed[0].fields).toEqual(['relation']);
    const styled = doc([n('p1'), n('p2')], [e('r', 'p1', 'p2', { data: { uml: { kind: 'import' }, waypoints: [{ x: 1, y: 1 }] } })]);
    expect(diffProjects(rel('import'), styled).edges.changed[0].fields).toEqual(['style']);
    expect(diffProjects(rel('import'), rel('import')).isEmpty).toBe(true);
  });

  it('state: entry / exit activities and entry-point / exit-point pseudo states', () => {
    const a = doc([nd('state', { stateKind: 'simple', activity: 'entry / start' })]);
    expect(only(a, doc([nd('state', { stateKind: 'simple', activity: 'entry / start\nexit / stop' })]))).toEqual(['behavior']);
    expect(describeChange(diffProjects(a, doc([nd('state', { stateKind: 'simple', activity: 'exit / stop' })])).nodes.changed[0])).toBe('entry/exit edited');
    expect(only(doc([nd('state', { stateKind: 'entryPoint' })]), doc([nd('state', { stateKind: 'exitPoint' })]))).toEqual(['content']);
  });

  it('sequence: a reordered, added or edited item is "messages edited"; moving the whole lifeline set is not', () => {
    const m = (id: string, text: string) => ({ type: 'message', id, from: 'A', to: 'B', text });
    const seq = (items: unknown[]) => doc([nd('sequence', { participants: [{ id: 'A' }, { id: 'B' }], items, autonumber: false })]);
    const a = seq([m('1', 'hi'), m('2', 'ok')]);
    expect(only(a, seq([m('2', 'ok'), m('1', 'hi')]))).toEqual(['sequence']);
    expect(only(a, seq([m('1', 'hi'), m('2', 'ok'), m('3', 'bye')]))).toEqual(['sequence']);
    expect(only(a, seq([m('1', 'HI'), m('2', 'ok')]))).toEqual(['sequence']);
    const fragA = seq([{ type: 'fragment', id: 'f', sections: [{ items: [m('1', 'hi')] }] }]);
    const fragB = seq([{ type: 'fragment', id: 'f', sections: [{ items: [m('1', 'changed')] }] }]);
    expect(only(fragA, fragB)).toEqual(['sequence']); // nested items too
    expect(diffProjects(a, seq([m('1', 'hi'), m('2', 'ok')])).isEmpty).toBe(true);
  });

  it('archRef: added, retargeted and removed cross-links', () => {
    const ref = (nodeId: string) => ({ fileId: 'f2', nodeId });
    const a = doc([nd('icon', { archRef: ref('n1') })]);
    expect(only(a, doc([nd('icon', { archRef: ref('n2') })]))).toEqual(['link']);
    expect(only(doc([nd('icon', {})]), a)).toEqual(['link']);
    expect(only(a, doc([nd('icon', {})]))).toEqual(['link']);
    expect(describeChange(diffProjects(a, doc([nd('icon', {})])).nodes.changed[0])).toBe('link changed');
  });

  it('css style other than the size (opacity) is a restyle; width/height inside style is a resize', () => {
    const a = doc([nd('shape', {}, { style: { width: 10, height: 10 } })]);
    expect(only(a, doc([nd('shape', {}, { style: { width: 10, height: 10, opacity: 0.5 } })]))).toEqual(['style']);
    expect(only(a, doc([nd('shape', {}, { style: { width: 20, height: 10 } })]))).toEqual(['resized']);
  });

  it('several kinds of change on one node are all reported, once each, in reading order', () => {
    const a = doc([nd('component', { ports: [], accent: '#111' })]);
    const b = doc([nd('component', { ports: [{ id: 'p1', name: 'I', kind: 'provided', side: 'left' }], accent: '#222', label: 'Y' }, { parentId: 'g' })]);
    expect(describeChange(diffProjects(a, b).nodes.changed[0])).toBe('reparented, renamed, restyled, ports edited');
  });
});

