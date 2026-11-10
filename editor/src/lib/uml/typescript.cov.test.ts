import { describe, expect, it } from 'vitest';
import { loadTypeScript, parseTypeScript } from './typescript';
import type { UmlModel } from './model';

const cls = (m: UmlModel, n: string) => m.classes.find((c) => c.name === n)!;
const assoc = (m: UmlModel) => m.relations.filter((r) => r.kind === 'association').map((r) => `${r.from}.${r.toRole}->${r.to}:${r.toMult}`);

describe('typescript cov', () => {
  it('loadTypeScript is memoised', async () => {
    const a = loadTypeScript();
    expect(loadTypeScript()).toBe(a);
    expect((await a).createSourceFile).toBeTypeOf('function');
  });

  it('syntax problems become warnings (with and without positions)', async () => {
    const { warnings } = await parseTypeScript('class A { x: ; }\nclass B {');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/^Syntax problem on line \d+: /);
    expect((await parseTypeScript('class {{{{{{{{{{{{{{ ((((((((')).warnings.length).toBeLessThanOrEqual(5);
  });

  it('members: private ids, string-literal names, accessors, ctor param properties, signatures', async () => {
    const { model } = await parseTypeScript(`
class P {}
class Q {}
class A<T, U extends P> {
  #secret: string = 'x';
  'quoted-name': number;
  static count = 0;
  flag = true;
  off = false;
  n = 3;
  other = foo();
  opt?: P;
  public pub: number;
  get g(): P { return null as any; }
  get ug() { return 1; }
  static get sg(): string { return ''; }
  set g(v: P) {}
  constructor(private a: P, protected readonly b: Q, public c: string, readonly d: number, plain: number, e?, ...rest: number[]) { super(); }
  #priv(): void {}
  static make(x = 'a', y = 1, z = true, w = foo(), ...r: number[]): A<any, any> { return null as any; }
  abstract?(): void;
  m?(a?: P): P | undefined { return undefined; }
  [Symbol.iterator]() { return null as any; }
}
interface I<T> extends Array<T> {
  prop: string;
  readonly ro?: number;
  meth(a: number): void;
  opt?(): void;
  new (x: number): I<T>;
  [k: string]: any;
}
abstract class Ab { abstract run(): void; protected abstract x: number; }
`);
    const a = cls(model, 'A');
    const at = (n: string) => a.attributes.find((x) => x.name === n)!;
    expect(a.generics).toBe('T, U extends P');
    expect(at('secret')).toMatchObject({ visibility: '-', type: 'string', default: "'x'" });
    expect(at('quoted-name')).toMatchObject({ type: 'number' });
    expect(at('count')).toMatchObject({ static: true, type: 'number', default: '0' });
    expect(at('flag').type).toBe('boolean');
    expect(at('off').type).toBe('boolean');
    expect(at('n').type).toBe('number');
    expect(at('other').type).toBeUndefined();
    expect(at('opt?')).toMatchObject({ type: 'P' });
    expect(at('g')).toMatchObject({ type: 'P' });
    expect(at('ug').type).toBeUndefined();
    expect(a.attributes.filter((x) => x.name === 'g').length).toBe(1);
    expect(at('sg')).toMatchObject({ static: true });
    expect(at('a')).toMatchObject({ visibility: '-', type: 'P' });
    expect(at('b')).toMatchObject({ visibility: '#', type: 'Q' });
    expect(at('c')).toMatchObject({ visibility: '+', type: 'string' });
    expect(at('d')).toBeDefined();
    expect(a.attributes.find((x) => x.name === 'plain')).toBeUndefined();
    const ctor = a.operations.find((o) => o.name === 'A')!;
    expect(ctor.params.map((p) => p.name)).toEqual(['a', 'b', 'c', 'd', 'plain', 'e?', '...rest']);
    const mk = a.operations.find((o) => o.name === 'make')!;
    expect(mk).toMatchObject({ static: true, type: 'A<any, any>' });
    expect(mk.params).toEqual([{ name: 'x', type: 'string' }, { name: 'y', type: 'number' }, { name: 'z', type: 'boolean' }, { name: 'w' }, { name: '...r', type: 'number[]' }]);
    expect(a.operations.find((o) => o.name === 'priv')).toMatchObject({ visibility: '-' });
    expect(a.operations.find((o) => o.name === 'm?')).toBeDefined();
    expect(a.operations.some((o) => o.name.includes('Symbol'))).toBe(true);
    const i = cls(model, 'I');
    expect(i.attributes.map((x) => x.name)).toEqual(['prop', 'ro?']);
    expect(i.operations.map((x) => x.name)).toEqual(['meth', 'opt?']);
    expect(cls(model, 'Ab').kind).toBe('abstract');
    expect(cls(model, 'Ab').operations[0].abstract).toBe(true);
    expect(model.relations.find((r) => r.from === 'I' && r.to === 'Array')?.kind).toBe('inheritance');
  });

  it('heritage, enums, namespaces, modules, nested blocks', async () => {
    const { model } = await parseTypeScript(`
class Base {}
class C extends ns.Base implements I1, a.I2 {}
enum E { A, 'B-c' = 2, C = 'x' }
namespace Outer.Inner { export class N {} }
namespace Outer { export namespace Deep { class D {} } export class O {} }
declare module 'my-mod' { class M {} }
declare module Foo;
{ class InBlock {} }
function f() { class NotVisited {} }
const x = 1;
`);
    expect(model.relations.find((r) => r.from === 'C' && r.to === 'Base')?.kind).toBe('inheritance');
    expect(model.relations.find((r) => r.from === 'C' && r.to === 'I2')?.kind).toBe('realization');
    expect(cls(model, 'I1').external).toBe(true);
    expect(cls(model, 'E').attributes.map((a) => a.name)).toEqual(['A', 'B-c', 'C']);
    expect(cls(model, 'N').package).toBe('Outer.Inner');
    expect(cls(model, 'D').package).toBe('Outer.Deep');
    expect(cls(model, 'O').package).toBe('Outer');
    expect(cls(model, 'M').package).toBe('my-mod');
    expect(cls(model, 'InBlock')).toBeDefined();
    expect(model.classes.find((c) => c.name === 'NotVisited')).toBeUndefined();
  });

  it('redeclared (merged) class replaces external placeholder', async () => {
    const { model } = await parseTypeScript(`class A extends B {}\nclass B {}`);
    expect(cls(model, 'B').external).toBeUndefined();
    expect(model.classes.filter((c) => c.name === 'B').length).toBe(1);
  });

  it('associations: arrays, unions with null/undefined, collections, maps, wrappers, readonly, parens, self, unknown', async () => {
    const { model } = await parseTypeScript(`
class T1 {} class T2 {} class T3 {} class T4 {} class T5 {} class T6 {} class T7 {} class T8 {} class T9 {} class T10 {} class T11 {} class T12 {} class T13 {} class T14 {}
class H {
  a: T1;
  b: T2[];
  c: T3 | null;
  d: T4 | undefined;
  e: T5 | T6;
  f: Set<T7>;
  g: Map<string, T8>;
  h: Map;
  i: Promise<T9>;
  j: readonly T10[];
  k: (T11 | null);
  l: Foo<T1>;
  m: string;
  n?: T14;
  o: Record<string, T3>;
  p: Array<T4 | null>;
  q: [T1, T2];
  r: H;
  s: T5 | (T6 | null);
  get t(): T12 { return null as any; }
  constructor(readonly u: T13) {}
}
`);
    const r = assoc(model);
    expect(r).toEqual(expect.arrayContaining(['H.a->T1:1', 'H.b->T2:0..*', 'H.c->T3:0..1', 'H.d->T4:0..1', 'H.e->T5:1', 'H.e->T6:1', 'H.f->T7:0..*', 'H.g->T8:0..*', 'H.i->T9:1', 'H.j->T10:0..*', 'H.k->T11:0..1', 'H.t->T12:1', 'H.u->T13:1', 'H.r->H:1']));
    expect(r.some((x) => x.startsWith('H.l') || x.startsWith('H.m') || x.startsWith('H.h') || x.startsWith('H.q'))).toBe(false);
    expect(r).toContain('H.n->T14:0..1');
  });

  it('associations: false disables edges', async () => {
    const { model } = await parseTypeScript('class A {} class B { a: A }', { associations: false });
    expect(model.relations).toEqual([]);
    expect((await parseTypeScript('class A {} class B { a: A }')).model.relations.length).toBe(1);
  });

  it('empty source', async () => {
    const { model, warnings } = await parseTypeScript('');
    expect(model.classes).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('untyped members, private getters, untyped parameter properties, nested dotted namespaces', async () => {
    const { model } = await parseTypeScript(`
class A {
  bare;
  get #pg(): string { return ''; }
  get untyped() { return 1; }
  constructor(private p, public readonly q) {}
}
namespace X { namespace Y.Z { class W {} } }
`);
    const a = cls(model, 'A');
    expect(a.attributes.find((x) => x.name === 'bare')?.type).toBeUndefined();
    expect(a.attributes.find((x) => x.name === 'pg')).toMatchObject({ visibility: '-', type: 'string' });
    expect(a.attributes.find((x) => x.name === 'p')).toMatchObject({ visibility: '-' });
    expect(a.attributes.find((x) => x.name === 'p')?.type).toBeUndefined();
    expect(a.attributes.find((x) => x.name === 'q')).toBeDefined();
    expect(cls(model, 'W').package).toBe('X.Y.Z');
  });
});
