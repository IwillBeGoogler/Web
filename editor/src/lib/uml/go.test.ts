import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGo } from './go';
import type { UmlModel } from './model';

const fixture = readFileSync(join(process.cwd(), 'src/lib/uml/fixtures/shop.go.txt'), 'utf8');
const cls = (m: UmlModel, name: string) => m.classes.find((c) => c.name === name)!;
const rel = (m: UmlModel, from: string, to: string, kind?: string) => m.relations.find((r) => r.from === from && r.to === to && (!kind || r.kind === kind));

describe('Go import', () => {
  const { model, warnings } = parseGo(fixture);
  it('reads structs, interfaces, generics and the package', () => {
    expect(warnings).toEqual([]);
    expect(cls(model, 'Customer')).toMatchObject({ kind: 'class', package: 'shop' });
    expect(cls(model, 'Repository')).toMatchObject({ kind: 'interface', generics: 'T any' });
    expect(cls(model, 'Stack').generics).toBe('T any');
    expect(cls(model, 'Pricer').kind).toBe('interface');
  });
  it('fields: exported = +, unexported = -, grouped names, tags dropped, embedded skipped as fields', () => {
    const a = cls(model, 'Customer').attributes;
    expect(a.find((x) => x.name === 'Name')).toMatchObject({ visibility: '+', type: 'string' });
    expect(a.find((x) => x.name === 'Email')).toMatchObject({ type: 'string' });
    expect(a.find((x) => x.name === 'prefs')).toMatchObject({ visibility: '-', type: 'map[string]Preference' });
    expect(a.find((x) => x.name === 'Entity')).toBeUndefined();
    const addr = cls(model, 'Address').attributes.map((x) => x.name);
    expect(addr).toEqual(['Street', 'City', 'Zip']);
    expect(cls(model, 'Address').attributes[1].type).toBe('string');
    expect(cls(model, 'Order').attributes.some((x) => x.name === 'Notes')).toBe(false); // anonymous struct field is skipped
  });
  it('methods attach to their receiver with parameters and results', () => {
    const ops = cls(model, 'Customer').operations;
    expect(ops.map((o) => o.name)).toEqual(['AddOrder', 'FullName']);
    expect(ops[0]).toMatchObject({ visibility: '+', params: [{ name: 'o', type: '*Order' }] });
    expect(ops[1].type).toBe('string');
    const total = cls(model, 'Order').operations.find((o) => o.name === 'Total')!;
    expect(total.params).toEqual([{ name: 'tax', type: 'float64' }, { name: 'discount', type: 'float64' }]);
    expect(total.type).toBe('(Money, error)');
    expect(cls(model, 'Order').operations.find((o) => o.name === 'validate')!.visibility).toBe('-');
    expect(cls(model, 'Stack').operations[0].name).toBe('Push');
    expect(model.classes.some((c) => c.name === 'helper')).toBe(false);
  });
  it('interface methods are abstract; variadic params keep the ellipsis', () => {
    const r = cls(model, 'Repository').operations;
    expect(r.map((o) => o.name)).toEqual(['Find', 'Save']);
    expect(r[0]).toMatchObject({ abstract: true, type: '(T, error)' });
    expect(cls(model, 'Pricer').operations[0].params).toEqual([{ name: 'lines', type: '...OrderLine' }]);
  });
  it('embedding becomes inheritance (struct and interface); external embeds are added as external classes', () => {
    expect(rel(model, 'Customer', 'Entity', 'inheritance')).toBeTruthy();
    expect(rel(model, 'Order', 'Entity', 'inheritance')).toBeTruthy();
    expect(rel(model, 'Repository', 'io.Closer', 'inheritance') ?? rel(model, 'Repository', 'Closer', 'inheritance')).toBeTruthy();
    expect(model.classes.find((c) => c.name === 'Closer' || c.name === 'io.Closer')?.external).toBe(true);
  });
  it('typed fields give associations with multiplicity', () => {
    expect(rel(model, 'Customer', 'Order', 'association')).toMatchObject({ toMult: '0..*', toRole: 'Orders' });
    expect(rel(model, 'Customer', 'Address', 'association')).toMatchObject({ toMult: '0..1' });
    expect(rel(model, 'Order', 'Customer', 'association')).toMatchObject({ toMult: '0..1' });
    expect(rel(model, 'Order', 'OrderLine', 'association')).toMatchObject({ toMult: '0..*' });
    expect(rel(model, 'Customer', 'Preference', 'association')).toMatchObject({ toMult: '0..*' });
  });
  it('a named int type with iota constants is an enum; other named types are stereotyped classes', () => {
    expect(cls(model, 'Color')).toMatchObject({ kind: 'enum' });
    expect(cls(model, 'Color').attributes.map((a) => a.name)).toEqual(['Red', 'Green', 'Blue']);
    expect(cls(model, 'Money')).toMatchObject({ kind: 'class', stereotype: 'int64' });
  });
});
