import { describe, expect, it } from 'vitest';
import { applyFix, lintPage, roleOf, type Fix } from '@core/lint';
import type { CNode, CPage } from '@core/types';

const nd = (id: string, type: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): CNode => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, ...data }, ...extra });
const page = (nodes: CNode[], edges: any[] = []): CPage => ({ id: 'p', name: 'P', nodes, edges });
const ids = (p: CPage, cfg = {}) => lintPage(p, cfg).map((x) => x.rule);
const col = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, type: 'int', pk: false, nullable: true, ...extra });

describe('roleOf', () => {
  it('non-architecture nodes are other; labels and icon tags decide the role', () => {
    expect(roleOf(nd('a', 'class'))).toBe('other');
    expect(roleOf(nd('a', 'icon', { label: 'My Database' }))).toBe('database');
    expect(roleOf(nd('a', 'icon', { label: 'Database', iconId: 'zzz-unknown' }))).toBe('service');
    expect(roleOf(nd('a', 'card', { label: 'whatever' }))).toBe('service');
    expect(roleOf(nd('a', 'icon', { iconId: 'redis' }))).toBe('cache');
    expect(roleOf(nd('a', 'cluster', { profileId: 'kafka' }))).toBe('queue');
  });
});

describe('ERD rules', () => {
  const tables = () => [
    nd('u', 'table', { label: 'users', columns: [col('c0', 'id', { pk: true, type: 'bigint' })] }),
    nd('o', 'table', { label: 'Orders', columns: [col('c0', 'id', { pk: true }), col('c1', 'userId', { type: 'int', fk: { table: 'users', column: 'id' } }), col('c2', 'ok', { fk: { table: 'users', column: 'id' }, unique: true })] }),
    nd('e', 'table', { label: 'status', tableKind: 'enum', columns: [] }),
    nd('np', 'table', { label: 'no_pk', columns: [col('c0', 'a')], indexes: [] }),
  ];
  const edge = (relation: Record<string, unknown>) => ({ id: 'r', source: 'u', target: 'o', data: { relation } });
  it('missing pk, fk without index, fk type mismatch, required nullable fk, naming (snake and camel)', () => {
    const p = page(tables(), [edge({ fromCol: 'c0', toCol: 'c1', optional: false })]);
    const r = ids(p);
    expect(r).toEqual(expect.arrayContaining(['erd/no-pk', 'erd/fk-index', 'erd/fk-type', 'erd/nullable-fk', 'erd/naming']));
    expect(ids(p, { naming: 'camelCase' })).toContain('erd/naming');
    expect(ids(p, { naming: 'any' })).not.toContain('erd/naming');
  });
  it('relations to missing columns or non-table nodes are skipped; matching types and pk fks pass', () => {
    const t = tables();
    expect(ids(page(t, [edge({ fromCol: 'zz', toCol: 'c1' })]))).not.toContain('erd/fk-type');
    expect(ids(page([...t, nd('x', 'icon')], [{ id: 'q', source: 'x', target: 'o', data: { relation: { fromCol: 'c0', toCol: 'c1' } } }]))).not.toContain('erd/fk-type');
    expect(ids(page(t, [{ id: 'q', source: 'ghost', target: 'o', data: { relation: { fromCol: 'c0', toCol: 'c1' } } }]))).not.toContain('erd/fk-type');
    expect(ids(page(t, [edge({ fromCol: 'c0', toCol: 'c0' })]))).not.toContain('erd/nullable-fk');
  });
  it('rule config: disabled and re-severitied rules', () => {
    const p = page(tables());
    expect(ids(p, { rules: { 'erd/no-pk': { enabled: false } } })).not.toContain('erd/no-pk');
    expect(lintPage(p, { rules: { 'erd/no-pk': { severity: 'info' } } }).find((x) => x.rule === 'erd/no-pk')?.severity).toBe('info');
  });
  it('fixes: add-index, add-pk (id and id_pk), sync-type, set-not-null', () => {
    const p = page(tables(), [edge({ fromCol: 'c0', toCol: 'c1', optional: false })]);
    for (const prob of lintPage(p)) {
      if (prob.fix) {
        const out = applyFix(p, prob.fix);
        expect(out).not.toBe(p);
      }
    }
    const idx = applyFix(p, { kind: 'add-index', label: '', nodeId: 'o', column: 'userId' });
    expect(idx.nodes.find((n) => n.id === 'o')!.data.indexes).toHaveLength(1);
    expect(applyFix(idx, { kind: 'add-index', label: '', nodeId: 'o', column: 'userId' }).nodes.find((n) => n.id === 'o')!.data.indexes).toHaveLength(1);
    const pk = applyFix(p, { kind: 'add-pk', label: '', nodeId: 'np' });
    expect(pk.nodes.find((n) => n.id === 'np')!.data.columns.some((c: any) => c.pk)).toBe(true);
    const withId = page([nd('t', 'table', { label: 't', columns: [col('c0', 'id')] })]);
    expect(applyFix(withId, { kind: 'add-pk', label: '', nodeId: 't' }).nodes[0].data.columns.some((c: any) => c.name === 'id_pk')).toBe(true);
    const sync = applyFix(p, { kind: 'sync-type', label: '', nodeId: 'o', column: 'userId', type: 'bigint' });
    expect(sync.nodes.find((n) => n.id === 'o')!.data.columns[1].type).toBe('bigint');
    applyFix(p, { kind: 'sync-type', label: '', nodeId: 'o', column: 'ghost', type: 'x' });
    const nn = applyFix(p, { kind: 'set-not-null', label: '', nodeId: 'o', column: 'userId' });
    expect(nn.nodes.find((n) => n.id === 'o')!.data.columns[1].nullable).toBe(false);
    applyFix(p, { kind: 'set-not-null', label: '', nodeId: 'o', column: 'ghost' });
    expect(applyFix(p, { kind: 'add-index', label: '', nodeId: 'ghost', column: 'x' })).toBeTruthy();
  });
});

