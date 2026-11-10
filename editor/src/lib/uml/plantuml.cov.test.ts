import { describe, expect, it } from 'vitest';
import { newClassDef, type UmlModel } from './model';
import { parsePlantMember, parsePlantUml, renderPlantUml } from './plantuml';

describe('parsePlantMember', () => {
  it('literal', () => expect(parsePlantMember(' RED ', true).def).toEqual({ visibility: '', name: 'RED' }));
  it('attributes', () => {
    expect(parsePlantMember('{static} -count : int').def).toEqual({ visibility: '-', name: 'count', type: 'int', static: true });
    expect(parsePlantMember('String name').def).toEqual({ visibility: '+', name: 'name', type: 'String' });
    expect(parsePlantMember('plain').def).toEqual({ visibility: '+', name: 'plain' });
    expect(parsePlantMember('{classifier} {field} #x').def).toMatchObject({ visibility: '#', name: 'x', static: true });
    expect(parsePlantMember('+-x').def).toMatchObject({ visibility: '+', name: '-x' });
  });
  it('operations', () => {
    expect(parsePlantMember('+{abstract} area() : double').def).toEqual({ visibility: '+', name: 'area', params: [], type: 'double', abstract: true });
    expect(parsePlantMember('{method} {static} find(id : String, String s, k) : T').def).toEqual({
      visibility: '+', name: 'find', params: [{ name: 'id', type: 'String' }, { name: 's', type: 'String' }, { name: 'k' }], type: 'T', static: true,
    });
    expect(parsePlantMember('List<int> get()').def).toMatchObject({ name: 'get', type: 'List<int>' });
    expect(parsePlantMember('run()').def).not.toHaveProperty('type');
    expect(parsePlantMember('f(a, (b)').def.params).toEqual([{ name: 'a' }, { name: '(b)' }]);
  });
});

describe('parsePlantUml', () => {
  it('parses declarations, packages, members, inheritance/realization, notes, ignored lines', () => {
    const r = parsePlantUml([
      '@startuml', "' comment", 'skinparam x', 'title T', 'hide empty members',
      'package "pkg.a" {', 'class A<T> <<svc>> extends Base implements I1, I2<X> {', '  -x : int', '  +f()', '  --', '  ..', '}', '}',
      'abstract class Base', 'interface I1', 'enum Color {', '  RED', '  GREEN', '}',
      'class Quoted2 <<only>>', 'annotation Ann', 'entity Ent', 'abstract Abs',
      'note left of A : hello', 'note top of A', 'still note', 'end note', 'A : +extra() : int', 'Color : BLUE',
      'namespace ns {', 'class Inner', '}', 'frame f <<x>> #red {', 'class InFrame', '}',
      'A --> Other', '@enduml',
    ].join('\n'));
    expect(r.warnings).toEqual([]);
    const by = (n: string) => r.model.classes.find((c) => c.name === n)!;
    expect(by('A')).toMatchObject({ generics: 'T', stereotype: 'svc', package: 'pkg.a' });
    expect(by('A').attributes.map((a) => a.name)).toEqual(['x']);
    expect(by('A').operations.map((o) => o.name)).toEqual(['f', 'extra']);
    expect(by('Base').kind).toBe('abstract');
    expect(by('Base').external).toBeUndefined();
    expect(by('I1').kind).toBe('interface');
    expect(by('I2')?.external).toBe(true);
    expect(by('Color').attributes.map((a) => a.name)).toEqual(['RED', 'GREEN', 'BLUE']);
    expect(by('Ann').kind).toBe('interface');
    expect(by('Ent').kind).toBe('class');
    expect(by('Abs').kind).toBe('abstract');
    expect(by('Inner').package).toBe('ns');
    expect(by('InFrame').package).toBe('f');
    expect(r.model.relations.filter((x) => x.kind === 'inheritance' || x.kind === 'realization').map((x) => `${x.from}>${x.to}:${x.kind}`)).toEqual(['A>Base:inheritance', 'A>I1:realization', 'A>I2:realization']);
  });
  it('re-declaring an existing/external class keeps it and clears external', () => {
    const r = parsePlantUml('class B extends A\nclass A\nclass A {\n  +x : int\n}');
    expect(r.model.classes.filter((c) => c.name === 'A')).toHaveLength(1);
    expect(r.model.classes.find((c) => c.name === 'A')!.external).toBeUndefined();
  });
  it('parent already declared is not stubbed again', () => {
    const r = parsePlantUml('class A\nclass B extends A');
    expect(r.model.classes.map((c) => c.name)).toEqual(['A', 'B']);
  });
  it('relation lines declare classes, strip quotes/generics', () => {
    const r = parsePlantUml('"Foo" <|-- "pkg.Bar"\nFoo "1" *-- "*" Baz : parts');
    expect(r.model.classes.map((c) => c.name)).toEqual(['Bar', 'Foo', 'Baz']);
    expect(r.model.relations).toHaveLength(2);
  });
  it('member lines outside a block, enum literal', () => {
    const r = parsePlantUml('enum E\nE : ONE\nQ : +f()');
    expect(r.model.classes.find((c) => c.name === 'E')!.attributes[0].name).toBe('ONE');
    expect(r.model.classes.find((c) => c.name === 'Q')!.operations[0].name).toBe('f');
  });
  it('stray closing brace and unparseable line', () => {
    const r = parsePlantUml('}\n???');
    expect(r.warnings).toEqual(['Skipped: ???']);
  });
  it('nested packages join with dots', () => {
    const r = parsePlantUml('package a {\npackage b {\nclass C\n}\n}');
    expect(r.model.classes[0].package).toBe('a.b');
  });
  it('class block in a package then braces pop correctly', () => {
    const r = parsePlantUml('package p {\nclass A {\n}\nclass B\n}\nclass C');
    expect(r.model.classes.map((c) => c.package)).toEqual(['p', 'p', undefined]);
  });
});

