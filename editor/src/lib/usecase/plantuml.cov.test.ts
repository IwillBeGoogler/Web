import { describe, expect, it } from 'vitest';
import { looksLikeUseCasePlantuml, parseUseCasePlantuml, renderUseCasePlantuml } from './plantuml';

describe('renderUseCasePlantuml', () => {
  it('renders every kind and fallbacks', () => {
    const out = renderUseCasePlantuml({
      actors: [{ id: 'a', name: 'A "q"\nz' }],
      boundaries: [{ id: 'b', name: 'Sys' }],
      cases: [
        { id: 'c1', name: 'One', boundary: 'b', extensionPoints: ['x', 'y'] },
        { id: 'c2', name: 'Two' },
        { id: 'c3', name: 'Three', boundary: 'ghost' },
      ],
      relations: [
        { from: 'a', to: 'c1', kind: 'association', fromMult: '1', toMult: '*', label: 'uses' },
        { from: 'a', to: 'c2', kind: 'association' },
        { from: 'c1', to: 'c2', kind: 'include' },
        { from: 'c2', to: 'c1', kind: 'extend' },
        { from: 'c1', to: 'c3', kind: 'generalization', label: 'g' },
        { from: 'c1', to: 'c3', kind: 'generalization' },
        { from: 'nope', to: 'c3', kind: 'association' },
      ],
    });
    expect(out).toContain('actor "A \'q\' z" as A1');
    expect(out).toContain('rectangle "Sys" {');
    expect(out).toContain('  usecase "One\\n--\\nextension points: x, y" as U1');
    expect(out).toContain('usecase "Two" as U2');
    expect(out).toContain('A1 "1" -- "*" U1 : uses');
    expect(out).toContain('A1 -- U2\n');
    expect(out).toContain('U1 .> U2 : <<include>>');
    expect(out).toContain('U2 .> U1 : <<extend>>');
    expect(out).toContain('U1 --|> U3 : g');
    expect(out).toContain('U1 --|> U3\n');
    expect(out).not.toContain('nope');
  });
});

describe('looksLikeUseCasePlantuml', () => {
  it('detects', () => {
    expect(looksLikeUseCasePlantuml('x')).toBe(false);
    expect(looksLikeUseCasePlantuml('@startuml\nparticipant A\nusecase U')).toBe(false);
    expect(looksLikeUseCasePlantuml('@startuml\nusecase U')).toBe(true);
    expect(looksLikeUseCasePlantuml('@startuml\nA --> (Foo)')).toBe(true);
    expect(looksLikeUseCasePlantuml('@startuml\nA --> B')).toBe(false);
  });
});

describe('parseUseCasePlantuml', () => {
  it('parses declarations, blocks, links', () => {
    const src = `@startuml
/' block
comment '/
' line comment
left to right direction
skinparam x y
title T
note left of A : hi
note right
 multi
end note
floating note : x
actor Customer
actor/ "Big Admin" as BA
actor Pay as "Payer"
:Visitor: as V
:Solo:
usecase Browse
usecase "Check out" as CO
usecase/ UC3 as "Third"
usecase (Paren) as P
usecase X as Y
(Anon) as AN
(Anon2)
rectangle "Shop" {
  usecase "In shop\\n--\\nextension points: a, b\\nignored" as IS
  node Inner {
    usecase Deep
  }
  package Pk {
    usecase "Pk case"
  }
  weird {
    usecase InWeird
  }
}
rectangle Shop2 as s2 {
  usecase Q
}
Customer --> Browse
Customer "1" -- "0..*" CO : buys
CO .> Browse : <<include>>
Browse ..> CO : extend
Browse <|-- CO
CO --|> Browse : gen
Browse <-- Customer : back
(Anon) --> (Anon2)
:Visitor: -- (New)
"Big Admin" --> Customer
Customer .. Browse
Customer -[#red]- Browse
Customer -up- Browse
Undeclared --> Browse
this is garbage
@enduml`;
    const { model, warnings } = parseUseCasePlantuml(src);
    expect(model.actors.map((a) => a.name)).toEqual(expect.arrayContaining(['Customer', 'Big Admin', 'Payer', 'Visitor', 'Solo', 'Undeclared']));
    expect(model.cases.map((c) => c.name)).toEqual(expect.arrayContaining(['Browse', 'Check out', 'Third', 'Paren', 'Anon', 'Anon2', 'In shop', 'Deep', 'Pk case', 'InWeird', 'Q', 'New']));
    expect(model.boundaries.map((b) => b.name)).toEqual(['Shop', 'Inner', 'Pk', 'Shop2']);
    const isCase = model.cases.find((c) => c.name === 'In shop')!;
    expect(isCase.extensionPoints).toEqual(['a', 'b']);
    expect(isCase.boundary).toBe('s1');
    expect(model.cases.find((c) => c.name === 'InWeird')?.boundary).toBe('s1');
    const names = new Map([...model.actors, ...model.cases].map((x) => [x.id, x.name]));
    const rels = model.relations.map((r) => ({ ...r, from: names.get(r.from), to: names.get(r.to) }));
    expect(rels[1]).toMatchObject({ from: 'Customer', to: 'Check out', fromMult: '1', toMult: '0..*', label: 'buys', kind: 'association' });
    expect(rels[2]).toMatchObject({ kind: 'include', from: 'Check out', to: 'Browse' });
    expect(rels[3].kind).toBe('extend');
    expect(rels[4]).toMatchObject({ kind: 'generalization', from: 'Check out', to: 'Browse' });
    expect(rels[5]).toMatchObject({ kind: 'generalization', label: 'gen' });
    expect(rels[6]).toMatchObject({ kind: 'association', from: 'Customer', to: 'Browse' });
    expect(warnings).toContain('Skipped: this is garbage');
    expect(warnings.some((w) => w.startsWith('Dotted link'))).toBe(true);
  });

  it('re-adding existing case inside a boundary assigns boundary; repeated actor reused', () => {
    const { model } = parseUseCasePlantuml('usecase A\nactor X\nactor X\nrectangle R {\n(A)\nX --> (A)\n}\n');
    expect(model.cases[0].boundary).toBe('s1');
    expect(model.actors).toHaveLength(1);
  });

  it('declaration fallbacks', () => {
    const { model } = parseUseCasePlantuml('actor "Quoted"\nactor !!!\nusecase ???\nactor Bare as B2\n');
    expect(model.actors.map((a) => a.name)).toEqual(['Quoted', 'Bare']);
  });
});
