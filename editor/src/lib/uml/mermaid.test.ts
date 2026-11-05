import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMermaid, renderMermaid } from './mermaid';
import { modelCounts, type UmlModel } from './model';

const fixture = readFileSync(join(process.cwd(), 'src/lib/uml/fixtures/shop.mmd'), 'utf8');
const cls = (m: UmlModel, name: string) => m.classes.find((c) => c.name === name)!;
const rel = (m: UmlModel, from: string, to: string) => m.relations.find((r) => r.from === from && r.to === to)!;

describe('Mermaid classDiagram import', () => {
  const { model, warnings } = parseMermaid(fixture);
  it('reads classes, stereotypes and generics', () => {
    expect(warnings).toEqual([]);
    expect(cls(model, 'Shape').kind).toBe('abstract');
    expect(cls(model, 'Repository')).toMatchObject({ kind: 'interface', generics: 'T' });
    expect(cls(model, 'Color').kind).toBe('enum');
    expect(cls(model, 'Color').attributes.map((a) => a.name)).toEqual(['RED', 'GREEN']);
    expect(cls(model, 'Color').attributes[0].visibility).toBe('');
  });
  it('reads attributes and operations (visibility, static $, abstract *, types, params)', () => {
    const shape = cls(model, 'Shape');
    expect(shape.attributes).toEqual([
      { visibility: '+', name: 'name', type: 'String' },
      { visibility: '-', name: 'id', type: 'int', static: true },
    ]);
    expect(shape.operations[0]).toMatchObject({ visibility: '+', name: 'area', type: 'double', abstract: true, params: [] });
    expect(cls(model, 'Repository').operations[0]).toMatchObject({ name: 'find', type: 'T', params: [{ name: 'id', type: 'string' }] });
    expect(cls(model, 'Order').attributes[0]).toMatchObject({ name: 'items', type: 'List<Item>' });
  });
  it('reads "Name : member" lines', () => {
    expect(cls(model, 'Circle').attributes[0]).toMatchObject({ visibility: '-', name: 'radius', type: 'double' });
    expect(cls(model, 'Circle').operations[0]).toMatchObject({ name: 'area', type: 'double' });
  });
  it('maps every arrow to a relation in drawn direction with multiplicities and labels', () => {
    expect(rel(model, 'Circle', 'Shape').kind).toBe('inheritance');
    expect(rel(model, 'OrderRepo', 'Repository').kind).toBe('realization');
    expect(rel(model, 'Item', 'Order')).toMatchObject({ kind: 'composition', fromMult: '1..*', toMult: '1', label: 'contains' });
    expect(rel(model, 'Customer', 'Order')).toMatchObject({ kind: 'association', directed: true, fromMult: '1', toMult: '0..*', label: 'places' });
    expect(rel(model, 'Payment', 'Order').kind).toBe('aggregation');
    expect(rel(model, 'Order', 'Color').kind).toBe('dependency');
    expect(rel(model, 'Customer', 'Address')).toMatchObject({ kind: 'association' });
    expect(rel(model, 'Customer', 'Address').directed).toBeFalsy();
  });
  it('creates classes that are only mentioned in relations', () => {
    for (const n of ['Item', 'Payment', 'Customer', 'Address', 'OrderRepo']) expect(cls(model, n)).toBeTruthy();
    expect(modelCounts(model).relations).toBe(7);
  });
  it('warns about unreadable lines instead of failing', () => {
    expect(parseMermaid('classDiagram\n  class A\n  ???\n').warnings.length).toBe(1);
    expect(parseMermaid('class A').warnings[0]).toMatch(/classDiagram/);
  });
});

describe('Mermaid export', () => {
  const { model } = parseMermaid(fixture);
  const text = renderMermaid(model);
  it('writes a valid classDiagram with stereotypes, generics and arrows', () => {
    expect(text.startsWith('classDiagram')).toBe(true);
    expect(text).toContain('class Repository~T~ {');
    expect(text).toContain('<<interface>>');
    expect(text).toContain('Shape <|-- Circle');
    expect(text).toContain('Repository <|.. OrderRepo');
    expect(text).toContain('Order "1" *-- "1..*" Item : contains');
    expect(text).toContain('Customer "1" --> "0..*" Order : places');
  });
  it('round-trips: parse(render(parse(x))) equals parse(x)', () => {
    const again = parseMermaid(text);
    expect(again.warnings).toEqual([]);
    const norm = (m: UmlModel) => ({
      classes: [...m.classes].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ ...c, attributes: c.attributes.map((x) => ({ ...x })), operations: c.operations.map((x) => ({ ...x })) })),
      relations: [...m.relations].sort((a, b) => `${a.from}${a.to}${a.kind}`.localeCompare(`${b.from}${b.to}${b.kind}`)),
    });
    expect(norm(again.model)).toEqual(norm(model));
  });
});