describe('renderPlantUml', () => {
  const model: UmlModel = {
    classes: [
      newClassDef('Ext', { external: true }),
      newClassDef('Empty', { package: 'p' }),
      newClassDef('G', { generics: 'T', stereotype: 'svc', package: 'p', attributes: [{ visibility: '-', name: 'a', type: 'int', static: true }, { visibility: '+', name: 'b' }], operations: [{ visibility: '+', name: 'f', params: [{ name: 'x', type: 'int' }, { name: 'y' }], type: 'void', static: true, abstract: true }, { visibility: '+', name: 'g' }] }),
      newClassDef('En', { kind: 'enum', attributes: [{ visibility: '', name: 'ONE' }] }),
      newClassDef('I', { kind: 'interface' }),
      newClassDef('Ab', { kind: 'abstract', attributes: [{ visibility: '#', name: 'z' }] }),
    ],
    relations: [{ from: 'I', to: 'G', kind: 'realization' }, { from: 'I', to: 'G', kind: 'note' }, { from: 'I', to: 'No', kind: 'dependency' }],
  };
  it('renders packages, kinds, members, valid relations', () => {
    const out = renderPlantUml(model);
    expect(out.startsWith('@startuml\n')).toBe(true);
    expect(out.endsWith('@enduml\n')).toBe(true);
    expect(out).not.toContain('Ext');
    expect(out).toContain('package p {\n  class Empty\n  class G<T> <<svc>> {');
    expect(out).toContain('    {static} -a : int');
    expect(out).toContain('    +b\n');
    expect(out).toContain('{static} +{abstract} f(x : int, y) : void');
    expect(out).toContain('    +g()');
    expect(out).toContain('enum En {\n  ONE\n}');
    expect(out).toContain('abstract class Ab {');
    expect(out).toContain('interface I\n');
    expect(out).not.toContain('No');
  });
  it('round-trips', () => {
    const back = parsePlantUml(renderPlantUml(model));
    expect(back.warnings).toEqual([]);
    const g = back.model.classes.find((c) => c.name === 'G')!;
    expect(g).toMatchObject({ generics: 'T', stereotype: 'svc', package: 'p' });
    expect(g.operations[0]).toMatchObject({ name: 'f', static: true });
  });
});
