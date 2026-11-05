import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCSharp } from './csharp';
import type { UmlModel } from './model';

const fixture = readFileSync(join(process.cwd(), 'src/lib/uml/fixtures/Shop.cs.txt'), 'utf8');
const cls = (m: UmlModel, name: string) => m.classes.find((c) => c.name === name)!;
const rel = (m: UmlModel, from: string, to: string, kind?: string) => m.relations.find((r) => r.from === from && r.to === to && (!kind || r.kind === kind));

describe('C# import', () => {
  const { model, warnings } = parseCSharp(fixture);
  it('reads classes, abstract classes, interfaces, enums, records, structs, generics, namespace', () => {
    expect(warnings).toEqual([]);
    expect(cls(model, 'Customer')).toMatchObject({ kind: 'class', package: 'Shop.Model' });
    expect(cls(model, 'Entity').kind).toBe('abstract');
    expect(cls(model, 'IRepository')).toMatchObject({ kind: 'interface', generics: 'T' });
    expect(cls(model, 'Status').kind).toBe('enum');
    expect(cls(model, 'Status').attributes.map((a) => a.name)).toEqual(['Draft', 'Paid', 'Shipped']);
    expect(cls(model, 'Address')).toMatchObject({ kind: 'class', stereotype: 'record' });
    expect(cls(model, 'Money')).toMatchObject({ kind: 'class', stereotype: 'struct' });
  });
  it('properties and fields: visibility, type, static, initialisers, nullable', () => {
    const a = cls(model, 'Customer').attributes;
    expect(a.find((x) => x.name === 'Name')).toMatchObject({ visibility: '+', type: 'string', default: '""' });
    expect(a.find((x) => x.name === 'Email')).toMatchObject({ type: 'string?' });
    expect(a.find((x) => x.name === '_orders')).toMatchObject({ visibility: '-', type: 'List<Order>' });
    expect(a.find((x) => x.name === 'Count')).toMatchObject({ static: true, type: 'int' });
    expect(a.find((x) => x.name === 'Orders')).toMatchObject({ type: 'IReadOnlyList<Order>' });
    expect(cls(model, 'Entity').attributes.find((x) => x.name === 'Id')).toMatchObject({ visibility: '+', type: 'int' });
    expect(cls(model, 'Entity').attributes.find((x) => x.name === 'CreatedAt')).toMatchObject({ visibility: '#' });
  });
  it('methods: params with defaults and params arrays, abstract, static, constructors', () => {
    const ops = cls(model, 'Customer').operations;
    const add = ops.find((o) => o.name === 'AddOrder')!;
    expect(add).toMatchObject({ visibility: '+', type: 'void' });
    expect(add.params).toEqual([{ name: 'order', type: 'Order' }, { name: 'priority', type: 'int' }]);
    expect(ops.find((o) => o.name === 'Create')).toMatchObject({ static: true, type: 'Customer' });
    expect(ops.find((o) => o.name === 'Secret')!.visibility).toBe('-');
    expect(ops.some((o) => o.name === 'Customer')).toBe(true); // constructor
    expect(cls(model, 'Entity').operations.find((o) => o.name === 'Describe')).toMatchObject({ abstract: true, type: 'string' });
    expect(cls(model, 'IRepository').operations.map((o) => o.name)).toEqual(['Find', 'Save']);
    expect(cls(model, 'IRepository').operations[0].abstract).toBe(true);
  });
  it('record parameters become properties', () => {
    expect(cls(model, 'Address').attributes.map((a) => [a.name, a.type])).toEqual([['Street', 'string'], ['City', 'string']]);
  });
  it('inheritance vs realization from the base list', () => {
    expect(rel(model, 'Customer', 'Entity', 'inheritance')).toBeTruthy();
    expect(rel(model, 'Customer', 'IComparable', 'realization')).toBeTruthy();
    expect(rel(model, 'Order', 'Entity', 'inheritance')).toBeTruthy();
    expect(rel(model, 'IPricer', 'IDisposable', 'inheritance')).toBeTruthy();
    expect(model.classes.find((c) => c.name === 'IDisposable')?.external).toBe(true);
  });
  it('associations from typed members, with multiplicities; nested classes are found', () => {
    expect(rel(model, 'Customer', 'Order', 'association')).toMatchObject({ toMult: '0..*' });
    expect(rel(model, 'Customer', 'Address', 'association')).toMatchObject({ toMult: '1', toRole: 'Address' });
    expect(rel(model, 'Order', 'Customer', 'association')).toMatchObject({ toMult: '1' });
    expect(rel(model, 'Order', 'OrderLine', 'association')).toMatchObject({ toMult: '0..*' });
    expect(rel(model, 'Order', 'Money', 'association')).toMatchObject({ toMult: '0..*' });
    expect(rel(model, 'Order', 'Status', 'association')).toBeTruthy();
    expect(cls(model, 'OrderLine').attributes[0].name).toBe('Sku');
    expect(cls(model, 'Order').attributes.some((a) => a.name === 'Sku')).toBe(false);
  });
});
