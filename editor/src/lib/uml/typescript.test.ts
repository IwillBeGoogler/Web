import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTypeScript } from './typescript';
import type { UmlModel } from './model';

const fixture = readFileSync(join(process.cwd(), 'src/lib/uml/fixtures/shop.ts.txt'), 'utf8');
const cls = (m: UmlModel, name: string) => m.classes.find((c) => c.name === name)!;
const rel = (m: UmlModel, from: string, to: string, kind?: string) => m.relations.find((r) => r.from === from && r.to === to && (!kind || r.kind === kind))!;

describe('TypeScript import (compiler API)', async () => {
  const { model, warnings } = await parseTypeScript(fixture);
  it('reads classes, abstract classes, interfaces, enums and generics', () => {
    expect(warnings).toEqual([]);
    expect(cls(model, 'Shape').kind).toBe('abstract');
    expect(cls(model, 'Circle').kind).toBe('class');
    expect(cls(model, 'Drawable').kind).toBe('interface');
    expect(cls(model, 'Repository')).toMatchObject({ kind: 'interface', generics: 'T extends { id: number }' });
    expect(cls(model, 'Color').kind).toBe('enum');
    expect(cls(model, 'Color').attributes.map((a) => a.name)).toEqual(['Red', 'Green']);
    expect(cls(model, 'Color').attributes[0].visibility).toBe('');
  });
  it('reads visibility, static, readonly, #private, optional and default values', () => {
    const a = cls(model, 'Shape').attributes;
    expect(a.find((x) => x.name === 'count')).toMatchObject({ visibility: '-', static: true, default: '0' });
    expect(a.find((x) => x.name === 'id')).toMatchObject({ visibility: '#', type: 'number' });
    expect(a.find((x) => x.name === 'label?')).toMatchObject({ visibility: '+', type: 'string' });
    expect(a.find((x) => x.name === 'secret')).toMatchObject({ visibility: '-', type: 'string' });
    expect(a.find((x) => x.name === 'repo')).toMatchObject({ visibility: '-', type: 'Repository<Item>' });
    expect(a.find((x) => x.name === 'title')).toMatchObject({ visibility: '+', type: 'string' });
    expect(cls(model, 'Circle').attributes[0]).toMatchObject({ name: 'radius', type: 'number', default: '1' });
  });
  it('reads operations with params, return types, abstract, static, constructors', () => {
    const o = cls(model, 'Shape').operations;
    expect(o.find((x) => x.name === 'area')).toMatchObject({ abstract: true, type: 'number', params: [] });
    expect(o.find((x) => x.name === 'create')).toMatchObject({ static: true, type: 'Shape', params: [{ name: 'kind', type: 'string' }] });
    expect(o.find((x) => x.name === 'describe')).toMatchObject({ visibility: '#', type: 'string', params: [{ name: 'prefix', type: 'string' }, { name: '...rest', type: 'string[]' }] });
    expect(o.find((x) => x.name === 'Shape')).toMatchObject({ visibility: '+', params: [{ name: 'repo', type: 'Repository<Item>' }, { name: 'id', type: 'number' }] });
    expect(cls(model, 'Repository').operations.map((x) => x.name)).toEqual(['find', 'save']);
    expect(cls(model, 'Repository').operations[0].type).toBe('Promise<T | undefined>');
  });
  it('extends / implements become inheritance / realization', () => {
    expect(rel(model, 'Circle', 'Shape').kind).toBe('inheritance');
    expect(rel(model, 'Shape', 'Drawable').kind).toBe('realization');
    expect(rel(model, 'Repository', 'Drawable').kind).toBe('inheritance'); // interface extends interface
    expect(rel(model, 'Invoice', 'Order').kind).toBe('inheritance');
  });
  it('typed members that point at other classes become associations with multiplicity', () => {
    expect(rel(model, 'Order', 'Item', 'association')).toMatchObject({ directed: true, toMult: '0..*', toRole: 'items' });
    expect(rel(model, 'Order', 'Customer', 'association')).toMatchObject({ toMult: '1', toRole: 'customer' });
    expect(rel(model, 'Order', 'Owner', 'association')).toMatchObject({ toMult: '0..1' });
    expect(rel(model, 'Order', 'Tag', 'association')).toMatchObject({ toMult: '0..*' });
    expect(rel(model, 'Shape', 'Repository', 'association')).toMatchObject({ toMult: '1', toRole: 'repo' });
  });
  it('namespaces set the package', () => {
    expect(cls(model, 'Invoice').package).toBe('Billing');
  });
  it('can skip association inference and reports syntax problems as warnings', async () => {
    const plain = await parseTypeScript(fixture, { associations: false });
    expect(plain.model.relations.every((r) => r.kind !== 'association')).toBe(true);
    const bad = await parseTypeScript('class A { foo( }');
    expect(bad.warnings.length).toBeGreaterThan(0);
    expect(bad.model.classes.some((c) => c.name === 'A')).toBe(true);
  });
  it('creates stubs for unknown parents', async () => {
    const r = await parseTypeScript('class A extends Base implements Foo {}');
    expect(r.model.classes.find((c) => c.name === 'Base')).toMatchObject({ external: true });
    expect(r.model.relations.map((x) => [x.kind, x.to])).toEqual([['inheritance', 'Base'], ['realization', 'Foo']]);
  });
});
