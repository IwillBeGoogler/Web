import { describe, expect, it } from 'vitest';
import { parseJava, stripJava } from './java';
import type { UmlModel } from './model';

const cls = (m: UmlModel, n: string) => m.classes.find((c) => c.name === n)!;
const rel = (m: UmlModel, from: string, to: string, kind?: string) => m.relations.find((r) => r.from === from && r.to === to && (!kind || r.kind === kind));

describe('java cov: stripJava', () => {
  it('blanks comments and literals, keeps newlines and length', () => {
    const src = '// c\n/* a\nb */ "s\\"x" \'c\' x /* open';
    const out = stripJava(src);
    expect(out.split('\n').length).toBe(3);
    expect(out).not.toContain('c\n/*');
    expect(out).toContain('x');
    expect(out.includes('s')).toBe(false);
    expect(stripJava('"a\nb"')).toBe('" \n "');
  });
});

describe('java cov: parse', () => {
  it('annotations: with args, interface annotation, trailing space/newline, bare at end', () => {
    const { model } = parseJava(`
@Foo(a = (1), b = "x")
@Bar
@Baz
public class A {
  @Inject private int x;
  @Override
  public void run() {}
  int @
}
public @interface Marker { String v(); }`);
    expect(cls(model, 'A').attributes[0]).toMatchObject({ name: 'x', visibility: '-' });
    expect(cls(model, 'A').operations[0].name).toBe('run');
    expect(cls(model, 'Marker').kind).toBe('interface');
  });

  it('enum with constants+args, constants + members, empty enum, enum constants with body block', () => {
    const { model } = parseJava(`
enum Plain { A, B, C }
enum Args { X(1), Y(2, "z"); private int v; Args(int v) { this.v = v; } int get() { return v; } }
enum Body { P { void f() {} }, Q; void g() {} }
enum Empty { }
enum Semi { ; int z; }`);
    expect(cls(model, 'Plain').attributes.map((a) => a.name)).toEqual(['A', 'B', 'C']);
    expect(cls(model, 'Args').attributes.map((a) => a.name)).toEqual(expect.arrayContaining(['X', 'Y', 'v']));
    expect(cls(model, 'Args').operations.map((o) => o.name)).toEqual(expect.arrayContaining(['Args', 'get']));
    expect(cls(model, 'Body').kind).toBe('enum');
    expect(cls(model, 'Empty').attributes).toEqual([]);
    expect(cls(model, 'Semi').attributes.map((a) => a.name)).toContain('z');
  });

  it('methods: generics, varargs, final params, nested generic types, ctor, wrong-name ctor skipped, default/static in interface', () => {
    const { model } = parseJava(`
public abstract class Svc<T extends Comparable<T>> extends Base<T> implements A, B<String> {
  public static final int K = 5;
  protected Map<String, List<Item>> index = new HashMap<>();
  int[] arr = { 1, 2, 3 };
  String[] names = new String[] { "a" };
  private int a, b;
  public Svc(final int n) {}
  Other() {}
  public <U> U conv(Map<String, U> m, String... rest) { return null; }
  abstract void ab();
  public static <X extends Y> List<X> sm() { return null; }
  public final synchronized void fin(List<? extends Number> xs) {}
  static { init(); }
}
interface I extends J, K {
  int C = 3;
  void a();
  static void s() {}
  default void d() {}
  private void p() {}
  <T> T gen(T t);
}`);
    const svc = cls(model, 'Svc');
    expect(svc.kind).toBe('abstract');
    expect(svc.generics).toBe('T extends Comparable<T>');
    expect(svc.attributes.find((a) => a.name === 'K')).toMatchObject({ static: true, default: '5', visibility: '+' });
    expect(svc.attributes.find((a) => a.name === 'index')?.type).toBe('Map<String, List<Item>>');
    expect(svc.attributes.find((a) => a.name === 'arr')).toBeDefined();
    expect(svc.operations.find((o) => o.name === 'Svc')).toMatchObject({ params: [{ name: 'n', type: 'int' }] });
    expect(svc.operations.find((o) => o.name === 'Other')).toBeUndefined();
    expect(svc.operations.find((o) => o.name === 'conv')).toMatchObject({ type: 'U', params: [{ name: 'm', type: 'Map<String, U>' }, { name: 'rest', type: 'String...' }] });
    expect(svc.operations.find((o) => o.name === 'ab')?.abstract).toBe(true);
    expect(svc.operations.find((o) => o.name === 'sm')).toMatchObject({ static: true, type: 'List<X>' });
    expect(rel(model, 'Svc', 'Base', 'inheritance')).toBeDefined();
    expect(rel(model, 'Svc', 'B', 'realization')).toBeDefined();
    const i = cls(model, 'I');
    expect(i.operations.find((o) => o.name === 'a')?.abstract).toBe(true);
    expect(i.operations.find((o) => o.name === 's')?.abstract).toBeUndefined();
    expect(i.operations.find((o) => o.name === 'd')?.abstract).toBeUndefined();
    expect(i.attributes[0]).toMatchObject({ name: 'C', static: true, visibility: '+' });
    expect(i.attributes[0].default).toBeUndefined();
    expect(rel(model, 'I', 'J', 'inheritance')).toBeDefined();
  });

  it('records with components and nested types; nested types stripped from outer', () => {
    const { model } = parseJava(`
package a.b;
public record Pt(int x, List<Pt> kids, String... names) implements Shape { }
class Outer {
  private int o;
  static class Inner { int i; }
  public interface Cb { void f(); }
  enum E { A }
  int after;
}`);
    expect(cls(model, 'Pt').package).toBe('a.b');
    expect(cls(model, 'Pt').attributes.map((a) => a.name)).toEqual(['x', 'kids', 'names']);
    expect(rel(model, 'Pt', 'Pt', 'association')).toMatchObject({ toMult: '0..*' });
    expect(cls(model, 'Outer').attributes.map((a) => a.name)).toEqual(['o', 'after']);
    expect(cls(model, 'Inner').attributes.map((a) => a.name)).toEqual(['i']);
  });

  it('associations: arrays, Optional, collections, maps, generics, qualified, unknown types', () => {
    const { model } = parseJava(`
class T1 {}
class T2 {}
class T3 {}
class T4 {}
class T5 {}
class T6 {}
class Holder {
  T1 one;
  T4[] many;
  Optional<T2> opt;
  List<T3> list;
  Map<String, T5> map;
  Map raw;
  Foo<T1> other;
  java.util.Set<T6> set;
  String s;
}`);
    expect(rel(model, 'Holder', 'T1', 'association')).toBeDefined();
    const mults = model.relations.filter((r) => r.kind === 'association').map((r) => `${r.toRole}:${r.to}:${r.toMult}`);
    expect(mults).toEqual(expect.arrayContaining(['one:T1:1', 'many:T4:0..*', 'opt:T2:0..1', 'list:T3:0..*', 'map:T5:0..*', 'set:T6:0..*']));
    expect(mults.some((x) => x.startsWith('other'))).toBe(false);
  });

  it('extends/implements: skips blanks, existing external reuse, interface implements path', () => {
    const { model } = parseJava(`
class Child extends Parent {}
class Parent {}
interface Q extends A, B {}
interface W extends A implements C {}`);
    expect(cls(model, 'Parent').external).toBeUndefined();
    expect(rel(model, 'Child', 'Parent', 'inheritance')).toBeDefined();
    expect(cls(model, 'A').external).toBe(true);
    expect(rel(model, 'W', 'C')).toBeDefined();
  });

  it('chunks: parens in head, trailing chunk without semicolon, junk', () => {
    const { model } = parseJava(`
class C {
  int f(int a, int b) { return a; }
  int g = compute(1, 2);
  Runnable r = () -> { run(); };
  trailing
}`);
    const c = cls(model, 'C');
    expect(c.operations.map((o) => o.name)).toContain('f');
    expect(c.attributes.map((a) => a.name)).toEqual(expect.arrayContaining(['g']));
  });

  it('class redeclared and abstract detection via modifiers', () => {
    const { model } = parseJava(`abstract class Z {}\nclass Z2 {}`);
    expect(cls(model, 'Z').kind).toBe('abstract');
    expect(cls(model, 'Z2').kind).toBe('class');
  });

  it('empty and non-java input yields empty model', () => {
    expect(parseJava('').model.classes).toEqual([]);
    expect(parseJava('nothing here').model.classes).toEqual([]);
  });

  it('nameless generic heads and constructor-like generic heads do not crash', () => {
    const { model } = parseJava(`
class Box<T> {}
class C<T> {
  List<String>;
  Map<String, List<Integer>>;
  Foo<T>(int a) {}
  Box<String> b;
  Map<> raw;
  Box<> empty;
}
record R(x, int y) {}
class D extends B1, <X> {}`);
    const c = cls(model, 'C');
    expect(c.attributes.map((a) => a.name)).toEqual(expect.arrayContaining(['b', 'raw']));
    expect(c.operations).toEqual([]);
    expect(rel(model, 'C', 'Box', 'association')).toMatchObject({ toMult: '1' });
    expect(cls(model, 'R').attributes.map((a) => a.name)).toEqual(['y']);
    expect(rel(model, 'D', 'B1', 'inheritance')).toBeDefined();
  });
});
