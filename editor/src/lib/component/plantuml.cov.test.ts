import { describe, expect, it } from 'vitest';
import { looksLikeComponentPlantuml, parseComponentPlantuml, renderComponentPlantuml } from './plantuml';
import type { ComponentModel } from './types';

describe('renderComponentPlantuml', () => {
  it('renders nesting, stereotypes, bare kinds, interfaces, links and quotes', () => {
    const model: ComponentModel = {
      comps: [
        { id: 'a', name: 'Say "hi"\nnow', kind: 'node', stereotype: 'st"x', provides: [], requires: [] },
        { id: 'b', name: 'Inner', kind: 'component', parent: 'a', provides: ['IP'], requires: ['IR'] },
        { id: 'c', name: 'Leaf', kind: 'component', provides: [], requires: [] },
        { id: 'd', name: 'Orphan', kind: 'artifact', parent: 'ghost', provides: [], requires: [] },
        { id: 'e', name: 'Holder', kind: 'component', provides: [], requires: [] },
        { id: 'f', name: 'Held', kind: 'component', parent: 'e', provides: [], requires: [] },
      ],
      links: [
        { from: 'b', to: 'c', kind: 'assembly', label: 'x "y"' },
        { from: 'c', to: 'b', kind: 'dependency' },
        { from: 'c', to: 'nope', kind: 'dependency' },
      ],
    };
    const out = renderComponentPlantuml(model);
    expect(out).toContain("node \"Say 'hi' now\" as C1 <<st'x>> {");
    expect(out).toContain('  [Inner] as C2');
    expect(out).toContain('[Leaf] as C3');
    expect(out).toContain('artifact "Orphan" as C4');
    expect(out).toContain('component "Holder" as C5 {');
    expect(out).toContain('interface "IP" as I1');
    expect(out).toContain('C2 - I1');
    expect(out).toContain('C2 ..> I2');
    expect(out).toContain("C2 -- C3 : x 'y'");
    expect(out).toContain('C3 ..> C2\n');
    expect(out).not.toContain('nope');
    expect(out.startsWith('@startuml\n')).toBe(true);
    expect(out.endsWith('@enduml\n')).toBe(true);
  });
});

describe('looksLikeComponentPlantuml', () => {
  it('accepts component syntax, rejects other diagram kinds', () => {
    expect(looksLikeComponentPlantuml('@startuml\ncomponent A\n@enduml')).toBe(true);
    expect(looksLikeComponentPlantuml('@startuml\n[A]\n@enduml')).toBe(true);
    expect(looksLikeComponentPlantuml('@startuml\n[A] --> B\n@enduml')).toBe(true);
    expect(looksLikeComponentPlantuml('@startuml\nclass A\ncomponent B\n@enduml')).toBe(false);
    expect(looksLikeComponentPlantuml('@startuml\n(use) --> x\n[A]\n@enduml')).toBe(false);
    expect(looksLikeComponentPlantuml('component A')).toBe(false);
    expect(looksLikeComponentPlantuml('@startuml\nfoo\n@enduml')).toBe(false);
  });
});

describe('parseComponentPlantuml', () => {
  it('parses blocks, nesting, aliases, stereotypes, and existing re-declaration', () => {
    const { model, warnings } = parseComponentPlantuml(`@startuml
title T
skinparam x y
/' block
comment '/
' line comment
node "DC" as dc <<cloud>> {
  component [Web] as web
  [Api] as api <<svc>> {
  }
  artifact jar
}
component Web
note left of web : hi
note top
 multi
end note
floating note right : fl
}
@enduml`);
    expect(model.comps.map((c) => [c.name, c.kind, c.parent, c.stereotype])).toEqual([
      ['DC', 'node', undefined, 'cloud'],
      ['Web', 'component', 'c1', undefined],
      ['Api', 'component', 'c1', 'svc'],
      ['jar', 'artifact', 'c1', undefined],
    ]);
    expect(warnings).toEqual([]);
  });
  it('re-declaring nested into a parent adopts parent', () => {
    const { model } = parseComponentPlantuml(`component X\nnode N {\n component X\n}`);
    expect(model.comps.find((c) => c.name === 'X')!.parent).toBe(model.comps.find((c) => c.name === 'N')!.id);
    expect(model.comps).toHaveLength(2);
  });
  it('maps cloud/database etc to node', () => {
    const { model } = parseComponentPlantuml(`database "DB"\nstorage S`);
    expect(model.comps.map((c) => c.kind)).toEqual(['node', 'node']);
  });
  it('lollipop, socket and dependency links', () => {
    const { model, warnings } = parseComponentPlantuml(`
component A
component B
component C
component D
component E
component F
component G
component H
component I
component J
component K
component L
component M
interface "IOrders" as io
interface "Pay" as pay
interface Q2 as "Quoted"
() Plain
[A] - io
[B] ..> io
[C] -( pay
pay )- [D]
[E] -0)- Plain
Plain - [F]
[A] --> [B] : uses
[G] -- [H]
[I] <-- [J]
[K] ..> Zed
Unknown1 -- Unknown2
[L] - () "Inline"
Foo - [M]
[M] - Bar
portin p1
this is junk
`);
    const by = (n: string) => model.comps.find((c) => c.name === n)!;
    expect(by('A').provides).toEqual(['IOrders']);
    expect(by('B').requires).toEqual(['IOrders']);
    expect(by('C').requires).toEqual(['Pay']);
    expect(by('D').requires).toEqual(['Pay']);
    expect(by('E').requires).toEqual(['Plain']);
    expect(by('F').provides).toEqual(['Plain']);
    expect(by('L').provides).toEqual(['Inline']);
    expect(by('M').provides).toEqual(['Foo', 'Bar']);
    const a = by('A'), b = by('B');
    expect(model.links).toContainEqual({ from: a.id, to: b.id, kind: 'dependency', label: 'uses' });
    const g = by('G'), h = by('H');
    expect(model.links).toContainEqual({ from: g.id, to: h.id, kind: 'assembly' });
    // reversed arrow: J is source
    expect(model.links).toContainEqual({ from: by('J').id, to: by('I').id, kind: 'assembly' });
    expect(model.links).toContainEqual({ from: by('K').id, to: by('Zed').id, kind: 'dependency' });
    expect(by('Unknown1')).toBeTruthy();
    expect(warnings).toContain('Ports are not imported: portin p1');
    expect(warnings).toContain('Skipped: this is junk');
  });
  it('duplicate interface refs not repeated; interface-only link warns', () => {
    const { model, warnings } = parseComponentPlantuml(`interface I1\ninterface I2\ncomponent A\nA - I1\nA - I1\nI1 - I2`);
    expect(model.comps[0].provides).toEqual(['I1']);
    expect(warnings.some((w) => w.startsWith('Interface link without a component'))).toBe(true);
  });
  it('dotted quoted component refs resolve', () => {
    const { model } = parseComponentPlantuml(`component "A b"\ncomponent C\n"A b" --> [C]`);
    expect(model.links).toHaveLength(1);
    expect(model.comps).toHaveLength(2);
  });
});
