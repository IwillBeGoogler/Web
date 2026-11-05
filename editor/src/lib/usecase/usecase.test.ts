import { describe, expect, it } from 'vitest';
import { umlOf } from '../uml/edges';
import { diagramToUseCaseModel, isBoundaryNode, useCaseModelToDiagram } from './convert';
import { layoutUseCase } from './layout';
import { parseUseCaseMermaid, renderUseCaseMermaid } from './mermaid';
import { parseUseCasePlantuml, renderUseCasePlantuml } from './plantuml';
import { tidyUseCase } from './tidy';
import type { UseCaseModel } from './types';

const model: UseCaseModel = {
  actors: [{ id: 'cust', name: 'Customer' }, { id: 'adm', name: 'Admin' }, { id: 'pay', name: 'Payment Gateway' }],
  boundaries: [{ id: 'shop', name: 'Online Shop' }],
  cases: [
    { id: 'browse', name: 'Browse', boundary: 'shop' },
    { id: 'checkout', name: 'Checkout', boundary: 'shop', extensionPoints: ['coupon', 'gift wrap'] },
    { id: 'login', name: 'Log in', boundary: 'shop' },
    { id: 'discount', name: 'Apply discount', boundary: 'shop' },
    { id: 'manage', name: 'Manage catalog', boundary: 'shop' },
  ],
  relations: [
    { from: 'cust', to: 'browse', kind: 'association', fromMult: '1', toMult: '0..*' },
    { from: 'cust', to: 'checkout', kind: 'association' },
    { from: 'adm', to: 'manage', kind: 'association', label: 'owns' },
    { from: 'pay', to: 'checkout', kind: 'association' },
    { from: 'checkout', to: 'login', kind: 'include' },
    { from: 'discount', to: 'checkout', kind: 'extend' },
    { from: 'adm', to: 'cust', kind: 'generalization' },
  ],
};

