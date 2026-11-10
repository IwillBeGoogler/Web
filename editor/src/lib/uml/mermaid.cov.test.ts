import { describe, expect, it } from 'vitest';
import { parseMermaid, parseMermaidMember, renderMermaid, tildeToAngle } from './mermaid';
import { newClassDef, type UmlModel } from './model';

describe('tildeToAngle', () => {
  it('nested and unbalanced', () => {
    expect(tildeToAngle('List~int~')).toBe('List<int>');
    expect(tildeToAngle('Map~string, List~int~~')).toBe('Map<string, List<int>>');
    expect(tildeToAngle('~x')).toBe('>x');
    expect(tildeToAngle('plain')).toBe('plain');
  });
});

describe('parseMermaidMember', () => {
  it('literal (enum)', () => {
    expect(parseMermaidMember('  RED ', true)).toEqual({ kind: 'attribute', def: { visibility: '', name: 'RED' } });
  });
  it('attribute forms', () => {
    expect(parseMermaidMember('-id: int').def).toEqual({ visibility: '-', name: 'id', type: 'int' });
    expect(parseMermaidMember('+String name').def).toEqual({ visibility: '+', name: 'name', type: 'String' });
    expect(parseMermaidMember('plain').def).toEqual({ visibility: '+', name: 'plain' });
    expect(parseMermaidMember('#List~int~ count$').def).toEqual({ visibility: '#', name: 'count', type: 'List<int>', static: true });
    expect(parseMermaidMember('~count$').def).toEqual({ visibility: '~', name: 'count', static: true });
    expect(parseMermaidMember('x*').def).toMatchObject({ name: 'x' });
  });
  it('operations: params, return types, static/abstract suffix before or after', () => {
    const o = parseMermaidMember('+area(a: int, String b, c) double*').def;
    expect(o).toEqual({ visibility: '+', name: 'area', params: [{ name: 'a', type: 'int' }, { name: 'b', type: 'String' }, { name: 'c' }], type: 'double', abstract: true });
    expect(parseMermaidMember('+f() int$').def).toMatchObject({ static: true, type: 'int' });
    expect(parseMermaidMember('+f()$').def).toMatchObject({ static: true });
    expect(parseMermaidMember('+f()$*').def).toMatchObject({ static: true, abstract: true });
    expect(parseMermaidMember('+f() : int').def).toMatchObject({ type: 'int' });
    expect(parseMermaidMember('+f()*').def).toMatchObject({ abstract: true });
    expect(parseMermaidMember('f(List~int~ xs) Map~a,b~').def).toMatchObject({ params: [{ name: 'xs', type: 'List<int>' }], type: 'Map<a,b>' });
    expect(parseMermaidMember('+f()').def).not.toHaveProperty('type');
    expect(parseMermaidMember('+f(a: int').def.params).toEqual([{ name: 'a', type: 'int' }]);
    expect(parseMermaidMember('+f(g(x)) int').def.type).toBe('int');
  });
});

