import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseJava } from './java';
import type { UmlModel } from './model';

const fixture = readFileSync(join(process.cwd(), 'src/lib/uml/fixtures/Shop.java.txt'), 'utf8');
const cls = (m: UmlModel, name: string) => m.classes.find((c) => c.name === name)!;
const rel = (m: UmlModel, from: string, to: string, kind?: string) => m.relations.find((r) => r.from === from && r.to === to && (!kind || r.kind === kind))!;

describe('Java import', () => {
  const { model, warnings } = parseJava(fixture);
  it('reads classes, abstract classes, interfaces, enums, generics and the package', () => {
    expect(warnings).toEqual([]);
    expect(cls(model, 'Shape')).toMatchObject({ kind: 'abstract', package: 'com.shop.model' });
    expect(cls(model, 'Drawable').kind).toBe('interface');
    expect(cls(model, 'Repository')).toMatchObject({ kind: 'interface', generics: 'T, ID' });
    expect(cls(model, 'Color').kind).toBe('enum');
    expect(cls(model, 'Color').attributes.slice(0, 2).map((a) => a.name)).toEqual(['RED', 'GREEN']);
    expect(cls(model, 'Base').generics).toBe('T');
  });
  it('reads fields: visibility, static, final, generics, defaults, annotations', () => {
    const a = cls(model, 'Shape').attributes;
    expect(a.find((x) => x.name === 'count')).toMatchObject({ visibility: '-', static: true, type: 'int', default: '0' });
    expect(a.find((x) => x.name === 'name')).toMatchObject({ visibility: '#', type: 'String' });
    expect(a.find((x) => x.name === 'packageLevel')).toMatchObject({ visibility: '~', type: 'int' });
    expect(a.find((x) => x.name === 'items')).toMatchObject({ visibility: '+', type: 'List<Item>' });
    expect(a.find((x) => x.name === 'tags')).toMatchObject({ type: 'Map<String, Tag>' });
    expect(a.find((x) => x.name === 'owner')).toMatchObject({ visibility: '-', type: 'Owner' });
    expect(cls(model, 'Drawable').attributes[0]).toMatchObject({ name: 'MAX', visibility: '+', static: true, type: 'int' });
  });
  it('reads methods and constructors', () => {
    const o = cls(model, 'Shape').operations;
    expect(o.find((x) => x.name === 'Shape')).toMatchObject({ visibility: '+', params: [{ name: 'name', type: 'String' }, { name: 'id', type: 'int' }] });
    expect(o.find((x) => x.name === 'area')).toMatchObject({ abstract: true, type: 'double', visibility: '+' });
    expect(o.find((x) => x.name === 'create')).toMatchObject({ static: true, type: 'Shape', params: [{ name: 'kind', type: 'String' }, { name: 'options', type: 'Map<String, List<Integer>>' }] });
    expect(o.find((x) => x.name === 'convert')).toMatchObject({ visibility: '#', type: 'T', params: [{ name: 'value', type: 'T' }, { name: 'rest', type: 'String...' }] });
    expect(o.find((x) => x.name === 'helper')).toMatchObject({ visibility: '~', type: 'void' });
  });
  it('interface methods are public and abstract', () => {
    const d = cls(model, 'Drawable').operations;
    expect(d.find((x) => x.name === 'draw')).toMatchObject({ visibility: '+', abstract: true, type: 'void' });
    expect(d.find((x) => x.name === 'label')).toMatchObject({ visibility: '+', type: 'String' });
    expect(d.find((x) => x.name === 'label')!.abstract).toBeFalsy();
    expect(cls(model, 'Repository').operations.map((x) => x.name)).toEqual(['find', 'findAll', 'save']);
    expect(cls(model, 'Repository').operations[1].type).toBe('List<T>');
  });
  it('enum constants, constructor and methods', () => {
    expect(cls(model, 'Color').attributes.map((a) => a.name)).toEqual(['RED', 'GREEN', 'code']);
    expect(cls(model, 'Color').operations.map((x) => x.name)).toEqual(['Color', 'code']);
  });
  it('extends, implements and interface inheritance', () => {
    expect(rel(model, 'Circle', 'Shape').kind).toBe('inheritance');
    expect(rel(model, 'Shape', 'Drawable').kind).toBe('realization');
    expect(rel(model, 'Shape', 'Comparable').kind).toBe('realization');
    expect(rel(model, 'Drawable', 'Serializable').kind).toBe('inheritance');
    expect(rel(model, 'Order', 'Base').kind).toBe('inheritance');
    expect(cls(model, 'Comparable').external).toBe(true);
  });
  it('field types that name declared classes become associations', () => {
    expect(rel(model, 'Shape', 'Item', 'association')).toMatchObject({ toMult: '0..*', toRole: 'items', directed: true });
    expect(rel(model, 'Shape', 'Tag', 'association')).toMatchObject({ toMult: '0..*' });
    expect(rel(model, 'Shape', 'Owner', 'association')).toMatchObject({ toMult: '1' });
    expect(rel(model, 'Order', 'Customer', 'association')).toMatchObject({ toMult: '1', toRole: 'customer' });
  });
  it('nested classes are separate classes', () => {
    expect(cls(model, 'Builder')).toBeTruthy();
    expect(cls(model, 'Builder').operations[0].name).toBe('radius');
  });
  it('comments, strings and annotations never confuse the parser', () => {
    const m = parseJava('class A { /* class B { } */ String s = "class C {"; // class D {\n int x; }').model;
    expect(m.classes.map((c) => c.name)).toEqual(['A']);
    expect(m.classes[0].attributes.map((a) => a.name)).toEqual(['s', 'x']);
  });
});
