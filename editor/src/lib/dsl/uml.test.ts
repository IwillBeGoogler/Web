import { describe, expect, it } from 'vitest';
import { applyDsl, parseDsl, printPage } from '@core/dsl';
import type { CPage } from '@core/types';
import { completeAt } from './language';

const roundTrip = (body: string) => {
  const text = `#!sdd 1\ndiagram "T"\n${body}`;
  const r = applyDsl(undefined, text, { layout: false });
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const printed = printPage(r.page, 'T');
  const again = applyDsl(structuredClone(r.page), printed, { layout: false });
  expect(again.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(again.page).toEqual(r.page); // stable: applying the printed text changes nothing
  expect(printPage(again.page, 'T')).toBe(printed);
  return { page: r.page, printed };
};

const CLASSES = `
classes {
  package shop "Shop" {
    abstract class Animal<T, K extends Key> "entity" {
      - static count: int = 0
      # name: string
      + abstract speak(loud: bool, times): void
    }
    interface Pet {
      + play(): void
    }
    enum Color {
      RED
      GREEN
    }
  }
  class Dog {
    + breed: string
  }
  Dog --|> Animal
  Dog ..|> Pet
  Dog --o Pet "walks" srcMult=1 dstMult=0..* srcRole=owner dstRole=pets
  Dog --> Color
  Dog ..> Animal
  Animal --* Pet
}
`;
const STATES = `
states {
  initial start
  state idle "Idle" activity="entry / start timer"
  state active "Active" {
    state a1 "A1"
    region
    state a2 "A2"
    history h
  }
  choice c
  fork f vertical
  join j
  final end
  start -> idle
  idle -> active "go [ok] / run"
  active -> c
  c -> end "done"
}
`;
const USECASES = `
usecases {
  actor customer "Customer"
  boundary shop "Shop" {
    usecase checkout "Checkout" {
      point "Pay by card"
    }
    usecase pay "Pay"
    usecase cancel "Cancel"
  }
  customer -- checkout srcMult=1 dstMult=*
  checkout include pay
  cancel extend checkout "if unpaid"
  customer generalizes customer2
  actor customer2 "VIP"
}
`;
const COMPONENTS = `
components {
  node server "Server" {
    component api "API" stereotype=service {
      provides IOrders
      requires IPay
    }
    component pay "Pay" {
      provides IPay
    }
  }
  artifact jar "app.jar"
  api ..> jar "deploys"
  jar -- api
}
`;

describe('.sdd UML text: round trip', () => {
  it('classes', () => {
    const { page, printed } = roundTrip(CLASSES);
    const animal = page.nodes.find((n) => n.data.label === 'Animal')!;
    expect(animal.data).toMatchObject({ kind: 'abstract', generics: 'T, K extends Key', stereotype: 'entity', package: 'Shop' });
    expect(animal.data.attributes[0]).toMatchObject({ visibility: '-', static: true, name: 'count', type: 'int', default: '0' });
    expect(animal.data.operations[0]).toMatchObject({ abstract: true, name: 'speak', params: [{ name: 'loud', type: 'bool' }, { name: 'times' }] });
    expect(page.nodes.find((n) => n.id === 'shop')).toMatchObject({ type: 'group', data: { variant: 'package' } });
    expect(animal.parentId).toBe('shop');
    const kinds = page.edges.map((e) => e.data!.uml.kind);
    expect(kinds).toEqual(['inheritance', 'realization', 'aggregation', 'association', 'dependency', 'composition']);
    expect(page.edges[2].data!.uml).toMatchObject({ sourceMult: '1', targetMult: '0..*', sourceRole: 'owner', targetRole: 'pets' });
    expect(page.edges[3].data!.uml.directed).toBe(true);
    expect(printed).toContain('Dog --o Pet "walks" srcMult=1 dstMult=0..* srcRole=owner dstRole=pets');
  });
  it('class header sugar: extends / implements', () => {
    const r = parseDsl('classes {\n class A extends B implements C, D {\n }\n class B\n class C\n class D\n}\n');
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.classRels.map((x) => `${x.from}${x.kind}${x.to}`)).toEqual(['Ainheritance' + 'B', 'Arealization' + 'C', 'Arealization' + 'D']);
  });
  it('states', () => {
    const { page } = roundTrip(STATES);
    const comp = page.nodes.find((n) => n.id === 'active')!;
    expect(comp).toMatchObject({ type: 'group', data: { variant: 'composite' } });
    expect(page.nodes.find((n) => n.id === 'a1')).toMatchObject({ parentId: 'active' });
    expect(page.nodes.find((n) => n.id === 'a2')!.data.region).toBe(1);
    expect(page.nodes.find((n) => n.id === 'a1')!.data.region).toBeUndefined();
    expect(page.nodes.find((n) => n.id === 'f')!.data).toMatchObject({ stateKind: 'fork', vertical: true });
    expect(page.nodes.find((n) => n.id === 'idle')!.data.activity).toBe('entry / start timer');
    expect(page.edges.find((e) => e.target === 'active')).toMatchObject({ label: 'go [ok] / run' });
  });
  it('entry / exit points', () => {
    const { page } = roundTrip('states {\n  state c "C" {\n    state a\n    region\n    entryPoint ep\n    exitPoint xp "Out"\n  }\n  ep -> a\n}\n');
    expect(page.nodes.find((n) => n.id === 'ep')).toMatchObject({ parentId: 'c', data: { stateKind: 'entryPoint' } });
    expect(page.nodes.find((n) => n.id === 'ep')!.data.region).toBeUndefined();
    expect(page.nodes.find((n) => n.id === 'xp')!.data).toMatchObject({ stateKind: 'exitPoint', label: 'Out' });
  });
  it('use cases', () => {
    const { page } = roundTrip(USECASES);
    expect(page.nodes.find((n) => n.id === 'checkout')).toMatchObject({ parentId: 'shop', data: { ucKind: 'usecase', extensionPoints: ['Pay by card'] } });
    expect(page.nodes.find((n) => n.id === 'shop')!.data.variant).toBe('boundary');
    const inc = page.edges.find((e) => e.data!.uml.kind === 'include')!;
    expect(inc.label).toBe('«include»');
    expect(page.edges.find((e) => e.data!.uml.kind === 'extend')!.label).toBe('if unpaid');
  });
  it('components', () => {
    const { page, printed } = roundTrip(COMPONENTS);
    const api = page.nodes.find((n) => n.id === 'api')!;
    expect(api).toMatchObject({ parentId: 'server', data: { stereotype: 'service', compKind: 'component' } });
    expect(api.data.ports.map((p: any) => `${p.kind}:${p.name}`)).toEqual(['provided:IOrders', 'required:IPay']);
    expect(page.nodes.find((n) => n.id === 'server')!.data.container).toBe(true);
    // the assembly implied by requires IPay / provides IPay is an edge with ports but not printed
    const implied = page.edges.filter((e) => e.data!.uml.kind === 'assembly' && e.data!.uml.sourcePort);
    expect(implied).toHaveLength(1);
    expect(printed.match(/ -- /g)).toHaveLength(1);
  });
  it('all four together next to architecture', () => {
    roundTrip(`node web "Web" icon=browser\n${CLASSES}${STATES}${USECASES.replace(/shop/g, 'sys').replace(/\bpay\b/g, 'pay2')}${COMPONENTS}`);
  });
});