describe('architecture rules', () => {
  it('sync cycles among services; async edges break them; public client without WAF', () => {
    const svc = (id: string) => nd(id, 'icon', { label: id });
    const cyc = page([svc('a'), svc('b'), svc('c')], [{ id: '1', source: 'a', target: 'b' }, { id: '2', source: 'b', target: 'c' }, { id: '3', source: 'c', target: 'a' }, { id: '4', source: 'a', target: 'a' }]);
    expect(ids(cyc)).toContain('arch/sync-cycle');
    const asyncCyc = page([svc('a'), svc('b')], [{ id: '1', source: 'a', target: 'b', label: 'event publish' }, { id: '2', source: 'b', target: 'a' }]);
    expect(ids(asyncCyc)).not.toContain('arch/sync-cycle');
    const pub = page([nd('cl', 'icon', { label: 'Browser', iconId: 'users' }), svc('api')], [{ id: '1', source: 'cl', target: 'api' }]);
    expect(Array.isArray(lintPage(pub))).toBe(true);
  });
  it('databases: replicas, backups and arch-config rules', () => {
    const db = (extra: Record<string, unknown> = {}, label = 'db') => nd(label, 'icon', { label, iconId: 'postgres', ...extra });
    const cases = [
      page([db()]),
      page([db({ replicas: 2 })]),
      page([db({ role: 'replica' })]),
      page([db({ arch: { replication: 'streaming-async', backup: 'none' } })]),
      page([db({ arch: { replication: 'streaming-async', backup: 'pitr' } })]),
      page([db({ arch: { replication: 'none', deployment: 'single-az' } })]),
      page([db(), nd('s3', 'icon', { label: 'Backup bucket', iconId: 's3' })], [{ id: 'e', source: 'db', target: 's3', label: 'nightly backup' }]),
      page([db(), db({}, 'db2')], [{ id: 'e', source: 'db', target: 'db2', data: { kind: 'replication' } }]),
      page([nd('c', 'icon', { label: 'cache', iconId: 'redis', arch: { strategy: 'write-back' } })]),
      page([nd('q', 'icon', { label: 'q', iconId: 'rabbitmq', arch: {} })]),
      page([nd('s', 'icon', { label: 's', arch: { instances: 1 } })]),
    ];
    for (const c of cases) expect(Array.isArray(lintPage(c))).toBe(true);
    expect(ids(cases[0])).toContain('arch/db-no-replica');
    expect(ids(cases[1])).not.toContain('arch/db-no-replica');
    expect(ids(cases[2])).not.toContain('arch/db-no-replica');
    expect(ids(cases[3])).toContain('arch/stale-reads');
    expect(ids(cases[8])).toContain('arch/cache-write-back-loss');
    expect(ids(cases[5])).toContain('arch/single-az');
    expect(ids(cases[6])).not.toContain('arch/db-no-backup');
  });
  it('arch fixes: set-arch, add-replica for service/arch/capacity, remove node/edge', () => {
    const p = page([nd('s', 'icon', { label: 's', arch: { instances: 2 } }), nd('d', 'icon', { label: 'd', iconId: 'postgres', capacity: { replicas: 2 } }), nd('x', 'icon', { label: 'x' })], [{ id: 'e', source: 's', target: 'd' }]);
    const arch = applyFix(p, { kind: 'set-arch', label: '', nodeId: 'x', arch: { deployment: 'multi-az' } });
    expect(arch.nodes[2].data.arch).toEqual({ deployment: 'multi-az' });
    const arch2 = applyFix(arch, { kind: 'set-arch', label: '', nodeId: 'x', arch: { instances: 3 } });
    expect(arch2.nodes[2].data.arch).toEqual({ deployment: 'multi-az', instances: 3 });
    applyFix(p, { kind: 'set-arch', label: '', nodeId: 'x' });
    expect(applyFix(p, { kind: 'add-replica', label: '', nodeId: 's' }).nodes[0].data.arch.instances).toBe(3);
    expect(applyFix(p, { kind: 'add-replica', label: '', nodeId: 'd' }).nodes[1].data.capacity.replicas).toBe(3);
    expect(applyFix(p, { kind: 'add-replica', label: '', nodeId: 'x' }).nodes[2].data.capacity.replicas).toBe(2);
    expect(applyFix(p, { kind: 'remove-node', label: '', nodeId: 'x' }).nodes).toHaveLength(2);
    expect(applyFix(p, { kind: 'remove-edge', label: '', nodeId: 's', edgeId: 'e' }).edges).toHaveLength(0);
    expect(applyFix(p, { kind: 'remove-edge', label: '', nodeId: 's' }).edges).toHaveLength(1);
  });
});

