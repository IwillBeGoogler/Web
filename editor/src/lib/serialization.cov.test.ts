import { describe, expect, it } from 'vitest';
import { cleanDiagram, parseDiagram, serializeDiagram, validateDiagram } from './serialization';

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const base = (): J => ({
  version: 1,
  nodes: [
    { id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'A' } },
    { id: 'b', type: 'icon', position: { x: 10, y: 0 }, data: { label: 'B' } },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b' }],
});
const withNode = (n: J): J => { const d = base(); d.nodes.push({ id: 'n', position: { x: 0, y: 0 }, data: { label: 'N' }, ...n }); return d; };
const withEdge = (e: J): J => { const d = base(); d.edges.push({ id: 'e2', source: 'a', target: 'b', ...e }); return d; };
const err = (raw: unknown): string => { const r = validateDiagram(raw); if (r.ok) throw new Error('expected failure'); return r.error; };

describe('validateDiagram: structure', () => {
  it('accepts the base and strips transient state', () => {
    const d = base();
    d.nodes[0].selected = true; d.nodes[0].dragging = true; d.nodes[0].measured = { width: 1 };
    d.edges[0].selected = true; d.edges[0].className = 'edge-new';
    d.settings = { canvas: { gridSize: 10 } };
    const r = validateDiagram(d);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diagram.nodes[0]).not.toHaveProperty('selected');
      expect(r.diagram.edges[0]).not.toHaveProperty('className');
      expect(r.diagram.settings).toBeDefined();
    }
  });
  it('cleanDiagram keeps other class names and omits empty settings', () => {
    const c = cleanDiagram({ version: 1, nodes: [], edges: [{ id: 'e', source: 'a', target: 'b', className: 'keep' } as never], settings: {} });
    expect(c.edges[0].className).toBe('keep');
    expect(c).not.toHaveProperty('settings');
  });
  it.each([
    [null, 'Root must be'],
    [{ version: 2, nodes: [], edges: [] }, 'version'],
    [{ version: 1, edges: [] }, '"nodes"'],
    [{ version: 1, nodes: [] }, '"edges"'],
  ])('rejects %j', (raw, msg) => { expect(err(raw)).toContain(msg); });
  it('parseDiagram: invalid JSON, round trip through serializeDiagram', () => {
    expect(parseDiagram('{nope')).toEqual({ ok: false, error: 'Not valid JSON' });
    const r = parseDiagram(serializeDiagram(base() as never));
    expect(r.ok).toBe(true);
  });
});

