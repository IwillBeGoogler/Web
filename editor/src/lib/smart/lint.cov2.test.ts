import { describe, expect, it } from 'vitest';
import { lintPage, roleOf } from '@core/lint';
import type { CNode, CPage } from '@core/types';

const nd = (id: string, type: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): CNode => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, ...data }, ...extra });
const page = (nodes: CNode[], edges: any[] = []): CPage => ({ id: 'p', name: 'P', nodes, edges });
const edge = (id: string, source: string, target: string, extra: Record<string, unknown> = {}) => ({ id, source, target, ...extra });
const rules = (p: CPage, cfg = {}) => lintPage(p, cfg).map((x) => x.rule);
const cls = (id: string, data: Record<string, unknown> = {}) => nd(id, 'class', { label: id, ...data });
const ue = (id: string, source: string, target: string, kind: string) => edge(id, source, target, { data: { uml: { kind } } });

describe('roleOf without labels', () => {
  it('a node with no label and no icon is a plain service', () => {
    const n = nd('a', 'card');
    delete n.data.label;
    expect(roleOf(n)).toBe('service');
  });
});

describe('replica / redundancy detection', () => {
  const lbTo = (target: CNode) => page([nd('lb', 'icon', { iconId: 'nginx' }), target], [edge('e', 'lb', 'target')]);
  const svc = (data: Record<string, unknown>, type = 'card') => nd('target', type, data);
  it('replicas, capacity replicas, arch instances, repeatOf and non-single cluster topology all count as redundancy', () => {
    expect(rules(lbTo(svc({})))).toContain('arch/spof');
    expect(rules(lbTo(svc({ replicas: 3 })))).not.toContain('arch/spof');
    expect(rules(lbTo(svc({ capacity: { replicas: 2 } })))).not.toContain('arch/spof');
    expect(rules(lbTo(svc({ arch: { instances: 4 } })))).not.toContain('arch/spof');
    expect(rules(lbTo(svc({ arch: { instances: 1 } })))).toContain('arch/spof');
    expect(rules(lbTo(svc({ repeatOf: 'x' })))).not.toContain('arch/spof');
    expect(rules(lbTo(svc({ topology: 'ha' }, 'cluster')))).not.toContain('arch/spof');
    expect(rules(lbTo(svc({ topology: 'single' }, 'cluster')))).toContain('arch/spof');
  });
  it('a database without label is detected by role and replica nodes are exempt', () => {
    const db = nd('d', 'icon', { iconId: 'postgresql' });
    delete db.data.label;
    expect(rules(page([db]))).toEqual(expect.arrayContaining(['arch/db-no-replica', 'arch/db-no-backup']));
    const replica = nd('d', 'icon', { iconId: 'postgresql', role: 'replica' });
    expect(rules(page([replica]))).not.toContain('arch/db-no-replica');
    const unlabelled = nd('d', 'icon', { iconId: 'postgresql' });
    delete unlabelled.data.label;
    const lblReplica = nd('r', 'icon', { iconId: 'mysql', label: 'Read-only copy' });
    const p = page([unlabelled, lblReplica], [edge('e', 'd', 'r')]);
    expect(lintPage(p).filter((x) => x.rule === 'arch/db-no-replica')).toEqual([]);
  });
  it('backup: a configured arch backup, backup-storage peers, labelled edges or presets satisfy the rule', () => {
    const db = (arch?: Record<string, unknown>) => nd('d', 'icon', { iconId: 'postgresql', ...(arch ? { arch } : {}) });
    const msg = (p: CPage) => lintPage(p).find((x) => x.rule === 'arch/db-no-backup')?.message;
    expect(msg(page([db({ backup: 'none' })]))).toContain('backup "none"');
    expect(msg(page([db({ backup: 'pitr' })]))).toBeUndefined();
    expect(msg(page([db({})]))).toBeDefined();
    expect(msg(page([db(), nd('s', 'icon', { iconId: 's3' })], [edge('e', 'd', 's')]))).toBeUndefined();
    expect(msg(page([db(), nd('x', 'icon', { iconId: 'redis' })], [edge('e', 'd', 'x', { label: 'nightly dump' })]))).toBeUndefined();
    expect(msg(page([db(), nd('x', 'icon', { iconId: 'redis' })], [edge('e', 'd', 'x', { data: { preset: 'backup' } })]))).toBeUndefined();
    expect(msg(page([db(), nd('x', 'icon', { iconId: 'redis', label: 'Snapshot vault' })], [edge('e', 'd', 'x')]))).toBeUndefined();
  });
});

