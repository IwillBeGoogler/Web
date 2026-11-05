import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { parseDiagram, serializeDiagram } from '../lib/serialization';
import { nodeSize } from '../lib/graph';
import { classOf } from '../lib/uml/geometry';
import { umlOf } from '../lib/uml/edges';
import type { DiagramNode } from '../types';

const UML = ALL_TEMPLATES.filter((t) => t.id.startsWith('uml-'));
const names = (d: { nodes: DiagramNode[] }) => d.nodes.filter((n) => n.type === 'class').map((n) => classOf(n).label);
const kinds = (d: { edges: { data?: { uml?: { kind: string } } }[] }) => d.edges.map((e) => e.data?.uml?.kind);

describe('UML design-pattern templates', () => {
  it('registers the seven patterns with uml / class / oop / ood tags', () => {
    expect(UML.map((t) => t.name)).toEqual(['UML — Strategy', 'UML — Observer', 'UML — Factory Method', 'UML — Singleton', 'UML — Decorator', 'UML — Adapter', 'UML — Repository']);
    for (const t of UML) expect(t.tags, t.id).toEqual(expect.arrayContaining(['uml', 'class', 'oop', 'ood']));
  });
  for (const t of UML) {
    describe(t.name, () => {
      const d = t.build();
      const classes = d.nodes.filter((n) => n.type === 'class');
      it('loads: 3+ classes, relations, a title and an attached note, valid serialization', () => {
        expect(classes.length).toBeGreaterThanOrEqual(3);
        expect(d.edges.length).toBeGreaterThanOrEqual(3);
        expect(d.nodes.some((n) => n.type === 'text')).toBe(true);
        expect(d.nodes.some((n) => n.type === 'sticky' && n.data.umlNote)).toBe(true);
        expect(kinds(d)).toContain('note');
        expect(parseDiagram(serializeDiagram(d)).ok).toBe(true);
      });
      it('lays out without overlap', () => {
        const rs = d.nodes.map((n) => ({ id: n.id, ...n.position, ...nodeSize(n) }));
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i], b = rs[j];
            expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, `${a.id}/${b.id}`).toBe(false);
          }
      });
      it('puts parents above children', () => {
        const y = new Map(classes.map((n) => [n.id, n.position.y]));
        for (const e of d.edges) {
          const k = umlOf(e)?.kind;
          if (k === 'inheritance' || k === 'realization') expect(y.get(e.target)!, `${e.source} -> ${e.target}`).toBeLessThan(y.get(e.source)!);
        }
      });
    });
  }
  it('Strategy: a context, an interface and two realizations', () => {
    const d = UML[0].build();
    expect(names(d)).toEqual(expect.arrayContaining(['Context', 'Strategy', 'ConcreteStrategyA', 'ConcreteStrategyB']));
    expect(kinds(d).filter((k) => k === 'realization')).toHaveLength(2);
    expect(kinds(d)).toContain('association');
  });
  it('Observer: subject, observer interface, two concrete classes', () => {
    const d = UML[1].build();
    expect(names(d)).toEqual(expect.arrayContaining(['Subject', 'Observer', 'ConcreteSubject', 'ConcreteObserver']));
    expect(kinds(d)).toEqual(expect.arrayContaining(['association', 'inheritance', 'realization']));
  });
  it('Factory Method: abstract creator, product interface, dependencies', () => {
    const d = UML[2].build();
    expect(classOf(d.nodes.find((n) => n.type === 'class' && classOf(n).label === 'Creator')!).kind).toBe('abstract');
    expect(kinds(d)).toEqual(expect.arrayContaining(['dependency', 'inheritance', 'realization']));
  });
  it('Singleton: a static instance and getInstance()', () => {
    const d = UML[3].build();
    const s = classOf(d.nodes.find((n) => n.type === 'class' && classOf(n).label === 'Singleton')!);
    expect(s.attributes.some((a) => a.static && a.visibility === '-')).toBe(true);
    expect(s.operations.some((o) => o.static && o.name === 'getInstance')).toBe(true);
  });
  it('Decorator: aggregation, an abstract decorator and two concrete ones', () => {
    const d = UML[4].build();
    expect(kinds(d)).toContain('aggregation');
    expect(names(d)).toEqual(expect.arrayContaining(['Component', 'Decorator', 'ConcreteDecoratorA', 'ConcreteDecoratorB']));
  });
  it('Adapter and Repository', () => {
    expect(names(UML[5].build())).toEqual(expect.arrayContaining(['Client', 'Target', 'Adapter', 'Adaptee']));
    const r = UML[6].build();
    expect(classOf(r.nodes.find((n) => n.type === 'class' && classOf(n).label === 'Repository')!)).toMatchObject({ kind: 'interface', generics: 'T, ID' });
    expect(kinds(r)).toEqual(expect.arrayContaining(['inheritance', 'realization', 'association']));
  });
});