describe('parseMermaid', () => {
  it('warns without header and for empty input', () => {
    expect(parseMermaid('').warnings).toContain('Missing "classDiagram" header');
    expect(parseMermaid('class A').warnings).toContain('Missing "classDiagram" header');
    expect(parseMermaid('classDiagram-v2\nclass A').warnings).toEqual([]);
  });
  it('class blocks, stereotypes, enum literals, generics, label form, backticks', () => {
    const r = parseMermaid([
      '%% comment', 'classDiagram', 'direction RL', 'title x', 'accTitle: y',
      'class Shape~T~ {', '  <<abstract>>', '  +area() double*', '  -id: int', '}',
      'class Color {', '  <<enumeration>>', '  RED', '  GREEN', '}',
      'class Svc {', '  <<service>>', '}',
      'class `Q`["Quoted"]', 'class E ["Label"] {', '}',
      '<<interface>> Run', '<<custom>> Run2',
      'Color : +extra int', 'Shape : +go()',
      'note for Shape "hi"', 'namespace N {', '}', 'click Shape href "x"', 'style Shape fill:#f00',
    ].join('\n'));
    expect(r.warnings).toEqual([]);
    const by = (n: string) => r.model.classes.find((c) => c.name === n)!;
    expect(by('Shape')).toMatchObject({ kind: 'abstract', generics: 'T' });
    expect(by('Shape').operations.map((o) => o.name)).toEqual(['area', 'go']);
    expect(by('Color').kind).toBe('enum');
    expect(by('Color').attributes.map((a) => a.name)).toEqual(['RED', 'GREEN', '+extra int']);
    expect(by('Svc').stereotype).toBe('service');
    expect(by('Run').kind).toBe('interface');
    expect(by('Run2').stereotype).toBe('custom');
    expect(by('Q')).toBeDefined();
    expect(by('E')).toBeDefined();
  });
  it('generics via declare with nested tildes, odd names fall back to raw', () => {
    const r = parseMermaid('classDiagram\nclass Box~Map~k,v~~\nclass A-B');
    expect(r.model.classes.find((c) => c.name === 'Box')?.generics).toBe('Map<k,v>');
  });
  it('declaration name regex fails: raw name used', () => {
    const r = parseMermaid('classDiagram\nclass Weird-Name');
    expect(r.model.classes[0].name).toBe('Weird-Name');
  });
  it('relations create classes and strip generics/qualifiers', () => {
    const r = parseMermaid('classDiagram\nAnimal <|-- Dog\nDog "1" *-- "many" Leg : has\nx.Y ..> Z~T~');
    expect(r.model.classes.map((c) => c.name)).toEqual(['Dog', 'Animal', 'Leg', 'Y', 'Z']);
    expect(r.model.relations.map((x) => x.kind)).toEqual(['inheritance', 'composition', 'dependency']);
  });
  it('unparseable lines become warnings', () => {
    expect(parseMermaid('classDiagram\n???').warnings).toEqual(['Skipped: ???']);
  });
});

describe('renderMermaid', () => {
  const model: UmlModel = {
    classes: [
      newClassDef('Ext', { external: true }),
      newClassDef('ExtFull', { external: true, attributes: [{ visibility: '+', name: 'x' }] }),
      newClassDef('Empty'),
      newClassDef('Gen', { generics: 'List<int>', stereotype: 'svc', attributes: [{ visibility: '-', name: 'a', type: 'List<int>', static: true }, { visibility: '', name: 'bare' }], operations: [{ visibility: '+', name: 'f', params: [{ name: 'p', type: 'Map<a,b>' }, { name: 'q' }], type: 'Set<x>', static: true, abstract: true }, { visibility: '+', name: 'g' }] }),
      newClassDef('I', { kind: 'interface', operations: [{ visibility: '+', name: 'run' }] }),
      newClassDef('Ab', { kind: 'abstract', attributes: [{ visibility: '#', name: 'z' }] }),
      newClassDef('En', { kind: 'enum', attributes: [{ visibility: '', name: 'ONE' }] }),
    ],
    relations: [
      { from: 'I', to: 'Gen', kind: 'realization' },
      { from: 'I', to: 'Gen', kind: 'note' },
      { from: 'I', to: 'Nope', kind: 'dependency' },
      { from: 'Nope', to: 'I', kind: 'dependency' },
    ],
  };
  it('renders classes, stereotypes, members and only valid relations', () => {
    const out = renderMermaid(model);
    expect(out).not.toMatch(/class Ext\b/);
    expect(out).toContain('class ExtFull {');
    expect(out).toContain('  class Empty\n');
    expect(out).toContain('class Gen~List~int~~ {');
    expect(out).toContain('<<svc>>');
    expect(out).toContain('-List~int~ a$');
    expect(out).toContain('    bare\n');
    expect(out).toContain('+f(p: Map~a,b~, q) Set~x~$*');
    expect(out).toContain('+g()');
    expect(out).toContain('<<interface>>');
    expect(out).toContain('<<abstract>>');
    expect(out).toContain('<<enumeration>>');
    expect(out).toMatch(/\n    ONE\n/);
    expect((out.match(/\.\.\|>|<\|\.\./g) ?? []).length).toBe(1);
    expect(out).not.toContain('Nope');
  });
  it('round-trips through the parser', () => {
    const back = parseMermaid(renderMermaid(model));
    expect(back.warnings).toEqual([]);
    const g = back.model.classes.find((c) => c.name === 'Gen')!;
    expect(g.operations[0]).toMatchObject({ name: 'f', static: true, abstract: true });
    expect(back.model.classes.find((c) => c.name === 'En')!.kind).toBe('enum');
  });
});