describe('ERD edge cases', () => {
  const table = (id: string, cols: any[], data: Record<string, unknown> = {}) => nd(id, 'table', { label: id, columns: cols, ...data });
  const c = (id: string, name: string, type = 'int', extra: Record<string, unknown> = {}) => ({ id, name, type, pk: false, nullable: true, ...extra });
  it('types without a mapping compare by their normalised text, null types compare as empty', () => {
    const mk = (a: any, b: any) => page([table('u', [c('c0', 'id', a, { pk: true })]), table('o', [c('c0', 'id', 'int', { pk: true }), c('c1', 'uid', b, { fk: { table: 'u', column: 'id' } })], { indexes: [{ columns: ['uid'] }] })], [edge('r', 'u', 'o', { data: { relation: { fromCol: 'c0', toCol: 'c1' } } })]);
    expect(rules(mk('json', 'jsonb'))).toContain('erd/fk-type');
    expect(rules(mk('JSONB', 'jsonb'))).not.toContain('erd/fk-type');
    expect(rules(mk(null, null))).not.toContain('erd/fk-type');
    expect(rules(mk(null, 'int'))).toContain('erd/fk-type');
  });
  it('labels fall back to ids in messages', () => {
    const t = table('tbl', [c('c0', 'x', 'int', { fk: { table: 'z', column: 'id' } })]);
    delete t.data.label;
    const m = lintPage(page([t])).find((x) => x.rule === 'erd/fk-index')!;
    expect(m.message).toBe('tbl.x references z but has no index.');
  });
});