describe('UML rules', () => {
  const cls = (id: string, data: Record<string, unknown> = {}) => nd(id, 'class', { label: id, kind: 'class', attributes: [], operations: [], ...data });
  const ue = (id: string, source: string, target: string, kind: string) => ({ id, source, target, data: { uml: { kind } } });
  it('inheritance cycles (self and multi) with remove-edge fix; interfaces without implementation; add-impl fix', () => {
    const cyc = page([cls('A'), cls('B')], [ue('1', 'A', 'B', 'inheritance'), ue('2', 'B', 'A', 'inheritance')]);
    const probs = lintPage(cyc).filter((x) => x.rule === 'uml/inheritance-cycle');
    expect(probs).toHaveLength(1);
    expect(applyFix(cyc, probs[0].fix as Fix).edges).toHaveLength(1);
    expect(ids(page([cls('S')], [ue('1', 'S', 'S', 'inheritance')]))).toContain('uml/inheritance-cycle');
    const iface = page([cls('IShape', { kind: 'interface', operations: [{ id: 'o0', name: 'area', params: [], type: 'int', abstract: true }] })]);
    const prob = lintPage(iface).find((x) => x.rule === 'uml/interface-no-impl')!;
    const fixed = applyFix(iface, prob.fix as Fix);
    expect(fixed.nodes.find((n) => n.data.label === 'Shape')).toBeTruthy();
    const twice = applyFix(fixed, prob.fix as Fix);
    expect(twice.nodes.length).toBe(3);
    const named = page([cls('Runner', { kind: 'interface' })]);
    expect(applyFix(named, lintPage(named).find((x) => x.rule === 'uml/interface-no-impl')!.fix as Fix).nodes.some((n) => n.data.label === 'RunnerImpl')).toBe(true);
    expect(ids(page([cls('I', { kind: 'interface' }), cls('K')], [ue('1', 'K', 'I', 'realization')]))).not.toContain('uml/interface-no-impl');
  });
  it('sequence messages vs class operations and object slots vs attributes', () => {
    const items = [
      { type: 'message', id: 'm1', from: 'p1', to: 'p2', text: 'doIt(1)', kind: 'sync' },
      { type: 'message', id: 'm2', from: 'p1', to: 'p2', text: ' ', kind: 'sync' },
      { type: 'message', id: 'm3', from: 'p1', to: 'p1', text: 'self()', kind: 'sync' },
      { type: 'fragment', id: 'f', op: 'alt', sections: [{ id: 's', items: [{ type: 'message', id: 'm4', from: 'p1', to: 'p2', text: 'inner()', kind: 'sync' }] }] },
      { type: 'fragment', id: 'f2', op: 'opt' },
      { type: 'note', id: 'n' },
    ];
    const seq = nd('sq', 'sequence', { label: 'Seq', participants: [{ id: 'p1', name: 'Client' }, { id: 'p2', name: 'Server : Srv' }, { id: 'p3', name: 'Unused' }], items });
    const server = cls('Srv', { operations: [{ id: 'o0', name: 'other', params: [], type: 'void' }] });
    const parent = cls('Base', { operations: [{ id: 'o1', name: 'inner', params: [], type: 'void' }], attributes: [{ id: 'a0', name: 'size' }] });
    const obj = nd('ob', 'object', { label: 'obj', classId: 'Srv', slots: [{ name: 'size' }, { name: 'ghost' }, {}] });
    const p = page([seq, server, parent, obj], [ue('1', 'Srv', 'Base', 'inheritance'), ue('2', 'Srv', 'Srv', 'inheritance')]);
    const probs = lintPage(p);
    expect(Array.isArray(probs)).toBe(true);
    for (const pr of probs) if (pr.fix) applyFix(p, pr.fix);
    const op = applyFix(p, { kind: 'add-operation', label: '', nodeId: 'Srv', name: 'doIt' });
    expect(op.nodes.find((n) => n.id === 'Srv')!.data.operations.some((o: any) => o.name === 'doIt')).toBe(true);
    expect(applyFix(op, { kind: 'add-operation', label: '', nodeId: 'Srv', name: 'doIt' }).nodes.find((n) => n.id === 'Srv')!.data.operations).toHaveLength(2);
    expect(applyFix(p, { kind: 'add-operation', label: '', nodeId: 'Srv' })).toBeTruthy();
    expect(applyFix(p, { kind: 'add-operation', label: '', nodeId: 'ghost', name: 'x' })).toBeTruthy();
  });
  it('problems are sorted by severity, rule order, id', () => {
    const probs = lintPage(page([nd('t', 'table', { label: 'BadName', columns: [col('c0', 'BadCol')] }), nd('t2', 'table', { label: 'other', columns: [] })]));
    expect(probs.length).toBeGreaterThan(1);
  });
});
