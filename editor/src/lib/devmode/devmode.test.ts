import { describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { blankTable } from '../er/relations';
import { blankClass } from '../uml/geometry';
import { blankSequence } from '../seq/node';
import { inspectProps, snippetsFor, sourceLinkOf } from './devmode';

const icon = (extra: Record<string, unknown> = {}): DiagramNode => ({ id: 'n1', type: 'icon', position: { x: 10, y: 20 }, width: 120, height: 96, data: { label: 'Orders API', fill: '#ffffff', stroke: '#2f6fdb', textColor: '#111111', fontSize: 14, bold: true, ...extra } }) as DiagramNode;
const ids = (n: DiagramNode, nodes = [n]) => snippetsFor(n, nodes, []).map((s) => s.id);

describe('inspectProps', () => {
  it('reports geometry (absolute for children), colours and fonts', () => {
    const parent = { id: 'p', type: 'group', position: { x: 100, y: 100 }, width: 400, height: 300, data: { label: 'g' } } as DiagramNode;
    const child = { ...icon(), parentId: 'p' };
    const p = inspectProps(child, [parent, child]);
    expect(p.geometry).toEqual({ x: 110, y: 120, width: 120, height: 96 });
    expect(p.colors).toEqual({ fill: '#ffffff', stroke: '#2f6fdb', text: '#111111' });
    expect(p.font).toEqual({ size: 14, bold: true, align: undefined });
    expect(p.kind).toBe('icon');
  });
});

describe('snippetsFor', () => {
  it('every node gets JSON and SVG; the JSON is the node without transient state', () => {
    const n = { ...icon(), selected: true, dragging: false } as DiagramNode;
    const s = snippetsFor(n, [n], []);
    expect(s.map((x) => x.id)).toEqual(expect.arrayContaining(['json', 'svg']));
    const json = JSON.parse(s.find((x) => x.id === 'json')!.code);
    expect(json.id).toBe('n1');
    expect(json.selected).toBeUndefined();
    const svg = s.find((x) => x.id === 'svg')!.code;
    expect(svg).toContain('<svg');
    expect(svg).toContain('Orders API');
    expect(svg).toContain('#2f6fdb');
  });
  it('the SVG escapes text', () => {
    const svg = snippetsFor(icon({ label: '<b>&"x"' }), [], []).find((x) => x.id === 'svg')!.code;
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;&amp;');
  });
  it('ER table: DDL (SQL), Mermaid, JSON', () => {
    const t = blankTable('t1', { x: 0, y: 0 }, 'orders');
    expect(ids(t)).toEqual(expect.arrayContaining(['ddl', 'mermaid', 'json']));
    expect(snippetsFor(t, [t], []).find((x) => x.id === 'ddl')!.code).toMatch(/CREATE TABLE/i);
    expect(snippetsFor(t, [t], []).find((x) => x.id === 'mermaid')!.code).toContain('erDiagram');
  });
  it('UML class: Mermaid, PlantUML, TypeScript, Java', () => {
    const c = blankClass('c1', { x: 0, y: 0 }, 'class', 'Order');
    expect(ids(c)).toEqual(expect.arrayContaining(['mermaid', 'plantuml', 'ts', 'java']));
    expect(snippetsFor(c, [c], []).find((x) => x.id === 'ts')!.code).toContain('Order');
    expect(snippetsFor(c, [c], []).find((x) => x.id === 'java')!.code).toContain('class Order');
    expect(snippetsFor(c, [c], []).find((x) => x.id === 'plantuml')!.code).toContain('@startuml');
  });
  it('sequence diagram: Mermaid and PlantUML', () => {
    const s = blankSequence('s1', { x: 0, y: 0 });
    expect(ids(s)).toEqual(expect.arrayContaining(['mermaid', 'plantuml']));
    expect(snippetsFor(s, [s], []).find((x) => x.id === 'mermaid')!.code).toContain('sequenceDiagram');
  });
  it('plain architecture nodes get no database or code snippets', () => {
    expect(ids(icon())).toEqual(['json', 'svg']);
  });
});

describe('sourceLinkOf', () => {
  it('turns data.source into a link (URL as is, path:line stays text)', () => {
    expect(sourceLinkOf(icon({ source: 'https://github.com/acme/api/blob/main/orders.ts#L10' }))).toEqual({ label: 'https://github.com/acme/api/blob/main/orders.ts#L10', href: 'https://github.com/acme/api/blob/main/orders.ts#L10' });
    expect(sourceLinkOf(icon({ source: 'src/orders.ts:10' }))).toEqual({ label: 'src/orders.ts:10' });
    expect(sourceLinkOf(icon({ source: 'javascript:alert(1)' }))).toEqual({ label: 'javascript:alert(1)' });
    expect(sourceLinkOf(icon())).toBeNull();
  });
});