describe('validateDiagram: nodes', () => {
  const bad = (name: string, mut: (d: J) => void, msg: string) => it(name, () => { const d = base(); mut(d); expect(err(d)).toContain(msg); });
  bad('non-object node', (d) => { d.nodes[0] = 5; }, 'nodes[0] must be an object');
  bad('missing id', (d) => { d.nodes[0].id = ''; }, 'id must be');
  bad('duplicate id', (d) => { d.nodes[1].id = 'a'; }, 'Duplicate node id');
  bad('bad type', (d) => { d.nodes[0].type = 'wat'; }, '.type invalid');
  bad('bad position', (d) => { d.nodes[0].position = { x: 'a', y: 1 }; }, 'position');
  bad('position not object', (d) => { d.nodes[0].position = null; }, 'position');
  bad('data not object', (d) => { d.nodes[0].data = null; }, 'data.label');
  bad('label not string', (d) => { d.nodes[0].data.label = 3; }, 'data.label');
  bad('subtitle not string', (d) => { d.nodes[0].data.subtitle = 3; }, 'subtitle');
  bad('enum', (d) => { d.nodes[0].data.shape = 'blob'; }, 'must be one of');
  bad('num', (d) => { d.nodes[0].data.opacity = 'x'; }, 'opacity must be a number');
  bad('tags', (d) => { d.nodes[0].data.tags = [{ text: 'x' }]; }, 'tags');
  bad('tags not array', (d) => { d.nodes[0].data.tags = 'x'; }, 'tags');
  bad('str', (d) => { d.nodes[0].data.fill = 3; }, 'fill must be a string');
  bad('archRef', (d) => { d.nodes[0].data.archRef = 'x'; }, 'archRef');
  bad('bool', (d) => { d.nodes[0].data.locked = 'yes'; }, 'locked must be boolean');
  bad('width', (d) => { d.nodes[0].width = 'w'; }, 'width must be a number');
  bad('height', (d) => { d.nodes[0].height = 'h'; }, 'height must be a number');
  bad('parent missing', (d) => { d.nodes[0].parentId = 'zz'; }, 'parentId');
  bad('parent not a container', (d) => { d.nodes[0].parentId = 'b'; }, 'parentId');

  it('table columns', () => {
    expect(err(withNode({ type: 'table', data: { label: 'T' } }))).toContain('columns must be an array');
    expect(err(withNode({ type: 'table', data: { label: 'T', columns: [{ id: 'c' }] } }))).toContain('needs id, name and type');
    expect(err(withNode({ type: 'table', data: { label: 'T', columns: [{ id: 'c', name: 'a', type: 'int' }, { id: 'c', name: 'b', type: 'int' }] } }))).toContain('duplicate column');
    expect(validateDiagram(withNode({ type: 'table', data: { label: 'T', columns: [{ id: 'c', name: 'a', type: 'int' }] } })).ok).toBe(true);
  });
  it('class members', () => {
    const cls = (data: J) => withNode({ type: 'class', data: { label: 'C', kind: 'class', attributes: [], operations: [], ...data } });
    expect(err(cls({ kind: 'zzz' }))).toContain('kind must be');
    expect(err(cls({ attributes: 'x' }))).toContain('attributes must be an array');
    expect(err(cls({ operations: [{ id: 'm', name: 'f', visibility: '!' }] }))).toContain('visibility');
    expect(err(cls({ attributes: [{ id: 'm', name: 'a', visibility: '+' }], operations: [{ id: 'm', name: 'f', visibility: '-' }] }))).toContain('duplicate member');
    expect(err(cls({ operations: [{ id: 'm', name: 'f', visibility: '+', params: 'x' }] }))).toContain('params');
    expect(err(cls({ operations: [{ id: 'm', name: 'f', visibility: '+', params: [{ type: 'x' }] }] }))).toContain('params');
    expect(validateDiagram(cls({ operations: [{ id: 'm', name: 'f', visibility: '+', params: [{ name: 'p' }] }] })).ok).toBe(true);
  });
  it('sequence / timing / board / design delegates', () => {
    expect(err(withNode({ type: 'sequence', data: { label: 'S' } }))).toContain('nodes[2].data:');
    expect(err(withNode({ type: 'timing', data: { label: 'T' } }))).toContain('nodes[2].data:');
    expect(err(withNode({ type: 'sticky', data: { label: 'T', private: 'x' } }))).toMatch(/nodes\[2\]/);
    expect(err(withNode({ type: 'icon', data: { label: 'T', autoLayout: { mode: 'bogus' } } }))).toMatch(/nodes\[2\]/);
  });
  it.each([
    ['state', 'stateKind'], ['usecase', 'ucKind'], ['activity', 'actKind'], ['deployment', 'depKind'], ['component', 'compKind'],
  ])('%s needs %s', (type, key) => {
    expect(err(withNode({ type, data: { label: 'x' } }))).toContain(`${key} is required`);
  });
  it('object slots', () => {
    const o = (data: J) => withNode({ type: 'object', data: { label: 'O', slots: [], ...data } });
    expect(err(o({ className: 3 }))).toContain('className');
    expect(err(o({ slots: 'x' }))).toContain('slots must be an array');
    expect(err(o({ slots: [{ id: 's', name: 'a' }] }))).toContain('needs id, name and value');
    expect(err(o({ slots: [{ id: 's', name: 'a', value: '1' }, { id: 's', name: 'b', value: '2' }] }))).toContain('duplicate slot');
    expect(validateDiagram(o({ className: 'K', slots: [{ id: 's', name: 'a', value: '1' }] })).ok).toBe(true);
  });
  it('valid parent containers and parents-first ordering, alias icon ids', () => {
    const d = base();
    d.nodes.unshift({ id: 'c', type: 'component', position: { x: 0, y: 0 }, data: { label: 'C', compKind: 'component' } });
    d.nodes[1].parentId = 'c';
    d.nodes[1].data.iconId = 'definitely-not-an-alias';
    expect(validateDiagram(d).ok).toBe(true);
  });
});

