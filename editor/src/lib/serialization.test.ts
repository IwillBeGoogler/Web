import { describe, expect, it } from 'vitest';
import { parseDiagram, serializeDiagram } from './serialization';
import type { Diagram } from '../types';
import { monitoringStack } from '../templates/monitoringStack';

const sample: Diagram = {
  version: 1,
  nodes: [
    { id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 300, height: 200, style: { width: 300, height: 200 }, data: { label: 'G' } },
    { id: 'a', type: 'icon', position: { x: 10, y: 10 }, parentId: 'g', data: { label: 'A', subtitle: ':1', iconId: 'prometheus' } },
    { id: 'b', type: 'text', position: { x: 400, y: 10 }, data: { label: 'T' } },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b', label: 'x', data: { dashed: true, color: '#0f7b6c' } }],
};

describe('serialization', () => {
  it('round-trips', () => {
    const r = parseDiagram(serializeDiagram(sample));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diagram.nodes.map((n) => n.id)).toEqual(['g', 'a', 'b']);
      expect(r.diagram.nodes[1].parentId).toBe('g');
      expect(r.diagram.edges[0].data).toEqual({ dashed: true, color: '#0f7b6c' });
      expect(r.diagram.edges[0].label).toBe('x');
    }
  });
  it('strips transient state', () => {
    const json = serializeDiagram({
      ...sample,
      nodes: [{ ...sample.nodes[2], selected: true, dragging: true, measured: { width: 1, height: 1 } }],
      edges: [],
    });
    expect(json).not.toContain('selected');
    expect(json).not.toContain('dragging');
    expect(json).not.toContain('measured');
  });
  it('template round-trips', () => {
    const t = monitoringStack();
    const r = parseDiagram(serializeDiagram(t));
    expect(r.ok && r.diagram.nodes.length).toBe(t.nodes.length);
    expect(r.ok && r.diagram.edges.length).toBe(t.edges.length);
  });
});

describe('validation', () => {
  const bad = (v: unknown) => parseDiagram(typeof v === 'string' ? v : JSON.stringify(v));
  it('rejects non-JSON', () => expect(bad('{nope').ok).toBe(false));
  it('rejects non-object', () => expect(bad([]).ok).toBe(false));
  it('rejects wrong version', () => expect(bad({ version: 2, nodes: [], edges: [] }).ok).toBe(false));
  it('rejects missing arrays', () => expect(bad({ version: 1, nodes: [] }).ok).toBe(false));
  it('rejects bad node type', () =>
    expect(bad({ version: 1, edges: [], nodes: [{ id: 'a', type: 'weird', position: { x: 0, y: 0 }, data: { label: 'a' } }] }).ok).toBe(false));
  it('rejects bad position', () =>
    expect(bad({ version: 1, edges: [], nodes: [{ id: 'a', type: 'icon', position: { x: 'z', y: 0 }, data: { label: 'a' } }] }).ok).toBe(false));
  it('rejects missing label', () =>
    expect(bad({ version: 1, edges: [], nodes: [{ id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: {} }] }).ok).toBe(false));
  it('rejects duplicate ids', () => {
    const n = { id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'a' } };
    expect(bad({ version: 1, edges: [], nodes: [n, n] }).ok).toBe(false);
  });
  it('rejects dangling edge', () => {
    const n = { id: 'a', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'a' } };
    const r = bad({ version: 1, nodes: [n], edges: [{ id: 'e', source: 'a', target: 'nope' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/target/);
  });
  it('rejects unknown parent', () => {
    const n = { id: 'a', type: 'icon', position: { x: 0, y: 0 }, parentId: 'zz', data: { label: 'a' } };
    expect(bad({ version: 1, edges: [], nodes: [n] }).ok).toBe(false);
  });
  it('orders parents before children on import', () => {
    const g = { id: 'g', type: 'group', position: { x: 0, y: 0 }, data: { label: 'g' } };
    const a = { id: 'a', type: 'icon', position: { x: 0, y: 0 }, parentId: 'g', data: { label: 'a' } };
    const r = bad({ version: 1, edges: [], nodes: [a, g] });
    expect(r.ok && r.diagram.nodes.map((n) => n.id)).toEqual(['g', 'a']);
  });
});

describe('new node kinds and style fields', () => {
  const base = { version: 1, edges: [] };
  const node = (extra: Record<string, unknown>, data: Record<string, unknown> = {}) => ({ id: 'a', type: 'shape', position: { x: 0, y: 0 }, data: { label: 'a', ...data }, ...extra });
  it('accepts shape / sticky / draw with style data', () => {
    for (const type of ['shape', 'sticky', 'draw'])
      expect(parseDiagram(JSON.stringify({ ...base, nodes: [node({ type }, { fill: '#fff', strokeStyle: 'dashed', opacity: 50, bold: true, align: 'left', background: 'filled', shadow: true })] })).ok).toBe(true);
  });
  it('rejects bad style values', () => {
    for (const data of [{ strokeStyle: 'wavy' }, { opacity: '50' }, { fill: 5 }, { bold: 'yes' }, { shape: 'hexagon' }, { background: 'glass' }])
      expect(parseDiagram(JSON.stringify({ ...base, nodes: [node({}, data)] })).ok, JSON.stringify(data)).toBe(false);
  });
  it('validates edge options', () => {
    const n = (id: string) => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id } });
    const ok = { ...base, nodes: [n('a'), n('b')], edges: [{ id: 'e', source: 'a', target: 'b', data: { lineType: 'curved', arrows: 'both', strokeStyle: 'dotted', strokeWidth: 3, labelBg: true } }] };
    expect(parseDiagram(JSON.stringify(ok)).ok).toBe(true);
    for (const data of [{ lineType: 'zigzag' }, { arrows: 'up' }, { strokeWidth: 'x' }, { labelBg: 1 }]) {
      const bad = { ...ok, edges: [{ id: 'e', source: 'a', target: 'b', data }] };
      expect(parseDiagram(JSON.stringify(bad)).ok, JSON.stringify(data)).toBe(false);
    }
  });
});
