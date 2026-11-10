import { describe, expect, it } from 'vitest';
import { parseCSharp } from './csharp';
import type { UmlModel } from './model';

const cls = (m: UmlModel, n: string) => m.classes.find((c) => c.name === n)!;
const rel = (m: UmlModel, from: string, to: string, kind?: string) => m.relations.find((r) => r.from === from && r.to === to && (!kind || r.kind === kind));

describe('C# import: edge cases', () => {
  it('empty source gives empty model', () => {
    const { model, warnings } = parseCSharp('');
    expect(model).toEqual({ classes: [], relations: [] });
    expect(warnings).toEqual([]);
  });

  it('visibility rules: private, protected, internal, interface default, class default', () => {
    const { model } = parseCSharp(`
class C {
  private int a;
  protected int b;
  internal int c;
  public int d;
  int e;
}
interface I { int Prop; void Run(); static void S() {} }`);
    const at = (n: string) => cls(model, 'C').attributes.find((x) => x.name === n)!.visibility;
    expect(['a', 'b', 'c', 'd', 'e'].map(at)).toEqual(['-', '#', '~', '+', '-']);
    expect(cls(model, 'I').attributes[0].visibility).toBe('+');
    const ops = cls(model, 'I').operations;
    expect(ops.find((o) => o.name === 'Run')).toMatchObject({ visibility: '+', abstract: true });
    expect(ops.find((o) => o.name === 'S')?.abstract).toBeUndefined();
    expect(ops.find((o) => o.name === 'S')?.static).toBe(true);
  });

  it('skips using/namespace/delegate/event/operator/indexer members and nested types', () => {
    const { model } = parseCSharp(`
class C {
  event Action Changed;
  delegate void H(int x);
  public static C operator +(C a, C b) { return a; }
  public int this[int i] { get { return 0; } }
  public class Inner { public int Hidden; }
  public int Visible;
  using x;
}`);
    const c = cls(model, 'C');
    expect(c.attributes.map((a) => a.name)).toEqual(['Visible']);
    expect(c.operations).toEqual([]);
  });

  it('constructors, methods, abstract, static, params with attributes/modifiers/defaults', () => {
    const { model } = parseCSharp(`
abstract class Base {
  public Base(int x) {}
  protected abstract string Name(ref int a, out string b, params int[] rest);
  public static List<int> Make(this Base self, int n = 3, [Foo] string s = "x") { return null; }
  void notCtor2() {}
  Weird() {}
}`);
    const c = cls(model, 'Base');
    expect(c.kind).toBe('abstract');
    const ctor = c.operations.find((o) => o.name === 'Base')!;
    expect(ctor.type).toBeUndefined();
    expect(ctor.params).toEqual([{ name: 'x', type: 'int' }]);
    const name = c.operations.find((o) => o.name === 'Name')!;
    expect(name).toMatchObject({ visibility: '#', abstract: true, type: 'string' });
    expect(name.params).toEqual([{ name: 'a', type: 'int' }, { name: 'b', type: 'string' }, { name: 'rest', type: 'int' }]);
    const make = c.operations.find((o) => o.name === 'Make')!;
    expect(make).toMatchObject({ static: true, type: 'List<int>' });
    expect(make.params).toEqual([{ name: 'self', type: 'Base' }, { name: 'n', type: 'int' }, { name: 's', type: 'string' }]);
    expect(c.operations.find((o) => o.name === 'notCtor2')?.type).toBe('void');
    // a no-return-type member that is not the ctor is ignored
    expect(c.operations.find((o) => o.name === 'Weird')).toBeUndefined();
  });

  it('property forms: auto, arrow, initialiser after accessors, const, static', () => {
    const { model } = parseCSharp(`
class P {
  public int A { get; set; } = 5;
  public string B => "x";
  public const int K = 7;
  public static readonly string S = "s";
  public List<int> L = new List<int>();
  public int[] Arr = { 1, 2 };
  public int Q { get; } = 1;
}`);
    const a = cls(model, 'P').attributes;
    const by = (n: string) => a.find((x) => x.name === n)!;
    expect(by('A')).toMatchObject({ type: 'int', default: '5' });
    expect(by('B').default).toBeUndefined();
    expect(by('K')).toMatchObject({ static: true, default: '7' });
    expect(by('S')).toMatchObject({ static: true });
    expect(by('L').default).toBe('new List<int>()');
    expect(by('Arr').type).toBe('int[]');
    expect(by('Q').default).toBe('1');
  });

  it('record with parameters; record struct; positional types create associations', () => {
    const { model } = parseCSharp(`
namespace N;
record Point(int X, int Y);
record struct Pair(Point A, string Label);
public record class Rec { public int V; }
struct S { public int Z; }`);
    expect(cls(model, 'Point')).toMatchObject({ stereotype: 'record', package: 'N' });
    expect(cls(model, 'Point').attributes.map((a) => a.name)).toEqual(['X', 'Y']);
    expect(cls(model, 'Pair')).toMatchObject({ stereotype: 'record' });
    expect(rel(model, 'Pair', 'Point', 'association')).toMatchObject({ toMult: '1', toRole: 'A' });
    expect(cls(model, 'Rec').stereotype).toBe('record');
    expect(cls(model, 'S').stereotype).toBe('struct');
  });

  it('record parameters without a type are ignored', () => {
    const { model } = parseCSharp('record R(x, int y);');
    expect(cls(model, 'R').attributes.map((a) => a.name)).toEqual(['y']);
  });

  it('enum with values and junk', () => {
    const { model } = parseCSharp('enum E : byte { A = 1, B, C = 3 }');
    expect(cls(model, 'E').kind).toBe('enum');
    expect(cls(model, 'E').attributes.map((a) => a.name)).toEqual(['A', 'B', 'C']);
    expect(model.relations).toEqual([]);
    const g = parseCSharp('enum E2 { A = (1 + 2), }');
    expect(cls(g.model, 'E2').attributes.map((a) => a.name)).toEqual(['A']);
  });

  it('base lists: class extends + implements, interface-only extends, I-prefix heuristic, where clause', () => {
    const { model } = parseCSharp(`
interface IA {}
interface IB : IA {}
class Base {}
class Impl : Base, IA, IUnknown, System.IDisposable {}
class G<T> : Base where T : class {}
`);
    expect(rel(model, 'IB', 'IA', 'inheritance')).toBeTruthy();
    expect(rel(model, 'Impl', 'Base', 'inheritance')).toBeTruthy();
    expect(rel(model, 'Impl', 'IA', 'realization')).toBeTruthy();
    expect(rel(model, 'Impl', 'IUnknown', 'realization')).toBeTruthy();
    expect(rel(model, 'Impl', 'IDisposable', 'realization')).toBeTruthy();
    expect(cls(model, 'IUnknown').external).toBe(true);
    expect(cls(model, 'G')).toMatchObject({ generics: 'T' });
    expect(rel(model, 'G', 'Base', 'inheritance')).toBeTruthy();
    expect(model.relations.filter((r) => r.from === 'G')).toHaveLength(1);
  });

  it('non-I external base is inheritance', () => {
    const { model } = parseCSharp('class A : ExternalThing {}');
    expect(rel(model, 'A', 'ExternalThing', 'inheritance')).toBeTruthy();
  });

  it('class declared twice reuses and clears external', () => {
    const { model } = parseCSharp('class A : B {}\nclass B { public int x; }');
    expect(model.classes.filter((c) => c.name === 'B')).toHaveLength(1);
    expect(cls(model, 'B').external).toBeUndefined();
    expect(cls(model, 'B').attributes).toHaveLength(1);
  });

  it('association multiplicities: nullable, arrays, collections, dictionaries, Nullable/Lazy, unknown generics, self-reference', () => {
    const { model } = parseCSharp(`
class T1 {} class T2 {} class T3 {} class T4 {} class T5 {} class T6 {} class T7 {} class T8 {}
class Owner {
  public T1 One;
  public T2? Opt;
  public T3[] Arr;
  public T4[,] Grid;
  public List<T5> Many;
  public Dictionary<string, T6> Map;
  public Dictionary<> Empty;
  public Nullable<T7> Nul;
  public Lazy<T8> Lz;
  public Foo<T1> Unknown;
  public Owner Self;
  public System.Threading.Tasks.T1 Qualified;
  public int[] Ints;
  public string? Str;
}`);
    const r = (role: string) => model.relations.find((x) => x.from === 'Owner' && x.toRole === role);
    expect(r('One')).toMatchObject({ to: 'T1', toMult: '1', kind: 'association', directed: true });
    expect(r('Opt')).toMatchObject({ to: 'T2', toMult: '0..1' });
    expect(r('Arr')?.toMult).toBe('0..*');
    expect(r('Grid')?.toMult).toBe('0..*');
    expect(r('Many')?.toMult).toBe('0..*');
    expect(r('Map')).toMatchObject({ to: 'T6', toMult: '0..*' });
    expect(r('Empty')).toBeUndefined();
    expect(r('Nul')?.toMult).toBe('0..1');
    expect(r('Lz')?.toMult).toBe('0..1');
    expect(r('Unknown')).toBeUndefined();
    expect(r('Self')).toBeUndefined();
    expect(r('Ints')).toBeUndefined();
    expect(r('Str')).toBeUndefined();
    // identical ends/kind are deduplicated: only the first role survives
    expect(r('Qualified')).toBeUndefined();
    expect(model.relations.filter((x) => x.from === 'Owner' && x.to === 'T1')).toHaveLength(1);
  });

  it('Nullable<T> of collection keeps multiplicity; declared generic type referenced directly', () => {
    const { model } = parseCSharp(`
class Box<T> {}
class T1 {}
class U {
  public Box<int> B;
  public Nullable<List<T1>> NL;
}`);
    expect(model.relations.find((r) => r.toRole === 'B')).toMatchObject({ to: 'Box', toMult: '1' });
    expect(model.relations.find((r) => r.toRole === 'NL')).toMatchObject({ to: 'T1', toMult: '0..*' });
  });

  it('attributes before declarations are dropped but array types are not', () => {
    const { model } = parseCSharp(`
[Serializable]
[Obsolete("x")]
public class A {
  [JsonIgnore] public int a;
  public int[] b;
}`);
    expect(cls(model, 'A').attributes.map((a) => `${a.name}:${a.type}`)).toEqual(['a:int', 'b:int[]']);
  });

  it('head consisting only of modifiers or no type is skipped', () => {
    const { model } = parseCSharp('class A { public; static ; int ; foo bar baz qux?; public int ok; }');
    expect(cls(model, 'A').attributes.map((a) => a.name)).toContain('ok');
    expect(cls(model, 'A').attributes.every((a) => /^\w+$/.test(a.name))).toBe(true);
  });

  it('expression-bodied method with => counts as operation', () => {
    const { model } = parseCSharp('class A { public int Twice(int x) => x * 2; public int F() { return 1; } }');
    expect(cls(model, 'A').operations.map((o) => o.name)).toEqual(['Twice', 'F']);
  });

  it('field initialiser that contains a call is not mistaken for a method', () => {
    const { model } = parseCSharp('class A { public int x = Compute(3); public Func<int> f = () => 1; }');
    expect(cls(model, 'A').attributes.map((a) => a.name)).toEqual(['x', 'f']);
    expect(cls(model, 'A').operations).toEqual([]);
  });

  it('comments and strings do not confuse the parser', () => {
    const { model } = parseCSharp('// class Fake {}\nclass Real { string s = "class Nope { }"; /* int hidden; */ }');
    expect(model.classes.map((c) => c.name)).toEqual(['Real']);
    expect(cls(model, 'Real').attributes.map((a) => a.name)).toEqual(['s']);
  });

  it('multiple type declarations with nested class removed from outer body', () => {
    const { model } = parseCSharp('class Outer { int a; class Inner { int b; } int c; }');
    expect(cls(model, 'Outer').attributes.map((a) => a.name)).toEqual(['a', 'c']);
    expect(cls(model, 'Inner').attributes.map((a) => a.name)).toEqual(['b']);
  });
});