describe('.sdd UML text: merge, diagnostics, cross links', () => {
  it('keeps positions of existing classes and removes the ones dropped from the text', () => {
    const first = applyDsl(undefined, `#!sdd 1\ndiagram "T"\n${CLASSES}`, { layout: false }).page;
    const dog = first.nodes.find((n) => n.data.label === 'Dog')!;
    dog.position = { x: 777, y: 55 };
    const edited = printPage(first, 'T').replace('+ breed: string', '+ breed: string\n    + age: int');
    const r = applyDsl(first, edited, { layout: false });
    const dog2 = r.page.nodes.find((n) => n.data.label === 'Dog')!;
    expect(dog2.position).toEqual({ x: 777, y: 55 });
    expect(dog2.data.attributes.map((a: any) => a.name)).toEqual(['breed', 'age']);
    expect(dog2.data.attributes[0].id).toBe(first.nodes.find((n) => n.data.label === 'Dog')!.data.attributes[0].id);
    const dropped = applyDsl(r.page, edited.replace(/\n  class Dog \{[^}]*\}/, '').replace(/^  Dog .*$/gm, ''), { layout: false });
    expect(dropped.page.nodes.some((n) => n.data.label === 'Dog')).toBe(false);
    expect(dropped.removed.length).toBeGreaterThan(0);
  });
  it('turns a state into a composite without moving it', () => {
    const p = applyDsl(undefined, `states {\n state a "A"\n state b "B"\n a -> b\n}\n`, { layout: false }).page;
    p.nodes.find((n) => n.id === 'a')!.position = { x: 5, y: 6 };
    const r = applyDsl(p, `states {\n state a "A" {\n  state c "C"\n }\n state b "B"\n a -> b\n}\n`, { layout: false });
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.page.nodes.find((n) => n.id === 'a')).toMatchObject({ type: 'group', position: { x: 5, y: 6 } });
    expect(r.page.edges).toHaveLength(1);
  });
  it('reports errors with lines', () => {
    const d = (t: string) => parseDsl(t).diagnostics.map((x) => `${x.line}:${x.message}`);
    expect(d('classes {\n A --|> B\n}\n')).toEqual(['2:unknown class "A"']);
    expect(d('states {\n a -> b\n}\n')[0]).toContain('unknown state');
    expect(d('classes {\n class A {\n  + x: int\n')[0]).toContain('missing "}"');
    expect(d('usecases {\n actor a "A"\n actor a "B"\n}\n')[0]).toContain('duplicate id');
    expect(d('components {\n bogus x\n}\n')[0]).toContain('unknown statement');
    expect(d('classes {\n class A {\n  + (\n }\n}\n').length).toBeGreaterThan(0);
  });
  it('keeps the cross-link archRef of classes and components (print + parse + merge)', () => {
    const text = `classes {\n  class Svc archRef=api archFile=f1 archPage=p2 {\n    + run(): void\n  }\n}\ncomponents {\n  component c "C" archRef=db\n}\n`;
    const r = applyDsl(undefined, text, { layout: false });
    expect(r.diagnostics).toEqual([]);
    expect(r.page.nodes.find((n) => n.data.label === 'Svc')!.data.archRef).toEqual({ nodeId: 'api', fileId: 'f1', pageId: 'p2' });
    expect(r.page.nodes.find((n) => n.id === 'c')!.data.archRef).toEqual({ nodeId: 'db' });
    const printed = printPage(r.page, 'T');
    expect(printed).toContain('class Svc archRef=api archFile=f1 archPage=p2');
    expect(printed).toContain('component c "C" archRef=db');
    // a canvas link that the text does not mention is preserved only through the printed text, which carries it
    const page: CPage = structuredClone(r.page);
    page.nodes.find((n) => n.id === 'c')!.data.archRef = { nodeId: 'other' };
    expect(applyDsl(page, printPage(page, 'T'), { layout: false }).page.nodes.find((n) => n.id === 'c')!.data.archRef).toEqual({ nodeId: 'other' });
  });
  it('keeps archRef of tables on merge', () => {
    const p = applyDsl(undefined, 'table t {\n id int [pk]\n}\n', { layout: false }).page;
    p.nodes[0].data.archRef = { nodeId: 'db' };
    const r = applyDsl(p, 'table t {\n id int [pk]\n name text\n}\n', { layout: false });
    expect(r.page.nodes[0].data.archRef).toEqual({ nodeId: 'db' });
  });
  it('highlights and completes the new keywords', () => {
    const at = (doc: string) => completeAt(doc, doc.length)!.options.map((o) => o.label);
    expect(at('classes {\n  int')).toContain('interface');
    expect(at('states {\n  fo')).toContain('fork');
    expect(at('usecases {\n  ac')).toContain('actor');
    expect(at('components {\n  pro')).toContain('provides');
    expect(at('no')).toContain('classes {');
  });
});

