import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { parseDiagram, serializeDiagram } from '../lib/serialization';
import { nodeSize } from '../lib/graph';
import { computeRoutes, DEFAULT_ROUTING } from '../lib/routing';
import { BUILTIN_SETTINGS } from '../lib/settings';
import { layoutSequence } from '../lib/seq/layout';
import { sequenceOf } from '../lib/seq/node';
import { allMessages, walk } from '../lib/seq/types';
import { renderSeqMermaid, parseSeqMermaid } from '../lib/seq/mermaid';
import { renderStateMermaid, parseStateMermaid } from '../lib/state/mermaid';
import { diagramToStateModel } from '../lib/state/convert';
import type { DiagramNode } from '../types';

const by = (id: string) => ALL_TEMPLATES.find((t) => t.id === id)!;
const IDS = ['seq-oauth-login', 'seq-checkout', 'state-order-lifecycle', 'usecase-ecommerce', 'component-microservices'];
const opts = { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node };

describe('UML diagram templates (phase 2)', () => {
  it('are registered with the agreed names and uml tags', () => {
    expect(IDS.map((id) => by(id)?.name)).toEqual(['Sequence — login with OAuth', 'Sequence — checkout', 'State — order lifecycle', 'Use case — e-commerce', 'Component — microservices']);
    for (const id of IDS) expect(by(id).tags, id).toEqual(expect.arrayContaining(['uml']));
    expect(by('seq-oauth-login').tags).toEqual(expect.arrayContaining(['sequence', 'oauth']));
    expect(by('state-order-lifecycle').tags).toEqual(expect.arrayContaining(['state']));
    expect(by('usecase-ecommerce').tags).toEqual(expect.arrayContaining(['usecase']));
    expect(by('component-microservices').tags).toEqual(expect.arrayContaining(['component']));
  });
  for (const id of IDS) {
    describe(id, () => {
      const d = by(id).build();
      it('has valid structure and survives a JSON round trip', () => {
        const ids = new Set(d.nodes.map((n) => n.id));
        expect(ids.size).toBe(d.nodes.length);
        for (const e of d.edges) { expect(ids.has(e.source), e.id).toBe(true); expect(ids.has(e.target), e.id).toBe(true); }
        expect(parseDiagram(serializeDiagram(d)).ok).toBe(true);
      });
      it('siblings do not overlap and every edge is routed', () => {
        const sib = (a: DiagramNode, b: DiagramNode) => a.parentId === b.parentId;
        const rs = d.nodes.map((n) => ({ n, ...n.position, ...nodeSize(n) }));
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i], b = rs[j];
            if (!sib(a.n, b.n)) continue;
            // a system boundary / composite is allowed to sit around loose items drawn on top of it
            if (a.n.type === 'group' || b.n.type === 'group') continue;
            expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, `${a.n.id}/${b.n.id}`).toBe(false);
          }
        const routes = computeRoutes(d.nodes, d.edges, opts);
        for (const e of d.edges) expect(routes.has(e.id), e.id).toBe(true);
      });
    });
  }
  it('OAuth login: a numbered flow with an alt fragment, a note and activations', () => {
    const d = by('seq-oauth-login').build();
    const seq = d.nodes.find((n) => n.type === 'sequence')!;
    const m = sequenceOf(seq);
    expect(m.autonumber).toBe(true);
    expect(m.participants.length).toBeGreaterThanOrEqual(4);
    expect(m.participants.map((p) => p.kind)).toEqual(expect.arrayContaining(['actor']));
    expect(allMessages(m.items).length).toBeGreaterThanOrEqual(10);
    expect(m.items.some((i) => i.type === 'fragment' && i.op === 'alt')).toBe(true);
    let notes = 0;
    walk(m.items, (i) => { if (i.type === 'note') notes++; });
    expect(notes).toBeGreaterThanOrEqual(1);
    expect(layoutSequence(m).activations.length).toBeGreaterThanOrEqual(3);
    expect(parseSeqMermaid(renderSeqMermaid(m)).warnings).toEqual([]);
  });
  it('checkout: loop, alt, opt/par, create and destroy', () => {
    const m = sequenceOf(by('seq-checkout').build().nodes.find((n) => n.type === 'sequence')!);
    const ops = new Set<string>();
    walk(m.items, (i) => { if (i.type === 'fragment') ops.add(i.op); });
    expect([...ops]).toEqual(expect.arrayContaining(['loop', 'alt']));
    expect(ops.size).toBeGreaterThanOrEqual(3);
    const kinds = new Set(allMessages(m.items).map((x) => x.kind));
    expect([...kinds]).toEqual(expect.arrayContaining(['sync', 'return', 'async', 'create', 'destroy']));
  });
  it('order lifecycle: initial, final, choice, fork/join, a composite with children, guards and a self transition', () => {
    const d = by('state-order-lifecycle').build();
    const kinds = new Set(d.nodes.filter((n) => n.type === 'state').map((n) => n.data.stateKind));
    for (const k of ['state', 'initial', 'final', 'choice', 'fork', 'join']) expect(kinds.has(k), k).toBe(true);
    const comp = d.nodes.find((n) => n.type === 'group' && n.data.variant === 'composite')!;
    expect(d.nodes.filter((n) => n.parentId === comp.id).length).toBeGreaterThanOrEqual(5);
    // one end marker per ending path: no final state has more than one incoming transition
    for (const f of d.nodes.filter((n) => n.type === 'state' && n.data.stateKind === 'final')) expect(d.edges.filter((e) => e.target === f.id).length, f.id).toBe(1);
    expect(d.edges.some((e) => e.source === e.target)).toBe(true);
    expect(d.edges.some((e) => /\[.+\]/.test(String(e.label)) && /\//.test(String(e.label)))).toBe(true);
    const model = diagramToStateModel(d.nodes, d.edges);
    expect(parseStateMermaid(renderStateMermaid(model)).warnings).toEqual([]);
  });
  it('use case: actors outside, use cases inside a titled system boundary, include / extend / generalization', () => {
    const d = by('usecase-ecommerce').build();
    const sys = d.nodes.find((n) => n.type === 'group' && n.data.variant === 'boundary')!;
    const actors = d.nodes.filter((n) => n.type === 'usecase' && n.data.ucKind === 'actor');
    const cases = d.nodes.filter((n) => n.type === 'usecase' && n.data.ucKind === 'usecase');
    expect(actors.length).toBeGreaterThanOrEqual(3);
    expect(cases.length).toBeGreaterThanOrEqual(7);
    for (const c of cases) expect(c.parentId).toBe(sys.id);
    for (const a of actors) expect(a.parentId).toBeUndefined();
    const kinds = d.edges.map((e) => e.data?.uml?.kind);
    expect(kinds).toEqual(expect.arrayContaining(['association', 'include', 'extend', 'generalization']));
    expect(d.edges.find((e) => e.data?.uml?.kind === 'include')!.label).toBe('«include»');
  });
  it('microservices: components, provided / required interfaces, assembly + dependency connectors, nodes and artifacts', () => {
    const d = by('component-microservices').build();
    const k = (x: string) => d.nodes.filter((n) => n.type === 'component' && n.data.compKind === x).length;
    expect(k('component')).toBeGreaterThanOrEqual(5);
    expect(k('provided')).toBeGreaterThanOrEqual(3);
    expect(k('required')).toBeGreaterThanOrEqual(3);
    expect(k('node')).toBeGreaterThanOrEqual(1);
    expect(k('artifact')).toBeGreaterThanOrEqual(2);
    const kinds = d.edges.map((e) => e.data?.uml?.kind);
    expect(kinds).toEqual(expect.arrayContaining(['assembly', 'dependency']));
  });
});
