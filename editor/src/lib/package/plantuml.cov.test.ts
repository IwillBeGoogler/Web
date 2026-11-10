import { describe, expect, it } from 'vitest';
import { looksLikePackagePlantuml, parsePackagePlantuml, renderPackagePlantuml } from './plantuml';
import type { PackageModel } from './types';

describe('renderPackagePlantuml', () => {
  it('nested blocks, class keys, link forms, dangling skipped', () => {
    const model: PackageModel = {
      packages: [{ id: 'o', name: 'O"ut\ner' }, { id: 'i', name: 'In', parent: 'o' }, { id: 'l', name: 'L', parent: 'ghost' }],
      classes: [
        { id: 'a', name: 'A', kind: 'class', parent: 'i' }, { id: 'b', name: 'B', kind: 'interface' },
        { id: 'c', name: 'C', kind: 'abstract' }, { id: 'd', name: 'D', kind: 'enum', parent: 'o' },
      ],
      links: [
        { from: 'a', to: 'b', kind: 'dependency' }, { from: 'a', to: 'b', kind: 'dependency', label: 'u"s' },
        { from: 'o', to: 'l', kind: 'import' }, { from: 'o', to: 'l', kind: 'merge', label: 'x' }, { from: 'o', to: 'zz', kind: 'access' },
      ],
    };
    const t = renderPackagePlantuml(model);
    expect(t).toContain(`package "O'ut er" as P1 {\n  package "In" as P2 {\n    class "A" as C1\n  }\n  enum "D" as C4\n}`);
    expect(t).toContain('interface "B" as C2');
    expect(t).toContain('abstract class "C" as C3');
    expect(t).toContain('package "L" as P3 {\n}');
    expect(t).toContain('C1 ..> C2\n');
    expect(t).toContain("C1 ..> C2 : u's");
    expect(t).toContain('P1 ..> P3 : <<import>>\n');
    expect(t).toContain('P1 ..> P3 : <<merge>> x');
    expect(t).not.toContain('zz');
  });
});

describe('looksLikePackagePlantuml', () => {
  it('rules', () => {
    expect(looksLikePackagePlantuml('package a')).toBe(false);
    expect(looksLikePackagePlantuml('@startuml\nclass a\n@enduml')).toBe(false);
    expect(looksLikePackagePlantuml('@startuml\npackage a {\n}\n@enduml')).toBe(true);
    expect(looksLikePackagePlantuml('@startuml\npackage a {\nobject o\n}\n@enduml')).toBe(false);
    expect(looksLikePackagePlantuml('@startuml\npackage a\n(use)\n@enduml')).toBe(false);
    expect(looksLikePackagePlantuml('@startuml\npackage a\n[c]\n@enduml')).toBe(false);
    expect(looksLikePackagePlantuml('@startuml\npackage a {\nclass c\n}\na ..> b : <<import>>\n@enduml')).toBe(true);
    expect(looksLikePackagePlantuml('@startuml\npackage a {\nclass c\n}\n@enduml')).toBe(false);
    expect(looksLikePackagePlantuml('@startuml\npackage a {\nclass c\n}\na ..> b : «merge»\n@enduml')).toBe(true);
  });
});

describe('parsePackagePlantuml', () => {
  it('nesting, class bodies, notes, skipped lines', () => {
    const { model, warnings } = parsePackagePlantuml([
      '@startuml', "/' c\nc '/", "' x", 'skinparam s', 'title t',
      'note left of A : hi', 'note over A', 'multi line', 'end note', 'floating note x', 'end note',
      'package "Outer Pkg" as O {', '  package Inner {', '    class Foo {', '      +bar() {', '      }', '      x', '    }', '    interface "IBar" as IB', '  }', '  abstract class Abs', '  enum E', '}',
      'namespace NS {', '}', 'class Top<T>', 'abstract Ab2', '}', 'junk !!', '@enduml',
    ].join('\n'));
    const name = (id?: string) => model.packages.find((p) => p.id === id)?.name;
    expect(model.packages.map((p) => [p.name, name(p.parent)])).toEqual([['Outer Pkg', undefined], ['Inner', 'Outer Pkg'], ['NS', undefined]]);
    expect(model.classes.map((c) => [c.name, c.kind, name(c.parent)])).toEqual([
      ['Foo', 'class', 'Inner'], ['IBar', 'interface', 'Inner'], ['Abs', 'abstract', 'Outer Pkg'], ['E', 'enum', 'Outer Pkg'], ['Top<T>', 'class', undefined], ['Ab2', 'abstract', undefined],
    ]);
    expect(warnings).toEqual(['Skipped: junk !!']);
  });
  it('redeclaring reuses ids', () => {
    const { model } = parsePackagePlantuml('package A\npackage A\nclass C\nclass C');
    expect(model.packages).toHaveLength(1);
    expect(model.classes).toHaveLength(1);
  });
  it('links: direction, tags, unknown elements, aliases', () => {
    const { model, warnings } = parsePackagePlantuml([
      'package "P One" as p1', 'package p2', 'class C1', 'class "C 2" as c2',
      'p1 ..> p2 : <<import>> txt', 'p2 <.. p1', 'p1 ..> p2 : «access»', 'p1 ..> p2 : <<merge>>   ', 'C1 ..> c2 : uses', 'C1 -> "C 2"', 'p1 ..> "P One" : plain', 'p1 ..> nowhere',
    ].join('\n'));
    const nm = (id: string) => [...model.packages, ...model.classes].find((x) => x.id === id)!.name;
    expect(model.links.map((l) => `${nm(l.from)}>${nm(l.to)}:${l.kind}:${l.label ?? ''}`)).toEqual([
      'P One>p2:import:txt', 'P One>p2:dependency:', 'P One>p2:access:', 'P One>p2:merge:', 'C1>C 2:dependency:uses', 'C1>C 2:dependency:', 'P One>P One:dependency:plain',
    ]);
    expect(warnings).toEqual(['Skipped link to an unknown element: p1 ..> nowhere']);
  });
});