describe('UML edge cases', () => {
  it('self-inheritance cycle offers cutting the edge; a longer cycle cuts the last drawn edge', () => {
    const self = lintPage(page([cls('A')], [ue('1', 'A', 'A', 'inheritance')])).find((x) => x.rule === 'uml/inheritance-cycle')!;
    expect(self.nodeIds).toEqual(['A']);
    expect(self.fix).toMatchObject({ kind: 'remove-edge', edgeId: '1' });
    const loop = lintPage(page([cls('A'), cls('B'), cls('C')], [ue('1', 'A', 'B', 'inheritance'), ue('2', 'B', 'A', 'inheritance'), ue('3', 'C', 'A', 'inheritance')])).find((x) => x.rule === 'uml/inheritance-cycle')!;
    expect(loop.nodeIds).toEqual(['A', 'B']);
    expect(loop.fix).toMatchObject({ edgeId: '2' });
  });
  it('class labels and sequence participants: missing labels, "obj:Class" names, missing names and duplicates', () => {
    const noLabel = cls('Foo');
    delete noLabel.data.label;
    const dup = cls('foo', { operations: [{ name: 'later' }] });
    const seq = nd('sq', 'sequence', {
      participants: [{ id: 'p1', name: 'x : Foo' }, { id: 'p2' }, { id: 'p3', name: ' FOO ' }],
      items: [
        { type: 'message', from: 'p0', to: 'p1', text: 'a(1)' },
        { type: 'message', from: 'p0', to: 'p1', text: 'a(1)' },
        { type: 'message', from: 'p0', to: 'p2', text: 'ignored()' },
        { type: 'message', from: 'p0', to: 'p9', text: 'dangling()' },
        { type: 'message', from: 'p0', to: 'p3' },
        { type: 'message', from: 'p0', to: 'p3', text: 'x = new Foo' },
        { type: 'message', from: 'p0', to: 'p3', text: '1. await later()' },
        { type: 'message', from: 'p0', to: 'p3', text: 'ret = get(1)' },
        { type: 'message', from: 'p0', to: 'p3', text: 'Cap' },
        { type: 'message', from: 'p0', to: 'p3', text: 'lower' },
        { type: 'message', from: 'p0', to: 'p3', text: 'back', kind: 'return' },
        { type: 'message', from: 'p0', to: 'p3', text: 'mk()', kind: 'create' },
        { type: 'message', from: 'p0', to: 'p3', text: 'rm()', kind: 'destroy' },
      ],
    });
    const probs = lintPage(page([noLabel, dup, cls('Other'), seq])).filter((x) => x.rule === 'uml/seq-missing-method');
    const texts = probs.map((p) => p.id.split(':').slice(-1)[0]).sort();
    expect(texts).toEqual(['a', 'get', 'lower'].sort());
    expect(probs.every((p) => p.nodeIds[1] === 'foo')).toBe(true);
    expect(probs.find((p) => p.id.endsWith(':a'))!.message).toContain('"a(1)"');
  });
  it('sequence without participants / items, fragments without sections, and enums are ignored', () => {
    const e = cls('Color', { kind: 'enum' });
    const seq = nd('sq', 'sequence', { participants: [{ id: 'p1', name: 'Color' }], items: [{ type: 'message', to: 'p1', text: 'x()' }, { type: 'fragment' }] });
    const bare = nd('bare', 'sequence');
    expect(rules(page([e, cls('K'), seq, bare]))).not.toContain('uml/seq-missing-method');
    expect(rules(page([e, bare]))).not.toContain('uml/seq-missing-method');
  });
  it('inherited and realized members count; classes missing operations lists are fine', () => {
    const base = cls('Base', { operations: [{ name: ' run ' }] });
    const iface = cls('Port', { kind: 'interface', operations: [{ name: 'send' }] });
    const impl = cls('Impl');
    const seq = nd('sq', 'sequence', { participants: [{ id: 'p', name: 'Impl' }], items: [{ type: 'message', to: 'p', text: 'run()' }, { type: 'message', to: 'p', text: 'send()' }, { type: 'message', to: 'p', text: 'zap()' }] });
    const p = page([base, iface, impl, seq], [ue('1', 'Impl', 'Base', 'inheritance'), ue('2', 'Impl', 'Port', 'realization'), ue('3', 'Base', 'Impl', 'association')]);
    const missing = lintPage(p).filter((x) => x.rule === 'uml/seq-missing-method');
    expect(missing.map((m) => m.id)).toEqual(['uml/seq-missing-method:sq:p:zap']);
  });
  it('object slots: inherited attributes pass, unknown / blank / duplicate slots handled, missing lists tolerated', () => {
    const base = cls('Base', { attributes: [{ name: 'id' }] });
    const kid = cls('Kid', { attributes: [{ name: ' name ' }] });
    const o = nd('o', 'object', { className: ' kid ', slots: [{ name: 'id' }, { name: 'name' }, { name: 'bogus' }, { name: 'bogus' }, { name: '  ' }, {}] });
    const noSlots = nd('o2', 'object', { className: 'Kid' });
    const enumObj = nd('o3', 'object', { className: 'E', slots: [{ name: 'q' }] });
    const noClass = nd('o4', 'object', { slots: [{ name: 'q' }] });
    const probs = lintPage(page([base, kid, cls('E', { kind: 'enum' }), o, noSlots, enumObj, noClass], [ue('1', 'Kid', 'Base', 'inheritance'), ue('2', 'Kid', 'Kid', 'association'), ue('3', 'Base', 'Kid', 'inheritance')])).filter((x) => x.rule === 'uml/object-unknown-slot');
    expect(probs.map((p) => p.id)).toEqual(['uml/object-unknown-slot:o:bogus']);
    const mid = lintPage(page([cls('Top', { attributes: [{ name: 'a' }] }), cls('Mid'), cls('Leaf'), nd('x', 'object', { className: 'Leaf', slots: [{ name: 'a' }, { name: 'b' }] })], [ue('1', 'Leaf', 'Mid', 'inheritance'), ue('2', 'Mid', 'Top', 'inheritance')])).filter((x) => x.rule === 'uml/object-unknown-slot');
    expect(mid.map((p) => p.id)).toEqual(['uml/object-unknown-slot:x:b']);
  });
});

describe('ordering', () => {
  it('duplicate node ids give duplicate problem ids without crashing the sort', () => {
    const probs = lintPage(page([nd('t', 'table', { label: 'AA', columns: [] }), nd('t', 'table', { label: 'BB', columns: [] })])).filter((x) => x.rule === 'erd/naming');
    expect(probs.map((x) => x.id)).toEqual(['erd/naming:t', 'erd/naming:t']);
  });
  it('same rule problems sort by id ascending regardless of node order', () => {
    const mk = (ids: string[]) => page(ids.map((i) => nd(i, 'table', { label: i.toUpperCase(), columns: [] })));
    for (const order of [['b', 'a', 'c'], ['a', 'b', 'c'], ['c', 'b', 'a']]) {
      const naming = lintPage(mk(order)).filter((x) => x.rule === 'erd/naming').map((x) => x.id);
      expect(naming).toEqual(['erd/naming:a', 'erd/naming:b', 'erd/naming:c']);
    }
  });
});
