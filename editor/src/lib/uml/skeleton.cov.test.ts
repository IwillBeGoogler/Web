import { describe, expect, it } from 'vitest';
import { renderJava, renderTypeScript } from './skeleton';
import { newClassDef, type UmlModel } from './model';

const m = (classes: UmlModel['classes'], relations: UmlModel['relations'] = []): UmlModel => ({ classes, relations });

describe('skeleton cov: TypeScript', () => {
  it('skips bare external classes, keeps external with members', () => {
    const out = renderTypeScript(m([newClassDef('Ext', { external: true }), newClassDef('Ext2', { external: true, attributes: [{ visibility: '+', name: 'a' }] })]));
    expect(out).not.toContain('class Ext {');
    expect(out).toContain('class Ext2 {');
  });
  it('enum, interface with untyped members and extends', () => {
    const out = renderTypeScript(m(
      [
        newClassDef('E', { kind: 'enum', attributes: [{ visibility: '', name: 'A' }] }),
        newClassDef('I', { kind: 'interface', attributes: [{ visibility: '+', name: 'x' }, { visibility: '+', name: 'y', type: 'number' }], operations: [{ visibility: '+', name: 'f', params: [{ name: 'a' }, { name: 'b', type: 'B' }] }, { visibility: '+', name: 'g', type: 'string' }] }),
        newClassDef('J', { kind: 'interface', generics: 'T' }),
        newClassDef('P', { kind: 'interface' }),
      ],
      [{ from: 'J', to: 'P', kind: 'inheritance' }, { from: 'J', to: 'Q', kind: 'realization' }],
    ));
    expect(out).toContain('export enum E {\n  A,\n}');
    expect(out).toContain('  x: any;');
    expect(out).toContain('  y: number;');
    expect(out).toContain('  f(a: any, b: B): void;');
    expect(out).toContain('  g(): string;');
    expect(out).toContain('export interface J<T> extends P, Q {');
    expect(out).toContain('export interface I {');
  });
  it('class: ctor, static/abstract/visibility, extends + implements, no blank line without both', () => {
    const out = renderTypeScript(m(
      [
        newClassDef('A', {
          kind: 'abstract', generics: 'T',
          attributes: [{ visibility: '-', name: 'p' }, { visibility: '#', name: 'q', type: 'Q', default: '1', static: true }, { visibility: '+', name: 'r' }],
          operations: [
            { visibility: '+', name: 'A', params: [{ name: 'z', type: 'Z' }] },
            { visibility: '+', name: '__init__', params: [] },
            { visibility: '#', name: 'abs', params: [], abstract: true, type: 'void' },
            { visibility: '-', name: 'st', params: [], static: true },
            { visibility: '+', name: 'run', params: [], type: 'number' },
          ],
        }),
        newClassDef('B', { operations: [{ visibility: '+', name: 'x', params: [] }] }),
      ],
      [{ from: 'A', to: 'Base', kind: 'inheritance' }, { from: 'A', to: 'Base2', kind: 'inheritance' }, { from: 'A', to: 'Iface', kind: 'realization' }],
    ));
    expect(out).toContain('export abstract class A<T> extends Base implements Base2, Iface {');
    expect(out).toContain('  private p: any;');
    expect(out).toContain('  protected static q: Q = 1;');
    expect(out).toContain('  constructor(z: Z) {');
    expect(out).toContain('  protected abstract abs(): void;');
    expect(out).toContain('  private static st() {');
    expect(out).toContain("throw new Error('Not implemented')");
    expect(out).toContain('  run(): number {');
    expect(out).toContain('export class B {\n  x() {');
  });
});

describe('skeleton cov: Java', () => {
  it('package emitted only for a single package; enum; interface members', () => {
    const one = renderJava(m([newClassDef('E', { kind: 'enum', package: 'p.q', attributes: [{ visibility: '', name: 'A' }, { visibility: '', name: 'B' }] })]));
    expect(one.startsWith('package p.q;')).toBe(true);
    expect(one).toContain('public enum E {\n  A,\n  B\n}');
    const two = renderJava(m([newClassDef('X', { package: 'a' }), newClassDef('Y', { package: 'b' })]));
    expect(two).not.toContain('package');
    const none = renderJava(m([newClassDef('X')]));
    expect(none).not.toContain('package');
  });
  it('interface maps types, defaults, extends', () => {
    const out = renderJava(m(
      [newClassDef('I', { kind: 'interface', generics: 'T', attributes: [{ visibility: '+', name: 'K', type: 'number', default: '1' }, { visibility: '+', name: 'N' }], operations: [{ visibility: '+', name: 'f', params: [{ name: '...xs', type: 'string[]' }, { name: 'o?', type: 'str' }] }, { visibility: '+', name: 'g', type: 'boolean', params: [] }] })],
      [{ from: 'I', to: 'S', kind: 'inheritance' }],
    ));
    expect(out).toContain('public interface I<T> extends S {');
    expect(out).toContain('  double K = 1;');
    expect(out).toContain('  Object N;');
    expect(out).toContain('  void f(String[] xs, String o);');
    expect(out).toContain('  boolean g();');
  });
  it('class: visibility, static, ctor, abstract, default returns', () => {
    const out = renderJava(m(
      [newClassDef('C', {
        kind: 'abstract', generics: 'T',
        attributes: [{ visibility: '-', name: 'a', type: 'int', static: true, default: '2' }, { visibility: '#', name: 'b' }, { visibility: '~', name: 'c', type: 'bool' }, { visibility: '+', name: 'd', type: 'Date' }],
        operations: [
          { visibility: '+', name: 'C', params: [{ name: 'x', type: 'number' }] },
          { visibility: '~', name: '__init__', params: [] },
          { visibility: '+', name: 'abs', params: [], abstract: true },
          { visibility: '+', name: 'vd', params: [] },
          { visibility: '+', name: 'num', params: [], type: 'int' },
          { visibility: '+', name: 'bl', params: [], type: 'boolean' },
          { visibility: '+', name: 'ob', params: [], type: 'Foo', static: true },
        ],
      })],
      [{ from: 'C', to: 'P', kind: 'inheritance' }, { from: 'C', to: 'Q', kind: 'inheritance' }, { from: 'C', to: 'R', kind: 'realization' }],
    ));
    expect(out).toContain('public abstract class C<T> extends P implements Q, R {');
    expect(out).toContain('  private static int a = 2;');
    expect(out).toContain('  protected Object b;');
    expect(out).toContain('  boolean c;');
    expect(out).toContain('  public Date d;');
    expect(out).toContain('  public C(double x) {');
    expect(out).toContain('  C() {');
    expect(out).toContain('  public abstract void abs();');
    expect(out).toMatch(/public void vd\(\) \{\n  \}/);
    expect(out).toContain('    return 0;');
    expect(out).toContain('    return false;');
    expect(out).toContain('    return null;');
    expect(out).toContain('  public static Foo ob() {');
  });
  it('class without attributes or heritage', () => {
    const out = renderJava(m([newClassDef('Z', { operations: [{ visibility: '+', name: 'f', params: [] }] })]));
    expect(out).toContain('public class Z {\n  public void f() {');
  });
});
