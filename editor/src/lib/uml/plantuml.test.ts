import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePlantUml, renderPlantUml } from './plantuml';
import { type UmlModel } from './model';

const fixture = readFileSync(join(process.cwd(), 'src/lib/uml/fixtures/shop.puml'), 'utf8');
const cls = (m: UmlModel, name: string) => m.classes.find((c) => c.name === name)!;
const rel = (m: UmlModel, from: string, to: string) => m.relations.find((r) => r.from === from && r.to === to)!;

describe('PlantUML class import', () => {
  const { model, warnings } = parsePlantUml(fixture);
  it('reads classes, kinds, generics and packages', () => {
    expect(warnings).toEqual([]);
    expect(cls(model, 'Shape')).toMatchObject({ kind: 'abstract', generics: 'T', package: 'shop' });
    expect(cls(model, 'Repository')).toMatchObject({ kind: 'interface', generics: 'T' });
    expect(cls(model, 'Color')).toMatchObject({ kind: 'enum', package: 'shop' });
    expect(cls(model, 'Color').attributes.map((a) => a.name)).toEqual(['RED', 'GREEN']);
    expect(cls(model, 'Order').package).toBeUndefined();
  });
  it('reads members with {static} / {abstract} and name : type syntax', () => {
    const shape = cls(model, 'Shape');
    expect(shape.attributes).toEqual([
      { visibility: '#', name: 'name', type: 'String' },
      { visibility: '-', name: 'count', type: 'int', static: true },
    ]);
    expect(shape.operations[0]).toMatchObject({ visibility: '+', name: 'area', type: 'double', abstract: true });
    expect(cls(model, 'Repository').operations[1]).toMatchObject({ name: 'save', params: [{ name: 'item', type: 'T' }] });
    expect(cls(model, 'Order').attributes[0]).toMatchObject({ name: 'items', type: 'List<Item>' });
  });
  it('turns extends / implements and arrows into relations', () => {
    expect(rel(model, 'Circle', 'Shape').kind).toBe('inheritance');
    expect(rel(model, 'OrderRepo', 'Repository').kind).toBe('realization');
    expect(rel(model, 'Item', 'Order')).toMatchObject({ kind: 'composition', fromMult: '1..*', toMult: '1', label: 'contains' });
    expect(rel(model, 'Customer', 'Order')).toMatchObject({ kind: 'association', directed: true });
    expect(rel(model, 'Payment', 'Order').kind).toBe('aggregation');
    expect(rel(model, 'Order', 'Color').kind).toBe('dependency');
    expect(rel(model, 'DigitalItem', 'Item').kind).toBe('inheritance');
  });
  it('accepts arrows with direction hints and works without @startuml', () => {
    const m = parsePlantUml('class A\nclass B\nA -up-|> B\nA -[#red]-> B').model;
    expect(m.relations.map((r) => r.kind)).toEqual(['inheritance', 'association']);
  });
});

describe('PlantUML export', () => {
  const { model } = parsePlantUml(fixture);
  const text = renderPlantUml(model);
  it('writes @startuml with kinds, members and arrows', () => {
    expect(text.startsWith('@startuml')).toBe(true);
    expect(text.trim().endsWith('@enduml')).toBe(true);
    expect(text).toContain('abstract class Shape<T>');
    expect(text).toContain('interface Repository<T>');
    expect(text).toContain('{static} -count : int');
    expect(text).toContain('Shape <|-- Circle');
    expect(text).toContain('Repository <|.. OrderRepo');
    expect(text).toContain('Order "1" *-- "1..*" Item : contains');
    expect(text).toContain('package shop');
  });
  it('round-trips', () => {
    const again = parsePlantUml(text);
    expect(again.warnings).toEqual([]);
    const norm = (m: UmlModel) => ({
      classes: [...m.classes].sort((a, b) => a.name.localeCompare(b.name)),
      relations: [...m.relations].sort((a, b) => `${a.from}${a.to}${a.kind}`.localeCompare(`${b.from}${b.to}${b.kind}`)),
    });
    expect(norm(again.model)).toEqual(norm(model));
  });
});