describe('.sdd UML text: layout of fresh nodes', () => {
  it('lays out every block without overlapping top level nodes', () => {
    const r = applyDsl(undefined, `#!sdd 1\n${CLASSES}${STATES}${USECASES.replace(/shop/g, 'sys').replace(/\bpay\b/g, 'pay2')}${COMPONENTS}`);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    for (const n of r.page.nodes) expect(Number.isFinite(n.position.x + n.position.y)).toBe(true);
    const top = r.page.nodes.filter((n) => !n.parentId);
    const keys = new Set(top.map((n) => `${n.position.x},${n.position.y}`));
    expect(keys.size).toBe(top.length);
  });
});

describe('renaming a class in the text', () => {
  const text = (a: string, b: string) => `#!sdd 1\ndiagram "T"\nclasses {\n  class ${a} {\n    + x: int\n  }\n  class ${b}\n  ${a} --> ${b}\n}\n`;
  it('keeps the node (id, position, style, edges) when exactly one class is renamed', () => {
    const first = applyDsl(undefined, text('Alpha', 'Beta'), { layout: false }).page;
    const alpha = first.nodes.find((n) => n.data.label === 'Alpha')!;
    alpha.position = { x: 321, y: 123 };
    const next = applyDsl(structuredClone(first), text('AlphaX', 'Beta'), { layout: false }).page;
    const moved = next.nodes.find((n) => n.data.label === 'AlphaX')!;
    expect(next.nodes.find((n) => n.data.label === 'Alpha')).toBeUndefined();
    expect(moved.id).toBe(alpha.id);
    expect(moved.position).toEqual({ x: 321, y: 123 });
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0].source).toBe(alpha.id);
  });
});