describe('use case auto-layout', () => {
  const lay = layoutUseCase(model);
  const box = (id: string) => lay.boxes.get(id)!;
  it('puts actors left and right of the system boundary and use cases inside it', () => {
    const sys = lay.boundaries.get('shop')!;
    expect(lay.side.get('cust')).toBe('left');
    expect(lay.side.get('pay')).toBe('right');
    expect(box('cust').x + box('cust').w).toBeLessThan(sys.x);
    expect(box('pay').x).toBeGreaterThan(sys.x + sys.w);
    for (const c of model.cases) {
      const b = box(c.id);
      expect(b.x).toBeGreaterThanOrEqual(sys.x);
      expect(b.x + b.w).toBeLessThanOrEqual(sys.x + sys.w);
      expect(b.y).toBeGreaterThanOrEqual(sys.y);
      expect(b.y + b.h).toBeLessThanOrEqual(sys.y + sys.h);
    }
  });
  it('places included and extending use cases one column right of their base', () => {
    expect(box('login').x).toBeGreaterThan(box('checkout').x);
    expect(box('discount').x).toBeGreaterThan(box('checkout').x);
  });
  it('overlaps nothing', () => {
    const all = [...lay.boxes.entries()];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const [, a] = all[i], [, b] = all[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${all[i][0]} / ${all[j][0]}`).toBe(false);
    }
  });
  it('is deterministic', () => {
    expect([...layoutUseCase(model).boxes]).toEqual([...lay.boxes]);
  });
});

describe('use case model <-> diagram', () => {
  const d = useCaseModelToDiagram(model);
  it('boundary holds its use cases as children, edges carry kind and multiplicities', () => {
    const sys = d.nodes.find(isBoundaryNode)!;
    expect(d.nodes.filter((n) => n.parentId === sys.id)).toHaveLength(5);
    const assoc = d.edges.find((e) => umlOf(e)!.sourceMult === '1')!;
    expect(umlOf(assoc)).toMatchObject({ kind: 'association', sourceMult: '1', targetMult: '0..*' });
    expect(d.edges.map((e) => umlOf(e)!.kind).sort()).toEqual(['association', 'association', 'association', 'association', 'extend', 'generalization', 'include']);
  });
  it('extension points are stored and make the use case taller', () => {
    const co = d.nodes.find((n) => n.data.label === 'Checkout')!;
    const br = d.nodes.find((n) => n.data.label === 'Browse')!;
    expect(co.data.extensionPoints).toEqual(['coupon', 'gift wrap']);
    expect(co.height!).toBeGreaterThan(br.height!);
  });
  it('reading the diagram back gives the same model', () => {
    const back = diagramToUseCaseModel(d.nodes, d.edges);
    expect(back.actors.map((a) => a.name)).toEqual(['Customer', 'Admin', 'Payment Gateway']);
    expect(back.cases.find((c) => c.name === 'Checkout')!.extensionPoints).toEqual(['coupon', 'gift wrap']);
    expect(back.relations.map((r) => r.kind).sort()).toEqual(model.relations.map((r) => r.kind).sort());
    expect(back.relations.find((r) => r.fromMult)).toMatchObject({ fromMult: '1', toMult: '0..*' });
    expect(back.relations.find((r) => r.label)?.label).toBe('owns');
  });
  it('Tidy moves nodes into the layout and keeps children relative to the boundary', () => {
    const messy = d.nodes.map((n, i) => (isBoundaryNode(n) ? n : { ...n, position: { x: i * 7, y: i * 3 } }));
    const r = tidyUseCase(messy, d.edges)!;
    expect(r.count).toBe(8);
    const sys = r.nodes.find(isBoundaryNode)!;
    const co = r.nodes.find((n) => n.data.label === 'Checkout')!;
    expect(co.position.x).toBeGreaterThanOrEqual(0);
    expect(co.position.x + co.width!).toBeLessThanOrEqual(sys.width!);
    const cust = r.nodes.find((n) => n.data.label === 'Customer')!;
    expect(cust.position.x + cust.width!).toBeLessThan(sys.position.x);
    expect(tidyUseCase([], [])).toBeNull();
  });
});

describe('use case PlantUML', () => {
  it('round trips actors, boundary, extension points, multiplicities and relation kinds', () => {
    const text = renderUseCasePlantuml(model);
    expect(text).toContain('@startuml');
    expect(text).toContain('rectangle "Online Shop" {');
    expect(text).toContain('<<include>>');
    expect(text).toContain('extension points: coupon, gift wrap');
    const back = parseUseCasePlantuml(text);
    expect(back.warnings).toEqual([]);
    expect(back.model.actors.map((a) => a.name)).toEqual(['Customer', 'Admin', 'Payment Gateway']);
    expect(back.model.boundaries.map((b) => b.name)).toEqual(['Online Shop']);
    expect(back.model.cases).toHaveLength(5);
    expect(back.model.cases.every((c) => c.boundary)).toBe(true);
    expect(back.model.cases.find((c) => c.name === 'Checkout')!.extensionPoints).toEqual(['coupon', 'gift wrap']);
    const name = (id: string) => [...back.model.actors, ...back.model.cases].find((x) => x.id === id)!.name;
    const rels = back.model.relations.map((r) => `${name(r.from)} ${r.kind} ${name(r.to)}`).sort();
    expect(rels).toEqual(model.relations.map((r) => `${[...model.actors, ...model.cases].find((x) => x.id === r.from)!.name} ${r.kind} ${[...model.actors, ...model.cases].find((x) => x.id === r.to)!.name}`).sort());
    expect(back.model.relations.find((r) => r.fromMult)).toMatchObject({ fromMult: '1', toMult: '0..*' });
  });
  it('reads hand-written PlantUML', () => {
    const src = `@startuml
left to right direction
skinparam packageStyle rectangle
actor customer
actor clerk as c2
rectangle checkout {
  customer -- (checkout)
  (checkout) .> (payment) : include
  (help) .> (checkout) : extends
  clerk -- (checkout)
}
:Admin: --|> clerk
usecase UC9 as "Audit"
@enduml`;
    const { model: m, warnings } = parseUseCasePlantuml(src);
    expect(warnings).toEqual([]);
    expect(m.actors.map((a) => a.name).sort()).toEqual(['Admin', 'clerk', 'customer']);
    expect(m.cases.map((c) => c.name).sort()).toEqual(['Audit', 'checkout', 'help', 'payment']);
    expect(m.relations.map((r) => r.kind)).toEqual(['association', 'include', 'extend', 'association', 'generalization']);
    expect(m.boundaries[0].name).toBe('checkout');
    expect(m.cases.find((c) => c.name === 'payment')!.boundary).toBe(m.boundaries[0].id);
  });
});

describe('use case Mermaid flowchart', () => {
  it('round trips', () => {
    const text = renderUseCaseMermaid(model);
    expect(text.startsWith('flowchart LR')).toBe(true);
    expect(text).toContain('subgraph S1["Online Shop"]');
    const { model: back, warnings } = parseUseCaseMermaid(text);
    expect(warnings).toEqual([]);
    expect(back.actors.map((a) => a.name)).toEqual(['Customer', 'Admin', 'Payment Gateway']);
    expect(back.cases.map((c) => c.name)).toEqual(['Browse', 'Checkout', 'Log in', 'Apply discount', 'Manage catalog']);
    expect(back.cases.find((c) => c.name === 'Checkout')!.extensionPoints).toEqual(['coupon', 'gift wrap']);
    expect(back.boundaries).toHaveLength(1);
    expect(back.relations.map((r) => r.kind)).toEqual(model.relations.map((r) => r.kind));
    expect(back.relations[0]).toMatchObject({ fromMult: '1', toMult: '0..*' });
    expect(back.relations[2].label).toBe('owns');
  });
  it('reads a hand-written flowchart (best effort)', () => {
    const { model: m } = parseUseCaseMermaid(`flowchart LR
  user{{Shopper}}:::actor
  user --- buy([Buy item])
  buy -.->|include| pay([Pay])
  rare([Gift]) -.->|extend| buy`);
    expect(m.actors).toHaveLength(1);
    expect(m.cases.map((c) => c.name)).toEqual(['Buy item', 'Pay', 'Gift']);
    expect(m.relations.map((r) => r.kind)).toEqual(['association', 'include', 'extend']);
  });
});
