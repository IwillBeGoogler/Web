import { describe, expect, it } from 'vitest';
import { applyFix, lintPage } from '@core/lint';
import type { CEdge, CNode, CPage } from '@core/types';

const cls = (id: string, label: string, kind = 'class', ops: string[] = []): CNode => ({ id, type: 'class', position: { x: 0, y: 0 }, data: { label, kind, accent: '#000', attributes: [], operations: ops.map((name, i) => ({ id: `o${i}`, visibility: '+', name, params: [] })) } });
const rel = (id: string, source: string, target: string, kind: string): CEdge => ({ id, source, target, data: { uml: { kind } } });
const msg = (id: string, from: string, to: string, text: string, kind = 'sync') => ({ type: 'message', id, from, to, text, kind });
const seq = (id: string, parts: [string, string][], items: unknown[]): CNode => ({ id, type: 'sequence', position: { x: 0, y: 0 }, data: { label: 'Flow', participants: parts.map(([pid, name]) => ({ id: pid, name, kind: 'participant' })), items, autonumber: false, accent: '#000' } });
const page = (nodes: CNode[], edges: CEdge[] = []): CPage => ({ id: 'p', name: 'p', nodes, edges });
const rules = (p: CPage, rule: string) => lintPage(p).filter((x) => x.rule === rule);

describe('uml/inheritance-cycle', () => {
  const p = page([cls('a', 'A'), cls('b', 'B'), cls('c', 'C')], [rel('e1', 'a', 'b', 'inheritance'), rel('e2', 'b', 'c', 'inheritance'), rel('e3', 'c', 'a', 'inheritance')]);
  it('flags a 3-cycle and offers to cut the last edge', () => {
    const [pr] = rules(p, 'uml/inheritance-cycle');
    expect(pr.severity).toBe('error');
    expect(pr.fix?.kind).toBe('remove-edge');
    const fixed = applyFix(p, pr.fix!);
    expect(fixed.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(rules(fixed, 'uml/inheritance-cycle')).toHaveLength(0);
    expect(p.edges).toHaveLength(3);
  });
  it('flags a self-inheritance; a plain chain is fine', () => {
    expect(rules(page([cls('a', 'A')], [rel('e', 'a', 'a', 'inheritance')]), 'uml/inheritance-cycle')).toHaveLength(1);
    expect(rules(page([cls('a', 'A'), cls('b', 'B')], [rel('e', 'a', 'b', 'inheritance')]), 'uml/inheritance-cycle')).toHaveLength(0);
  });
});

describe('uml/interface-no-impl', () => {
  const base = [cls('i', 'IRepo', 'interface', ['save', 'load']), cls('r', 'Repo')];
  it('flags an interface nobody realizes, quick fix adds an implementing class', () => {
    const p = page(base, [rel('e', 'r', 'i', 'dependency')]);
    const [pr] = rules(p, 'uml/interface-no-impl');
    expect(pr).toBeTruthy();
    const fixed = applyFix(p, pr.fix!);
    const impl = fixed.nodes.find((n) => n.id === 'i_impl')!;
    expect(impl.data.label).toBe('Repo');
    expect(impl.data.operations.map((o: any) => o.name)).toEqual(['save', 'load']);
    expect(fixed.edges.at(-1)).toMatchObject({ source: 'i_impl', target: 'i', data: { uml: { kind: 'realization' } } });
    expect(rules(fixed, 'uml/interface-no-impl')).toHaveLength(0);
  });
  it('realization or inheritance silences it', () => {
    expect(rules(page(base, [rel('e', 'r', 'i', 'realization')]), 'uml/interface-no-impl')).toHaveLength(0);
  });
});

describe('uml/unused-class', () => {
  const nodes = [cls('a', 'A'), cls('b', 'B'), cls('c', 'Lonely')];
  const edges = [rel('e', 'a', 'b', 'association')];
  it('flags a class with no relations, fix deletes it', () => {
    const p = page(nodes, edges);
    const [pr] = rules(p, 'uml/unused-class');
    expect(pr.nodeIds).toEqual(['c']);
    expect(applyFix(p, pr.fix!).nodes.map((n) => n.id)).toEqual(['a', 'b']);
  });
  it('a sequence participant with the class name counts as a use', () => {
    const p = page([...nodes, seq('s', [['p1', 'Lonely'], ['p2', ':User']], [])], edges);
    expect(rules(p, 'uml/unused-class')).toHaveLength(0);
  });
  it('a single class on a page is not flagged', () => {
    expect(rules(page([cls('a', 'A')]), 'uml/unused-class')).toHaveLength(0);
  });
});

describe('uml/seq-missing-method', () => {
  const classes = [cls('o', 'OrderService', 'class', ['place', 'cancel']), cls('base', 'Base', 'class', ['audit']), cls('u', 'User')];
  const edges = [rel('e', 'o', 'base', 'inheritance'), rel('e2', 'u', 'o', 'association')];
  const parts: [string, string][] = [['u', 'User'], ['o', 'OrderService']];
  it('flags a call to a method the class lacks, with an add-operation fix', () => {
    const p = page([...classes, seq('s', parts, [msg('m1', 'u', 'o', 'place(order)'), msg('m2', 'u', 'o', 'refund(order)'), msg('m3', 'u', 'o', 'refund()')])], edges);
    const found = rules(p, 'uml/seq-missing-method');
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/refund/);
    expect(found[0].severity).toBe('warning');
    const fixed = applyFix(p, found[0].fix!);
    expect(fixed.nodes.find((n) => n.id === 'o')!.data.operations.map((o: any) => o.name)).toEqual(['place', 'cancel', 'refund']);
    expect(rules(fixed, 'uml/seq-missing-method')).toHaveLength(0);
  });
  it('inherited methods, returns, free text and unmatched participants are fine; nested fragments are checked', () => {
    const items = [
      msg('m1', 'u', 'o', 'audit()'),
      msg('m2', 'o', 'u', 'refund', 'return'),
      msg('m3', 'u', 'o', 'Please wait for it'),
      msg('m4', 'u', 'x', 'whatever()'),
      { type: 'fragment', id: 'f', op: 'alt', sections: [{ id: 's1', guard: '', items: [msg('m5', 'u', 'o', '1: ok = ship(order)')] }] },
    ];
    const found = rules(page([...classes, seq('s', [...parts, ['x', 'Stranger']], items)], edges), 'uml/seq-missing-method');
    expect(found.map((f) => f.fix?.name)).toEqual(['ship']);
  });
  it('can be disabled through the config', () => {
    const p = page([...classes, seq('s', parts, [msg('m', 'u', 'o', 'nope()')])], edges);
    expect(lintPage(p, { rules: { 'uml/seq-missing-method': { enabled: false } } }).some((x) => x.rule === 'uml/seq-missing-method')).toBe(false);
  });
});
