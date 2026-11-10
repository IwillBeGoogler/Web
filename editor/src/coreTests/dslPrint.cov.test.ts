import { describe, expect, it } from 'vitest';
import { printPage, parseDsl, applyDsl } from '@core/dsl';
import { ownedArchEdges, ownedArchNodes, relationOps } from '@core/dsl/print';
import { actLabelDefault, isImpliedAssembly, memberLine, printObjects, printTiming, ownedPkgEdges } from '@core/dsl/print2';
import type { CEdge, CNode, CPage } from '@core/types';

const n = (id: string, type: string, data: any = {}, extra: any = {}): CNode => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, ...data }, ...extra });
const e = (id: string, source: string, target: string, extra: any = {}): CEdge => ({ id, source, target, ...extra });
const page = (nodes: CNode[], edges: CEdge[] = [], name = 'P'): CPage => ({ id: 'p', name, nodes, edges });
const lines = (p: CPage, title?: string) => printPage(p, title).split('\n');

describe('print arch', () => {
  it('owned nodes: skips non icon/group, variant groups, cycles, missing parents', () => {
    const p = page([
      n('a', 'icon'), n('g', 'group'), n('k', 'icon', {}, { parentId: 'g' }), n('t', 'table'), n('pk', 'group', { variant: 'package' }),
      n('orphan', 'icon', {}, { parentId: 'nope' }), n('c1', 'icon', {}, { parentId: 'c2' }), n('c2', 'icon', {}, { parentId: 'c1' }), n('under', 'icon', {}, { parentId: 't' }),
      n('gv', 'group', { variant: 'weird' }),
    ]);
    expect(ownedArchNodes(p).map((x) => x.id)).toEqual(['a', 'g', 'k', 'gv']);
  });
  it('prints nodes, groups, attrs and edges', () => {
    const p = page(
      [n('g', 'group', { label: 'G', groupIcon: 'aws-group-vpc' }), n('a b', 'icon', { label: 'A "q"', iconId: 'aws ec2', subtitle: 'sub' }, { parentId: 'g' }), n('b', 'icon', { label: undefined }), n('c', 'icon'), n('d', 'icon'), n('e', 'icon'), n('f', 'icon'), n('x', 'icon')],
      [
        e('1', 'a b', 'b', { label: 'L', data: { arrows: 'none', preset: 'sync', color: 'red' } }),
        e('2', 'b', 'c', { data: { arrows: 'both', dashed: true } }),
        e('3', 'c', 'd', { data: { arrows: 'start', strokeStyle: 'dashed' } }),
        e('4', 'd', 'e', { data: { arrows: 'end', color: '#fff' } }),
        e('5', 'e', 'f'),
        e('6', 'f', 'x', { data: { relation: {} } }),
        e('7', 'f', 'x', { data: { uml: { kind: 'x' } } }),
        e('8', 'f', 'nope'),
      ],
    );
    const t = printPage(p, 'T "1"');
    expect(t).toContain('diagram "T \\"1\\""');
    expect(t).toContain('group g "G" icon=aws-group-vpc {\n  node "a b" "A \\"q\\"" icon="aws ec2" sub="sub"\n}');
    expect(t).toContain('node b ""');
    expect(t).toContain('"a b" -- b "L" preset=sync');
    expect(t).not.toContain('color=red');
    expect(t).toContain('b <-> c dashed');
    expect(t).toContain('c <- d dashed');
    expect(t).toContain('d -> e color=#fff');
    expect(t).toContain('e -> f\n');
    expect(ownedArchEdges(p).map((x) => x.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(t.endsWith('\n')).toBe(true);
    expect(printPage(page([], [], 'Name')).split('\n').slice(0, 2)).toEqual(['#!sdd 1', 'diagram "Name"']);
    expect(printPage(page([n('a', 'icon')]))).not.toContain('\n\n\n');
    expect(printPage(page([n('a', 'icon', { iconId: 5 })], []))).toContain('icon=5');
  });
});

describe('print tables', () => {
  const col = (id: string, name: string, extra: any = {}) => ({ id, name, type: 'int', pk: false, unique: false, nullable: true, ...extra });
  const tbl = (id: string, label: string, columns: any[], extra: any = {}) => n(id, 'table', { label, columns, ...extra });
  it('prints columns with attributes, enum, view, indexes and refs', () => {
    const users = tbl('u', 'users', [col('1', 'id', { pk: true, generated: 'identity' }), col('2', 'email', { type: 'text', nullable: false, unique: true, default: "a b", comment: 'n"x' }), col('3', 'n', { type: '', default: 'now()' }), col('4', 'z', { default: '' }), col('5', 'inc', { generated: 'autoincrement' }), col('6', 'p', { pk: true, unique: true, nullable: false })], { indexes: [{ columns: ['email'], unique: true }, { columns: ['id', 'email'], name: 'ix' }, { columns: ['id'] }] });
    const posts = tbl('p', 'posts', [col('1', 'id', { pk: true }), col('2', 'user_id', { fk: { table: 'users', column: 'id' } }), col('3', 'x'), col('4', 'y', { fk: { table: 'other', column: 'id' } }), col('5', 'comp')]);
    const en = tbl('e', 'role', [{ id: '1', name: 'admin' }], { tableKind: 'enum' });
    const vw = tbl('v', 'vw', [col('1', 'a')], { tableKind: 'view' });
    const bare = n('b', 'table', { label: 'bare' });
    const rel = (src: string, tgt: string, from: string, to: string, card: string, extra: any = {}) => e(`${src}${tgt}${from}${to}`, src, tgt, { data: { relation: { fromCol: from, toCol: to, cardinality: card, ...extra } } });
    const edges = [
      rel('u', 'p', '1', '2', '1:N'),
      rel('u', 'p', '1', '3', '1:N'),
      rel('u', 'p', '1', '4', '1:1'),
      rel('u', 'p', '1', '5', 'N:M'),
      rel('u', 'p', '1', '1', 'N:1'),
      rel('u', 'p', '1', '1', '1:1'),
      rel('u', 'p', '1', 'zz', '1:N'),
      rel('u', 'p', 'zz', '1', '1:N'),
      rel('u', 'p', '1', '5', '1:N', { group: 'g' }),
      rel('u', 'p', '1', '5', 'weird'),
      rel('u', 'e', '1', '1', '1:N'),
      e('nope', 'zz', 'p', { data: { relation: {} } }),
      e('nope2', 'u', 'zz', { data: { relation: {} } }),
    ];
    const text = printPage(page([users, posts, en, vw, bare], edges));
    expect(text).toContain('table users {\n  id int [pk, increment]');
    expect(text).toContain('email text [not null, unique, default: "a b", note: "n\\"x"]');
    expect(text).toContain('n text [default: now()]');
    expect(text).toContain('\n  z int\n');
    expect(text).toContain('inc int [increment]');
    expect(text).toContain('p int [pk]');
    expect(text).toContain('user_id int [ref: > users.id]');
    expect(text).toContain('enum role {\n  admin\n}');
    expect(text).toContain('view vw {');
    expect(text).toContain('table bare {\n}');
    expect(text).toContain('indexes {\n    email [unique]\n    (id, email) [name: "ix"]\n    id\n  }');
    expect(text).toContain('ref: posts.x > users.id');
    expect(text).toContain('ref: posts.id > users.id');
    expect(text).toContain('ref: posts.id - users.id');
    expect(text).toContain('// relation users > posts has no columns; not expressible');
    expect(text).toContain('ref: posts.y - users.id');
    // N:M with real columns
    const ops = relationOps(page([users, posts], [rel('u', 'p', '1', '5', 'N:M')]));
    expect(ops[0].op).toBe('<>');
    expect(ops[0].inline).toBe(false);
    expect(printPage(page([users, posts], [rel('u', 'p', '1', '2', '1:N')]))).not.toContain('ref: posts');
    expect(relationOps(page([], [e('x', 'a', 'b', { data: {} })]))).toEqual([]);
    expect(relationOps(page([users, { ...posts, data: { label: 'posts' } }], [rel('u', 'p', '1', '2', '1:N')]))[0].childCol).toBeUndefined();
    expect(relationOps(page([{ ...users, data: { label: 'users' } }, posts], [rel('u', 'p', '1', '2', '1:N')]))[0].parentCol).toBeUndefined();
  });
});

describe('print sequence', () => {
  it('prints all item types', () => {
    const seq = n('s', 'sequence', {
      label: 'Flow', autonumber: true,
      participants: [{ id: 'a', name: 'a', kind: 'actor' }, { id: 'b', name: 'B svc', kind: 'database', modelId: 'm1' }],
      items: [
        { type: 'message', from: 'a', to: 'b', text: 'hi', kind: 'sync' },
        { type: 'message', from: 'a', to: 'b', text: '', kind: 'async' },
        { type: 'message', from: 'b', to: 'a', text: 'r', kind: 'return' },
        { type: 'message', from: 'a', to: 'b', text: 'c', kind: 'create' },
        { type: 'message', from: 'a', to: 'b', text: 'd', kind: 'destroy' },
        { type: 'message', from: 'a', to: 'b', text: 'u', kind: 'unknown' },
        { type: 'note', side: 'left', over: ['a'], text: 'nl' },
        { type: 'note', side: 'right', over: ['a'], text: 'nr' },
        { type: 'note', over: ['a', 'b'], text: 'no' },
        { type: 'fragment', op: 'alt', sections: [{ guard: 'g1', items: [{ type: 'message', from: 'a', to: 'b', text: 'x', kind: 'sync' }] }, { guard: '', items: [] }] },
        { type: 'fragment', op: 'par', sections: [{ guard: '', items: [] }, { guard: 'k', items: [] }] },
        { type: 'fragment', op: 'critical', sections: [{ guard: '', items: [] }, { guard: '', items: [] }] },
      ],
    });
    const t = printPage(page([seq]));
    expect(t).toContain('seq s "Flow" {\n  autonumber\n  actor a\n  database b as "B svc" model=m1');
    expect(t).toContain('a -> b: hi\n  a ->> b\n  b --> a: r\n  a -->> b: c\n  a -x b: d\n  a -> b: u');
    expect(t).toContain('note left of a: nl\n  note right of a: nr\n  note over a, b: no');
    expect(t).toContain('alt g1\n    a -> b: x\n  else\n  end');
    expect(t).toContain('par\n  and k\n  end');
    expect(t).toContain('critical\n  option\n  end');
    const bare = printPage(page([n('q', 'sequence', { label: undefined as any })]));
    expect(bare).toContain('seq q "Sequence" {\n}');
    expect(parseDsl(t).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('print uml blocks (full data)', () => {
  const nodes: CNode[] = [
    n('pk', 'group', { label: 'Pkg', variant: 'package' }),
    n('pk2', 'group', { label: 'Pkg2', variant: 'package' }),
    n('C1', 'class', { label: 'Foo', kind: 'abstract', generics: 'T', stereotype: 'svc', archRef: { nodeId: 'x', fileId: 'f', pageId: 'pg' }, modelId: 'm 1', attributes: [{ name: 'a b', visibility: '+', static: true, type: 'int', default: '1' }, { name: 'z' }], operations: [{ name: 'op', abstract: true, visibility: '-', params: [{ name: 'p', type: 'int' }, { name: 'q' }], type: 'void' }, { name: 'op2' }, { name: 'we ird(', params: undefined }] }, { parentId: 'pk' }),
    n('C2', 'class', { label: 'Bar', kind: 'interface', archRef: { nodeId: 'x' } }),
    n('C3', 'class', { label: 'En', kind: 'enum', attributes: [{ name: 'A' }], operations: [{ name: 'ignored' }] }),
    n('C4', 'class', { label: 'Cl' }),
    n('C5', 'class', { label: 'Empty' }, { parentId: 'gone' }),
    n('S1', 'state', { label: 'S1', activity: 'do it' }),
    n('S2', 'state', { label: 'Second', stateKind: 'state' }),
    n('S3', 'state', { label: 'S3', stateKind: 'fork', vertical: true }),
    n('S4', 'state', { stateKind: 'join', vertical: false, label: '' }),
    n('SG', 'group', { label: 'Comp', variant: 'composite' }),
    n('SG2', 'group', { label: 'SG2', variant: 'composite' }),
    n('SC1', 'state', { label: 'in0' }, { parentId: 'SG' }),
    n('SC2', 'state', { label: 'in1', region: 2 }, { parentId: 'SG' }),
    n('U1', 'usecase', { label: 'Login', extensionPoints: ['ep1', 'ep2'] }),
    n('U2', 'usecase', { label: 'Out', ucKind: 'actor' }),
    n('U3', 'usecase', { label: 'Plain' }),
    n('UB', 'group', { label: 'Sys', variant: 'boundary' }),
    n('U4', 'usecase', { label: 'Inner' }, { parentId: 'UB' }),
    n('K1', 'component', { label: 'Comp1', compKind: 'node', stereotype: 'x y', archRef: { nodeId: 'r', pageId: 'pp' }, ports: [{ id: 'pa', name: 'api', kind: 'provided' }, { id: 'pb', name: 'db', kind: 'required' }] }),
    n('K2', 'component', { label: 'Comp2', ports: [{ id: 'q1', name: 'api', kind: 'required' }, { id: 'q2', name: 'api', kind: 'provided' }] }),
    n('K3', 'component', { label: 'K3' }, { parentId: 'K1' }),
    n('KI', 'component', { label: 'iface', compKind: 'provided' }),
    n('A1', 'activity', { label: '', actKind: 'initial' }),
    n('A2', 'activity', { label: 'A2' }),
    n('A3', 'activity', { actKind: 'fork', vertical: true, label: '' }),
    n('A4', 'activity', { actKind: 'object', label: 'Obj', objectState: 'ok' }),
    n('A5', 'activity', { actKind: 'action', label: 'Do' }),
    n('LN', 'group', { label: 'Lane', variant: 'lane', laneOrient: 'h' }),
    n('LN2', 'group', { label: 'Lane2', variant: 'lane' }),
    n('A6', 'activity', { label: 'inlane' }, { parentId: 'LN' }),
    n('A7', 'icon', { label: 'foreign' }, { parentId: 'LN' }),
    n('D1', 'deployment', { label: 'Srv', depKind: 'device', stereotype: 'a', iconId: 'aws-ec2' }),
    n('D2', 'deployment', { label: 'Art' }, { parentId: 'D1' }),
    n('D3', 'deployment', { label: 'Other' }),
    n('O1', 'object', { label: 'O1', className: 'Cls', modelId: 'mm', slots: [{ name: 'a b', value: '1' }, { name: 'k', value: '' }] }),
    n('O2', 'object', { label: 'Two' }),
  ];
  const edges: CEdge[] = [
    e('c1', 'C1', 'C2', { label: 'l', data: { uml: { kind: 'inheritance', sourceMult: '1', targetMult: '*', sourceRole: 'r a', targetRole: 'rb' } } }),
    e('c2', 'C1', 'C3', { data: { uml: { kind: 'realization' } } }),
    e('c3', 'C1', 'C4', { data: { uml: { kind: 'composition' } } }),
    e('c4', 'C2', 'C4', { data: { uml: { kind: 'aggregation' } } }),
    e('c5', 'C2', 'C3', { data: { uml: { kind: 'dependency' } } }),
    e('c6', 'C3', 'C4', { data: { uml: { kind: 'association', directed: true } } }),
    e('c7', 'C4', 'C3', { data: { uml: { kind: 'association' } } }),
    e('t1', 'S1', 'S2', { label: 'go', data: { uml: { kind: 'transition' } } }),
    e('t2', 'S2', 'SG', { data: { uml: { kind: 'transition' } } }),
    e('u1', 'U2', 'U1', { data: { uml: { kind: 'association', sourceMult: '1', targetMult: '2' } } }),
    e('u2', 'U1', 'U3', { label: '«include»', data: { uml: { kind: 'include' } } }),
    e('u3', 'U1', 'U4', { label: 'mine', data: { uml: { kind: 'extend' } } }),
    e('u4', 'U3', 'U4', { data: { uml: { kind: 'generalization' } } }),
    e('k1', 'K1', 'K2', { label: 'uses', data: { uml: { kind: 'dependency' } } }),
    e('k2', 'K1', 'K2', { data: { uml: { kind: 'assembly' } } }),
    e('k3', 'K2', 'K1', { data: { uml: { kind: 'assembly', sourcePort: 'q1', targetPort: 'pa' } } }),
    e('a1', 'A1', 'A2', { data: { uml: { kind: 'transition' } } }),
    e('a2', 'A2', 'A4', { label: '[ok]', data: { uml: { kind: 'transition' } } }),
    e('a3', 'A5', 'A2', { label: 'ignored', data: { uml: { kind: 'note' } } }),
    e('d1', 'D1', 'D3', { data: { uml: { kind: 'communication' } } }),
    e('d2', 'D1', 'D3', { label: '«deploy»', data: { uml: { kind: 'deploy' } } }),
    e('d3', 'D2', 'D3', { label: 'mm', data: { uml: { kind: 'manifest' } } }),
    e('p1', 'pk', 'pk2', { data: { uml: { kind: 'import' } } }),
    e('p2', 'pk', 'pk2', { label: 'x', data: { uml: { kind: 'access' } } }),
    e('p3', 'pk', 'pk2', { data: { uml: { kind: 'merge' } } }),
    e('p4', 'pk', 'pk2', { label: '«dependency»', data: { uml: { kind: 'dependency' } } }),
    e('o1', 'O1', 'O2', { label: 'link', data: { uml: { kind: 'link', sourceRole: 'a', targetRole: 'b' } } }),
    e('o2', 'O2', 'O1', { data: { uml: { kind: 'link' } } }),
  ];
  const p = page(nodes, edges);
  const text = printPage(p);
  it('classes', () => {
    expect(text).toContain('package pk "Pkg" {\n    abstract class Foo<T> "svc" archRef=x archFile=f archPage=pg model="m 1" {');
    expect(text).toContain('+ static "a b": int = 1');
    expect(text).toContain('- abstract op(p: int, q): void');
    expect(text).toContain('    op2()\n');
    expect(text).toContain('"we ird("()');
    expect(text).toContain('interface Bar archRef=x\n');
    expect(text).toContain('enum En {\n    A\n  }');
    expect(text).toContain('\n  class Cl\n');
    expect(text).toContain('Foo --|> Bar "l" srcMult=1 dstMult=* srcRole="r a" dstRole=rb');
    expect(text).toContain('Foo ..|> En');
    expect(text).toContain('Foo --* Cl');
    expect(text).toContain('Bar --o Cl');
    expect(text).toContain('Bar ..> En');
    expect(text).toContain('En --> Cl');
    expect(text).toContain('Cl -- En');
  });
  it('states', () => {
    expect(text).toContain('state S1 activity="do it"');
    expect(text).toContain('state S2 "Second"');
    expect(text).toContain('fork S3 "S3" vertical');
    expect(text).toContain('join S4\n');
    expect(text).toContain('state SG "Comp" {\n    state SC1 "in0"\n    region\n    region\n    state SC2 "in1"\n  }');
    expect(text).toContain('state SG2 {');
    expect(text).toContain('S1 -> S2 "go"');
    expect(text).toContain('S2 -> SG\n');
  });
  it('usecases', () => {
    expect(text).toContain('usecase U1 "Login" {\n    point "ep1"\n    point "ep2"\n  }');
    expect(text).toContain('actor U2 "Out"');
    expect(text).toContain('usecase U3 "Plain"');
    expect(text).toContain('boundary UB "Sys" {\n    usecase U4 "Inner"\n  }');
    expect(text).toContain('U2 -- U1 srcMult=1 dstMult=2');
    expect(text).toContain('U1 include U3\n');
    expect(text).toContain('U1 extend U4 "mine"');
    expect(text).toContain('U3 generalizes U4');
  });
  it('components', () => {
    expect(text).toContain('node K1 "Comp1" stereotype="x y" archRef=r archPage=pp {\n    provides api\n    requires db\n    component K3 "K3"\n  }');
    expect(text).toContain('component K2 "Comp2" {');
    expect(text).toContain('K1 ..> K2 "uses"');
    expect(text).toContain('K1 -- K2\n');
    expect(text.match(/K2 -- K1/g)).toBeNull();
    expect(isImpliedAssembly(edges.find((x) => x.id === 'k3')!, new Map(nodes.map((x) => [x.id, x])))).toBe(true);
    expect(isImpliedAssembly(edges.find((x) => x.id === 'k2')!, new Map())).toBe(false);
    expect(isImpliedAssembly(e('z', 'a', 'b', { data: { uml: { kind: 'assembly', sourcePort: 'x', targetPort: 'y' } } }), new Map())).toBe(false);
    expect(isImpliedAssembly(e('z', 'K2', 'K1', { data: { uml: { kind: 'assembly', sourcePort: 'q2', targetPort: 'pa' } } }), new Map(nodes.map((x) => [x.id, x])))).toBe(false);
  });
  it('activity', () => {
    expect(text).toContain('initial A1\n');
    expect(text).toContain('action A2\n');
    expect(text).toContain('fork A3 vertical');
    expect(text).toContain('object A4 "Obj" state=ok');
    expect(text).toContain('action A5 "Do"');
    expect(text).toContain('lane LN "Lane" orient=h {\n    action A6 "inlane"\n  }');
    expect(text).toContain('lane LN2 "Lane2" {');
    expect(text).toContain('A1 -> A2\n');
    expect(text).toContain('A2 -> A4 "[ok]"');
    expect(text).toContain('A5 -- A2\n');
    expect(actLabelDefault('fork', 'x')).toBe('');
    expect(actLabelDefault('action', 'x')).toBe('x');
  });
  it('deployment, packages, objects', () => {
    expect(text).toContain('device D1 "Srv" stereotype=a icon=aws-ec2 {\n    node D2 "Art"\n  }');
    expect(text).toContain('D1 -- D3\n');
    expect(text).toContain('D1 ..> D3\n');
    expect(text).toContain('D2 manifests D3 "mm"');
    expect(text).toContain('pk imports pk2\n');
    expect(text).toContain('pk access pk2 "x"');
    expect(text).toContain('pk merges pk2\n');
    expect(text).toContain('pk ..> pk2\n');
    expect(ownedPkgEdges(p)).toHaveLength(4);
    expect(text).toContain('objects {\n  object O1 class=Cls model=mm {\n    "a b" = 1\n    k\n  }\n  object O2 "Two"');
    expect(text).toContain('O1 -- O2 "link" srcRole=a dstRole=b\n  O2 -- O1');
  });
  it('reparse has no errors', () => {
    expect(parseDsl(text).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
  it('defaults for missing data', () => {
    const t = printPage(page([
      n('S', 'state', { label: undefined as any }), n('SGX', 'group', { variant: 'composite', label: undefined as any }),
      n('U', 'usecase', { label: undefined as any }), n('UBX', 'group', { variant: 'boundary', label: undefined as any }),
      n('K', 'component', { label: undefined as any }), n('A', 'activity', { label: undefined as any }), n('LX', 'group', { variant: 'lane', label: undefined as any }),
      n('D', 'deployment', { label: undefined as any }), n('O', 'object', { label: undefined as any }), n('PX', 'group', { variant: 'package', label: undefined as any }),
      n('CL', 'class', { label: 'x', attributes: undefined, operations: undefined, kind: 'enum' }),
    ]));
    expect(t).toContain('state S\n');
    expect(t).toContain('state SGX {');
    expect(t).toContain('usecase U ""');
    expect(t).toContain('boundary UBX "" {');
    expect(t).toContain('component K ""');
    expect(t).toContain('action A ""');
    expect(t).toContain('lane LX ""');
    expect(t).toContain('node D ""');
    expect(t).toContain('object O ""');
    expect(t).toContain('package PX ""');
    expect(t).toContain('enum x\n');
  });
});

describe('print communication & timing', () => {
  it('communication messages sorted, back dir, async', () => {
    const nodes = [n('a', 'object'), n('b', 'object')];
    const edges = [
      e('1', 'a', 'b', { data: { uml: { kind: 'link', messages: [{ seq: '2', text: 'second', async: true }, { seq: '1.2', text: '' }, { seq: '1', dir: 'back', text: 'back' }, { seq: '1.1', text: 'x', dir: 'fwd' }] } } }),
      e('2', 'b', 'a', { data: { uml: { kind: 'link', messages: [{ seq: '1' }], sourceRole: 'r' } } }),
      e('3', 'a', 'b', { data: { uml: { kind: 'link', messages: [{ seq: '1.1.1' }] } } }),
    ];
    const out: string[] = [];
    printObjects(page(nodes, edges), out);
    const t = out.join('\n');
    expect(t).toContain('communication {');
    expect(t).toContain('b -- a srcRole=r');
    const msgs = t.split('\n').filter((l) => /^ {2}[\d.]+ /.test(l));
    expect(msgs).toEqual(['  1 b -> a "back"', '  1 b -> a', '  1.1 a -> b "x"', '  1.1.1 a -> b', '  1.2 a -> b', '  2 a -> b "second" async']);
    const o2: string[] = [];
    printObjects(page([n('x', 'icon')]), o2);
    expect(o2).toEqual([]);
  });
  it('timing printer', () => {
    const out: string[] = [];
    printTiming(page([
      n('t', 'timing', {
        label: 'T', unit: 'ms', end: 12.34567,
        lifelines: [{ id: 'a', name: 'a', kind: 'robust', states: ['X', 'a b'] }, { id: 'b', name: 'Bee', kind: 'concise', states: [] }, { id: 'c', name: 'c', kind: 'clock', period: 2.5 }, { id: 'd', name: 'd', kind: 'binary', states: ['x'] }, { id: 'e', name: 'e', kind: 'clock' }],
        changes: [{ life: 'b', t: 5, state: 'S 1' }, { life: 'a', t: 5, state: 'X' }, { life: 'a', t: 1, state: 'Y' }, { life: 'zz', t: 5, state: 'W' }, { life: 'a', t: 5, state: 'X2' }],
        messages: [{ from: 'a', to: 'b', t: 3, t2: 4, text: 'm' }, { from: 'b', to: 'a', t: 1, t2: 1 }, { from: 'b', to: 'a', t: 2 }],
        durations: [{ life: 'a', t1: 0, t2: 1, text: 'k' }, { life: 'a', t1: 1, t2: 2 }],
      }),
      n('t2', 'timing', { label: undefined as any }),
      n('i', 'icon'),
    ]), out);
    const t = out.join('\n');
    expect(t).toContain('timing t "T" {\n  unit ms\n  end 12.346');
    expect(t).toContain('robust a states X, "a b"');
    expect(t).toContain('concise b "Bee"\n');
    expect(t).toContain('clock c period=2.5');
    expect(t).toContain('binary d\n');
    expect(t).toContain('clock e\n');
    expect(t.indexOf('a @1 Y')).toBeLessThan(t.indexOf('a @5 X\n'));
    expect(t.indexOf('a @5 X\n')).toBeLessThan(t.indexOf('b @5 "S 1"'));
    expect(t.indexOf('b @5 "S 1"')).toBeLessThan(t.indexOf('zz @5 W') + 1000);
    expect(t).toContain('a -> b @3..4 "m"');
    expect(t).toContain('b -> a @1\n');
    expect(t).toContain('a 0..1 "k"');
    expect(t).toContain('a 1..2\n');
    expect(t).toContain('timing t2 "Timing" {\n  end 100\n}');
  });
  it('memberLine', () => {
    expect(memberLine({ name: 'x', visibility: '#' }, false)).toBe('# x');
    expect(memberLine({ name: 'x', type: 'T', default: 'd' }, false)).toBe('x: T = d');
    expect(memberLine({ name: 'f', params: [] }, true)).toBe('f()');
  });
  it('applyDsl roundtrip of printed text is stable', () => {
    const r1 = applyDsl(undefined, 'diagram "x"\nnode a "A"\nnode b "B"\na -> b "go"\n');
    const t1 = printPage(r1.page);
    const r2 = applyDsl(undefined, t1);
    expect(printPage(r2.page)).toBe(t1);
  });
});

describe('print edge shapes', () => {
  it('cycles leave no roots; empty containers; odd items', () => {
    const cyc = (type: string, data: any = {}) => [n('x1', type, data, { parentId: 'x2' }), n('x2', type, data, { parentId: 'x1' })];
    const t = printPage(page([
      ...cyc('state'), ...cyc('component'), ...cyc('activity'), ...cyc('deployment'), ...cyc('class'), ...cyc('usecase'),
      n('sg', 'group', { variant: 'composite' }), n('s1', 'state', { region: 1 }, { parentId: 'sg' }), n('s2', 'state', {}, { parentId: 'sg' }), n('s3', 'state', { region: 1 }, { parentId: 'sg' }),
      n('g', 'group', { variant: 'package' }, { parentId: 'g' }), n('ge', 'group', { label: 'Empty' }),
    ]));
    expect(t).toContain('states {\n');
    expect(t).toContain('usecases {\n}');
    expect(printPage(page([n('y1', 'state', {}, { parentId: 'y2' }), n('y2', 'state', {}, { parentId: 'y1' })]))).toContain('states {\n}');
    expect(t).toContain('components {\n}');
    expect(t).toContain('activity {\n}');
    expect(t).toContain('deployment {\n}');
    expect(t).toContain('classes {\n}');
    expect(t).toContain('group ge "Empty" {\n}');
  });
  it('misc branches', () => {
    const col = (id: string, name: string, extra: any = {}) => ({ id, name, type: 'int', pk: false, unique: false, nullable: true, ...extra });
    const tb = (id: string, label: string, columns: any[]) => n(id, 'table', { label, columns });
    const rel = (card: string, from: string, to: string) => e('r', 'u', 'p', { data: { relation: { fromCol: from, toCol: to, cardinality: card } } });
    const u = tb('u', 'users', [col('1', 'id')]);
    const p = tb('p', 'posts', [col('2', 'uid', { fk: { table: 'users', column: 'id' } }), col('3', 'o', { fk: { table: 'other', column: 'id' } })]);
    const ops = (card: string, to: string) => relationOps(page([u, p], [rel(card, '1', to)]))[0];
    expect(ops('N:1', '2').inline).toBe(false);
    expect(ops('1:N', '3').inline).toBe(false);
    expect(ops('1:N', '2').inline).toBe(true);
    expect(printPage(page([u, p], [rel('weird', 'x', 'y')]))).toContain('// relation users <> posts has no columns');
    // unknown seq item type is skipped
    expect(printPage(page([n('s', 'sequence', { label: 'S', participants: [], items: [{ type: 'bogus' }, { type: 'fragment', op: 'opt', sections: [{ guard: '', items: [] }] }] })]))).toContain('seq s "S" {\n  opt\n  end\n}');
    // state vertical flag only for fork/join
    expect(printPage(page([n('st', 'state', { vertical: true, label: 'st' })]))).not.toContain('vertical');
    expect(printPage(page([n('st', 'state', { vertical: true, label: 'st', stateKind: 'join' })]))).toContain('join st "st" vertical');
    // component ports one-sided
    const t = printPage(page([n('k1', 'component', { ports: [{ id: 'a', name: 'p', kind: 'provided' }] }), n('k2', 'component', { ports: [{ id: 'a', name: 'r', kind: 'required' }] })]));
    expect(t).toContain('provides p');
    expect(t).not.toContain('requires p');
    expect(t).toContain('requires r');
    // lane inside lane keeps only activities directly, nested lanes recurse
    const lt = printPage(page([n('l1', 'group', { variant: 'lane', label: 'L1' }), n('l2', 'group', { variant: 'lane', label: 'L2' }, { parentId: 'l1' })]));
    expect(lt).toContain('lane l1 "L1" {\n  }');
    // comm: link without messages alongside
    const out: string[] = [];
    printObjects(page([n('a', 'object'), n('b', 'object')], [e('1', 'a', 'b', { data: { uml: { kind: 'link', messages: [{ seq: '1', text: 't' }] } } }), e('2', 'a', 'b', { data: { uml: { kind: 'link' } } })]), out);
    expect(out.join('\n')).toContain('1 a -> b "t"');
    // timing robust without states
    const tm: string[] = [];
    printTiming(page([n('t', 'timing', { label: 'T', lifelines: [{ id: 'a', name: 'a', kind: 'robust' }] })]), tm);
    expect(tm.join('\n')).toContain('robust a\n');
  });
});