describe('C# import: remaining branches', () => {
  it('enum members that are not plain identifiers are skipped', () => {
    const { model } = parseCSharp('enum E { A = 1, [Obsolete] B, C }');
    expect(cls(model, 'E').attributes.map((a) => a.name)).toEqual(['A', 'C']);
  });
  it('stray initializer chunk with no preceding property is ignored', () => {
    const { model } = parseCSharp('class C { = 5; int x; }');
    expect(cls(model, 'C').attributes.map((a) => a.name)).toEqual(['x']);
  });
  it('nested positional record (no block) is not a member of the outer type', () => {
    const { model } = parseCSharp('class C { record Inner(int a); int z; }');
    expect(cls(model, 'C').attributes.map((a) => a.name)).toEqual(['z']);
    expect(cls(model, 'C').operations).toEqual([]);
  });
  it('member starting with a paren is skipped', () => {
    const { model } = parseCSharp('class C { () {} int z; }');
    expect(cls(model, 'C').operations).toEqual([]);
    expect(cls(model, 'C').attributes.map((a) => a.name)).toEqual(['z']);
  });
  it('empty base name entries are ignored', () => {
    const { model } = parseCSharp('class A : B, <X> { }');
    expect(rel(model, 'A', 'B')).toBeDefined();
    expect(model.relations.filter((r) => r.from === 'A').length).toBe(1);
  });
  it('nullable and Lazy/Nullable wrappers inside collections keep 0..*', () => {
    const { model } = parseCSharp(`
class T1 {} class T2 {}
class H { List<T1?> a; List<Nullable<T2>> b; }`);
    expect(rel(model, 'H', 'T1', 'association')).toMatchObject({ toMult: '0..*' });
    expect(rel(model, 'H', 'T2', 'association')).toMatchObject({ toMult: '0..*' });
  });
});
