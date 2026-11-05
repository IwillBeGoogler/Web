import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePython } from './python';
import type { UmlModel } from './model';

const fixture = readFileSync(join(process.cwd(), 'src/lib/uml/fixtures/shop.py.txt'), 'utf8');
const cls = (m: UmlModel, name: string) => m.classes.find((c) => c.name === name)!;
const rel = (m: UmlModel, from: string, to: string, kind?: string) => m.relations.find((r) => r.from === from && r.to === to && (!kind || r.kind === kind))!;

describe('Python import', () => {
  const { model, warnings } = parsePython(fixture);
  it('reads classes, ABC, Protocol, Enum and Generic', () => {
    expect(warnings).toEqual([]);
    expect(cls(model, 'Drawable').kind).toBe('interface');
    expect(cls(model, 'Repository')).toMatchObject({ kind: 'abstract', generics: 'T' });
    expect(cls(model, 'Shape').kind).toBe('abstract');
    expect(cls(model, 'Circle').kind).toBe('class');
    expect(cls(model, 'Color').kind).toBe('enum');
    expect(cls(model, 'Color').attributes.map((a) => a.name)).toEqual(['RED', 'GREEN']);
    expect(model.classes.map((c) => c.name)).not.toContain('Fake');
    expect(model.classes.map((c) => c.name)).not.toContain('Hidden');
  });
  it('reads class-level and self attributes with visibility from underscores', () => {
    const a = cls(model, 'Shape').attributes;
    expect(a.find((x) => x.name === 'count')).toMatchObject({ visibility: '+', type: 'int', default: '0' });
    expect(a.find((x) => x.name === 'cache')).toMatchObject({ visibility: '#', type: 'dict' });
    expect(a.find((x) => x.name === 'name')).toMatchObject({ visibility: '+', type: 'str' });
    expect(a.find((x) => x.name === 'secret')).toMatchObject({ visibility: '-', type: 'str' });
    expect(a.find((x) => x.name === 'items')).toMatchObject({ type: 'List[Item]' });
    expect(a.find((x) => x.name === 'title')).toMatchObject({ visibility: '+', type: 'str' }); // @property
    expect(cls(model, 'Item').attributes).toEqual([{ visibility: '+', name: 'sku', type: 'str' }, { visibility: '+', name: 'price', type: 'float', default: '0.0' }]);
  });
  it('reads methods: params without self/cls, return types, static, abstract', () => {
    const o = cls(model, 'Shape').operations;
    expect(o.find((x) => x.name === '__init__')).toMatchObject({ visibility: '+', params: [{ name: 'name', type: 'str' }, { name: 'id', type: 'int' }] });
    expect(o.find((x) => x.name === 'area')).toMatchObject({ abstract: true, type: 'float', params: [] });
    expect(o.find((x) => x.name === 'create')).toMatchObject({ static: true, type: 'Shape', params: [{ name: 'kind', type: 'str' }] });
    expect(o.find((x) => x.name === 'make')).toMatchObject({ static: true, params: [{ name: 'a', type: 'int' }] });
    expect(o.find((x) => x.name === 'helper')).toMatchObject({ visibility: '#' });
    expect(o.find((x) => x.name === 'private')).toMatchObject({ visibility: '-', params: [{ name: '*args' }, { name: '**kw' }] });
    expect(o.find((x) => x.name === 'title')).toBeUndefined();
    expect(cls(model, 'Repository').operations[0]).toMatchObject({ name: 'find', abstract: true, type: 'Optional[T]' });
    expect(cls(model, 'Drawable').operations[0]).toMatchObject({ name: 'draw', type: 'None' });
  });
  it('bases become inheritance, or realization when the base is a Protocol', () => {
    expect(rel(model, 'Circle', 'Shape').kind).toBe('inheritance');
    expect(rel(model, 'Circle', 'Drawable').kind).toBe('realization');
    expect(rel(model, 'Order', 'Base').kind).toBe('inheritance');
    expect(cls(model, 'Base').external).toBe(true);
    expect(model.relations.some((r) => r.to === 'ABC' || r.to === 'Enum' || r.to === 'Protocol' || r.to === 'Generic')).toBe(false);
  });
  it('annotated attributes that name declared classes become associations', () => {
    expect(rel(model, 'Shape', 'Item', 'association')).toMatchObject({ toMult: '0..*', toRole: 'items', directed: true });
    expect(rel(model, 'Shape', 'Owner', 'association')).toMatchObject({ toMult: '0..1' });
    expect(rel(model, 'Order', 'Customer', 'association')).toBeTruthy();
    expect(rel(model, 'Order', 'Item', 'association')).toMatchObject({ toMult: '0..*', toRole: 'lines' });
  });
  it('handles multi-line signatures and nested classes', () => {
    const m = parsePython('class A:\n    def f(\n        self,\n        a: int,\n        b: str = "x",\n    ) -> bool:\n        class Inner:\n            pass\n        return True\n').model;
    expect(m.classes.find((c) => c.name === 'A')!.operations[0]).toMatchObject({ name: 'f', type: 'bool', params: [{ name: 'a', type: 'int' }, { name: 'b', type: 'str' }] });
    expect(m.classes.map((c) => c.name)).toContain('Inner');
  });
});
