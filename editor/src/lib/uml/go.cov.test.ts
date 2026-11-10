import { describe, expect, it } from 'vitest';
import { parseGo } from './go';
import type { UmlModel } from './model';

const cls = (m: UmlModel, n: string) => m.classes.find((c) => c.name === n)!;
const rel = (m: UmlModel, from: string, to: string, kind?: string) => m.relations.find((r) => r.from === from && r.to === to && (!kind || r.kind === kind));

describe('go cov', () => {
  it('empty source and no package', () => {
    const { model } = parseGo('');
    expect(model.classes).toEqual([]);
    const r = parseGo('type A struct { x int }').model;
    expect(cls(r, 'A').package).toBeUndefined();
  });

  it('struct fields: embedded, generic embedded, grouped, tags, anonymous, unparsable', () => {
    const { model } = parseGo(`
package p
type Base struct{}
type Gen[T any] struct{ V T }
type S struct {
  Base
  *Other
  Gen[int]
  pkg.Ext
  S
  A, b int \`json:"a"\`
  inner struct { x int }
  fn func(int) error
  ;
  !!!
  Name string; Age int
}`);
    const s = cls(model, 'S');
    expect(s.attributes.map((a) => `${a.visibility}${a.name}:${a.type}`)).toEqual(['+A:int', '-b:int', '-fn:func(int) error', '+Name:string', '+Age:int']);
    expect(rel(model, 'S', 'Base', 'inheritance')).toMatchObject({ label: 'embeds' });
    expect(rel(model, 'S', 'Other', 'inheritance')).toBeDefined();
    expect(cls(model, 'Other').external).toBe(true);
    expect(rel(model, 'S', 'Gen', 'inheritance')).toBeDefined();
    expect(rel(model, 'S', 'Ext', 'inheritance')).toBeDefined();
    expect(rel(model, 'S', 'S')).toBeUndefined();
    expect(cls(model, 'Gen').generics).toBe('T any');
  });

  it('interfaces: embedded, constraints, methods, bad lines, unexported, return types', () => {
    const { model } = parseGo(`
package p
type Reader interface{ Read(p []byte) (n int, err error) }
type RW interface {
  Reader
  io.Closer
  Pkg[T]
  ~int | ~string
  Write(b []byte) (int, error)
  close()
  Get(a, b int, c ...string) string
  (weird)
  not a method
  a.b()
}`);
    const rw = cls(model, 'RW');
    expect(rw.kind).toBe('interface');
    expect(rw.operations.map((o) => o.name)).toEqual(['Write', 'close', 'Get']);
    expect(rw.operations[0]).toMatchObject({ type: '(int, error)', abstract: true, visibility: '+' });
    expect(rw.operations[1]).toMatchObject({ visibility: '-', params: [] });
    expect(rw.operations[1].type).toBeUndefined();
    expect(rw.operations[2].params).toEqual([{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }, { name: 'c', type: '...string' }]);
    expect(rel(model, 'RW', 'Reader', 'inheritance')).toBeDefined();
    expect(rel(model, 'RW', 'Closer', 'inheritance')).toBeDefined();
    expect(rel(model, 'RW', 'Pkg', 'inheritance')).toBeDefined();
    expect(cls(model, 'Reader').operations[0].params).toEqual([{ name: 'p', type: '[]byte' }]);
  });

  it('type ( ... ) groups with structs/interfaces', () => {
    const { model } = parseGo(`
package p
type (
  A struct { x int }
  B[T any] interface { F() }
  C struct {}
)`);
    expect(cls(model, 'A').kind).toBe('class');
    expect(cls(model, 'B')).toMatchObject({ kind: 'interface', generics: 'T any' });
    expect(cls(model, 'C')).toBeDefined();
  });

  it('named types, aliases, generics, enums via const blocks and single consts', () => {
    const { model } = parseGo(`
package p
type Money int64
type Alias = string
type List[T any] []T
type Handler func(w int) error
type Color int
type Mode string
type Level int
type Unused int
type S struct{}
const (
  Red Color = iota
  Green
  Blue
  _
)
const (
  A Mode = "a"
  B = 2
  C
  Other int = 3
)
const Single Level = 1
const Plain = 3
const bad int = 1
`);
    expect(cls(model, 'Money').stereotype).toBe('int64');
    expect(cls(model, 'Alias').stereotype).toBe('string');
    expect(cls(model, 'List')).toMatchObject({ generics: 'T any', stereotype: '[]T' });
    expect(cls(model, 'Handler').stereotype).toBe('func(w int) error');
    expect(cls(model, 'Color')).toMatchObject({ kind: 'enum' });
    expect(cls(model, 'Color').attributes.map((a) => a.name)).toEqual(['Red', 'Green', 'Blue']);
    expect(cls(model, 'Color').stereotype).toBeUndefined();
    expect(cls(model, 'Mode').attributes.map((a) => a.name)).toEqual(['A']);
    expect(cls(model, 'Level')).toMatchObject({ kind: 'enum' });
    expect(cls(model, 'Level').attributes.map((a) => a.name)).toEqual(['Single']);
    expect(cls(model, 'Unused').kind).toBe('class');
    expect(cls(model, 'Unused').stereotype).toBe('int');
  });

  it('long stereotypes are truncated', () => {
    const { model } = parseGo('type X map[string]map[string]map[string]map[string]int');
    expect(cls(model, 'X').stereotype!.length).toBe(24);
  });

  it('methods: receivers, generics, returns, no-name receiver, undeclared receiver', () => {
    const { model } = parseGo(`
package p
type T struct{}
func (t *T) Run(a int) {}
func (T) Plain() int { return 1 }
func (t T) Multi() (int, error) { return 0, nil }
func (t *T) private(x, y string) string
func (s *Stack[E]) Push(e E) { }
func (u User) Name() string { return "" }
func (t T) Gen[K any](k K) {}
func (t T) NoRet()
func regular(a int) {}
func (T) Tail() int`);
    const t = cls(model, 'T');
    // bodyless method swallows the next line as its return type (current behavior)
    expect(t.operations.map((o) => `${o.visibility}${o.name}:${o.type ?? ''}`)).toEqual(['+Run:', '+Plain:int', '+Multi:(int, error)', '-private:string', '+Gen:', '+NoRet:func regular(a int)', '+Tail:int']);
    expect(t.operations[3].params).toEqual([{ name: 'x', type: 'string' }, { name: 'y', type: 'string' }]);
    expect(cls(model, 'Stack').operations[0].name).toBe('Push');
    expect(cls(model, 'User').operations[0].type).toBe('string');
    expect(cls(model, 'Stack').package).toBe('p');
  });

  it('associations: pointer, slice, map, chan/func skipped, qualified, undeclared, self', () => {
    const { model } = parseGo(`
package p
type A struct{}
type B struct{}
type C struct{}
type D struct{}
type E struct{}
type F struct{}
type Holder struct {
  one A
  ptr *B
  many []C
  ptrs []*D
  m map[string]E
  mp map[string]*F
  ch chan A
  fn func() A
  ifc interface{}
  st struct{}
  gen Box[A]
  self *Holder
  ext other.A
  arr [3]B
  bad []
}`);
    const r = model.relations.filter((x) => x.kind === 'association').map((x) => `${x.toRole}:${x.to}:${x.toMult}`);
    expect(r).toEqual(expect.arrayContaining(['one:A:1', 'ptr:B:0..1', 'many:C:0..*', 'ptrs:D:0..*', 'm:E:0..*', 'mp:F:0..*']));
    expect(r.some((x) => x.startsWith('ch:') || x.startsWith('fn:') || x.startsWith('self:') || x.startsWith('ifc:'))).toBe(false);
  });
});

describe('go cov: odd layouts', () => {
  it('struct keyword with brace on next line is still a struct', () => {
    const { model } = parseGo('type X struct\n{ a int }');
    expect(cls(model, 'X').kind).toBe('class');
    expect(cls(model, 'X').stereotype).toBeUndefined();
    expect(cls(model, 'X').attributes.map((a) => a.name)).toEqual(['a']);
  });
  it('multi-name const specs do not break enum detection', () => {
    const { model } = parseGo('type Color int\nconst (\n  A, B Color = 1, 2\n  C Color = iota\n)');
    expect(cls(model, 'Color').attributes.map((a) => a.name)).toEqual(['C']);
  });
});

describe('go cov: unnamed params', () => {
  it('interface method with type-only params', () => {
    const { model } = parseGo('type I interface {\n  F(int, string) error\n}');
    expect(cls(model, 'I').operations[0].params).toEqual([{ name: 'int' }, { name: 'string' }]);
  });
});