describe('validateDiagram: edges', () => {
  const bad = (name: string, e: J, msg: string) => it(name, () => { expect(err(withEdge(e))).toContain(msg); });
  it('base structure errors', () => {
    const d = base(); d.edges[0] = 4; expect(err(d)).toContain('edges[0] must be an object');
    const d2 = base(); d2.edges[0].id = ''; expect(err(d2)).toContain('edges[0].id');
    const d3 = base(); d3.edges.push({ ...d3.edges[0] }); expect(err(d3)).toContain('Duplicate edge id');
    const d4 = base(); d4.edges[0].source = 'zz'; expect(err(d4)).toContain('source references');
    const d5 = base(); d5.edges[0].target = 'zz'; expect(err(d5)).toContain('target references');
    const d6 = base(); d6.edges[0].label = 3; expect(err(d6)).toContain('label must be a string');
  });
  bad('data not object', { data: 'x' }, 'data must be an object');
  bad('dashed', { data: { dashed: 'x' } }, 'dashed');
  bad('color', { data: { color: 3 } }, 'color');
  bad('enum', { data: { lineType: 'wavy' } }, 'lineType must be one of');
  bad('dataFlow', { data: { dataFlow: 1 } }, 'dataFlow');
  bad('flow', { data: { flow: 1 } }, 'flow must');
  bad('num', { data: { labelT: 'x' } }, 'labelT must be a number');
  bad('manual', { data: { manual: 1 } }, 'manual');
  bad('waypoints', { data: { waypoints: [{ x: 1 }] } }, 'waypoints');
  bad('waypoints not array', { data: { waypoints: 'x' } }, 'waypoints');
  bad('relation cardinality', { data: { relation: { cardinality: '2:2' } } }, 'cardinality');
  bad('relation not object', { data: { relation: 3 } }, 'cardinality');
  bad('relation booleans', { data: { relation: { cardinality: '1:1', identifying: 'x', optional: false } } }, 'identifying');
  bad('uml kind', { data: { uml: { kind: 'zzz' } } }, 'uml.kind');
  bad('uml field', { data: { uml: { kind: 'association', sourceMult: 3 } } }, 'sourceMult');
  bad('messages not array', { data: { uml: { kind: 'association', messages: 'x' } } }, 'messages must be an array');
  bad('message shape', { data: { uml: { kind: 'association', messages: [{ id: 'm', seq: 'x', text: 't', dir: 'fwd' }] } } }, 'dotted seq');
  bad('message dir', { data: { uml: { kind: 'association', messages: [{ id: 'm', seq: '1', text: 't', dir: 'up' }] } } }, 'dotted seq');
  bad('message async', { data: { uml: { kind: 'association', messages: [{ id: 'm', seq: '1', text: 't', dir: 'fwd', async: 'x' }] } } }, 'dotted seq');
  bad('message dup', { data: { uml: { kind: 'association', messages: [{ id: 'm', seq: '1', text: 't', dir: 'fwd' }, { id: 'm', seq: '1.1', text: 't', dir: 'back' }] } } }, 'duplicate message');
  bad('strokeWidth', { data: { strokeWidth: 'x' } }, 'strokeWidth');
  bad('labelBg', { data: { labelBg: 'x' } }, 'labelBg');
  it('valid rich edge data passes', () => {
    const e = { data: { dashed: true, color: '#fff', lineType: 'curved', dataFlow: true, flow: true, labelT: 0.5, manual: true, waypoints: [{ x: 1, y: 2 }], relation: { cardinality: 'N:M', identifying: false, optional: true }, uml: { kind: 'association', sourceMult: '1', messages: [{ id: 'm', seq: '1.2', text: 't', dir: 'fwd', async: true }] }, strokeWidth: 2, labelBg: true } };
    expect(validateDiagram(withEdge(e)).ok).toBe(true);
  });
});
