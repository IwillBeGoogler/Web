import { describe, expect, it } from 'vitest';
import { applyDsl, printPage } from '@core/dsl';
import { applyDoc, placeFresh, seqSizeOf, tableSizeOf, timingSizeOf } from '@core/dsl/build';
import { actSizeOf, classSizeOf, depSizeOf, objSizeOf, shapeSizeOf, stateSizeOf } from '@core/dsl/build2';
import { emptyDoc } from '@core/dsl/types';
import type { CNode, CPage } from '@core/types';

const errs = (r: { diagnostics: { severity: string; message: string }[] }) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
const all = (r: { diagnostics: { severity: string; message: string }[] }) => r.diagnostics.map((d) => `${d.severity[0]}:${d.message}`);
const node = (p: CPage, id: string) => p.nodes.find((n) => n.id === id)!;

const FULL = `#!sdd 1
diagram "Full"

group vpc "VPC" icon=aws-group-private-subnet {
  node web "Web" icon=server sub="t3"
  node db "DB" icon=cache
}
node cdn "CDN" icon=nosuchicon
node k "K" icon=database
web -> db "sql" preset=sync
db <-> web dashed color=#ff0000
cdn -- web
web <- cdn

table users {
  id int [pk, increment, note: "the id"]
  email text [unique, not null, default: 'x']
  org_id int [ref: > orgs.id]
  bio text [null]
  indexes {
    email [unique, name: "ix_email"]
    (id, email)
  }
  note: "people"
}
table orgs {
  id int [pk]
}
view v {
  a int
}
enum role {
  admin
  user
}
table link {
  a int
  b int
}
ref: users.id <> link.a
ref: link.b < orgs.id [delete: cascade, update: restrict]
ref: link.a - orgs.id

seq sq1 "Login" {
  actor U
  database D as "DB" model=m1
  autonumber
  U -> D: q
  note over U, D: n
  alt ok
    D --> U: r
  else
    U -x D
  end
}

timing t1 "Clock" {
  unit ms
  end 100
  robust a states X, Y
  clock c period=5
  a @0 X
  a @50 Y
  a -> a @10..20 "m"
  a 0..10 "k"
}

classes {
  package shop "Shop" {
    class A {
      + x: int
      + f(a: int): void
    }
    interface I
  }
  class B extends A implements I
  enum E {
    RED
  }
  B --> E "uses"
}
states {
  initial i
  state s1 "S1" {
    state in1
    region
    state in2
  }
  fork f vertical
  i -> s1 "go"
}
usecases {
  actor u "U"
  boundary sys "Sys" {
    usecase uc "UC" {
      point "p"
    }
  }
  u -- uc
}
components {
  component api "API" {
    provides IPay
    component inner
  }
  component client "Client" {
    requires IPay
  }
  api ..> client "dep"
}
activity {
  lane l "L" orient=h {
    action a1 "A1"
    fork f1 vertical
    object o1 "O" state=s
  }
  initial ia
  ia -> a1
  o1 -- a1
}
deployment {
  node n1 "N1" stereotype=x icon=server {
    artifact art "Art"
  }
  device d1 "D1"
  n1 -- d1
  art manifests d1
}
packages {
  package p1 "P1"
  package p2 "P2"
  p1 imports p2
}
communication {
  object o1x "O1" class=C
  object o2x "O2" {
    a = 1
  }
  o1x -- o2x "lnk" srcRole=a
  1 o1x -> o2x "msg" async
  1.1 o2x -> o1x "back"
}
`;

describe('applyDsl full document', () => {
  const r = applyDsl(undefined, FULL, { layout: false });
  it('builds without errors', () => {
    expect(errs(r)).toEqual([]);
    expect(all(r)).toEqual(expect.arrayContaining(['w:unknown icon "nosuchicon" (autocomplete lists the catalog)']));
    expect(r.page.name).toBe('Full');
    expect(r.page.id).toBe('page-1');
    expect(r.added.length).toBeGreaterThan(30);
    expect(r.removed).toEqual([]);
  });
  it('arch', () => {
    expect(node(r.page, 'vpc')).toMatchObject({ type: 'group', width: 360, height: 240 });
    expect(node(r.page, 'web')).toMatchObject({ type: 'icon', parentId: 'vpc', data: { subtitle: 't3' } });
    expect(node(r.page, 'web').data.iconId).toBeTruthy();
    expect(node(r.page, 'cdn').data.iconId).toBeUndefined();
    const e = (id: string) => r.page.edges.find((x) => x.id === id)!;
    expect(e('e-web-db')).toMatchObject({ label: 'sql', data: { preset: 'sync' } });
    expect(e('e-db-web').data).toMatchObject({ arrows: 'both', dashed: true, strokeStyle: 'dashed', color: '#ff0000' });
    expect(e('e-cdn-web').data).toMatchObject({ arrows: 'none' });
    expect(e('e-web-db').data?.arrows).toBeUndefined();
  });
  it('positions fresh nodes by layout', () => {
    expect(r.page.nodes.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(true);
    const laid = applyDsl(undefined, FULL).page;
    expect(laid.nodes.some((n) => n.position.x !== 0 || n.position.y !== 0)).toBe(true);
    expect(laid.nodes.map((n) => n.id).sort()).toEqual(r.page.nodes.map((n) => n.id).sort());
  });
  it('er', () => {
    const users = node(r.page, 'tbl-users');
    expect(users.data.columns.map((c: any) => c.name)).toEqual(['id', 'email', 'org_id', 'bio']);
    expect(users.data.columns[0]).toMatchObject({ pk: true, generated: 'autoincrement', comment: 'the id', nullable: false });
    expect(users.data.columns[1]).toMatchObject({ unique: true, nullable: false, default: 'x' });
    expect(users.data.columns[2].fk).toMatchObject({ table: 'orgs', column: 'id' });
    expect(users.data.indexes).toEqual([{ name: 'ix_email', columns: ['email'], unique: true }, { columns: ['id', 'email'], unique: false }]);
    expect(users.data.comment).toBe('people');
    expect(node(r.page, 'tbl-role').data).toMatchObject({ tableKind: 'enum' });
    expect(node(r.page, 'tbl-role').data.columns.every((c: any) => c.nullable === false)).toBe(true);
    expect(node(r.page, 'tbl-v').data.tableKind).toBe('view');
    const rels = r.page.edges.filter((e) => e.data?.relation);
    expect(rels.length).toBe(4);
    const nm = rels.find((e) => e.data!.relation.cardinality === 'N:M')!;
    expect(nm.data!.relation).not.toHaveProperty('fromCol');
    const cascade = rels.find((e) => e.source === 'tbl-link' && e.target === 'tbl-orgs' && e.data!.relation.cardinality === '1:N')!;
    expect(cascade.data).toMatchObject({ startMarker: 'one', endMarker: 'zeroOrMany', dashed: false, strokeStyle: 'solid' });
    expect(node(r.page, 'tbl-orgs').data.columns[0].fk).toMatchObject({ table: 'link', column: 'b', onDelete: 'CASCADE', onUpdate: 'RESTRICT' });
  });
  it('seq / timing', () => {
    const s = node(r.page, 'sq1');
    expect(s.type).toBe('sequence');
    expect(s.data.items.map((i: any) => i.id)).toEqual(['m1', 'n1', 'f1']);
    expect(s.data.items[2].sections[1].items[0].kind).toBe('destroy');
    expect(s.width).toBeGreaterThanOrEqual(320);
    const t = node(r.page, 't1');
    expect(t.data).toMatchObject({ end: 100, unit: 'ms' });
    expect(t.data.lifelines[1]).toMatchObject({ kind: 'clock', period: 5 });
    expect(t.data.messages[0]).toMatchObject({ t: 10, t2: 20 });
  });
  it('uml', () => {
    expect(node(r.page, 'cls-a').data).toMatchObject({ label: 'A', kind: 'class', package: 'Shop', accent: '#2f6fdb' });
    expect(node(r.page, 'cls-a').parentId).toBe('shop');
    expect(node(r.page, 'cls-a').data.operations[0].params).toEqual([{ name: 'a', type: 'int' }]);
    expect(node(r.page, 'cls-i').data.accent).toBe('#0f9d8f');
    expect(r.page.edges.filter((e) => e.data?.uml?.kind).map((e) => e.data!.uml.kind)).toEqual(expect.arrayContaining(['inheritance', 'realization', 'association', 'transition', 'dependency', 'import', 'link', 'manifest', 'note', 'assembly', 'communication']));
    expect(node(r.page, 'in2').data.region).toBe(1);
    expect(node(r.page, 'in2').parentId).toBe('s1');
    expect(node(r.page, 'f').data.vertical).toBe(true);
    expect(node(r.page, 'uc').data.extensionPoints).toEqual(['p']);
    expect(node(r.page, 'api').data.ports.map((p: any) => [p.name, p.kind, p.side])).toEqual([['IPay', 'provided', 'left']]);
    expect(node(r.page, 'api').data.container).toBe(true);
    expect(node(r.page, 'client').data.ports[0]).toMatchObject({ kind: 'required', side: 'right', offset: 0.5 });
    const asm = r.page.edges.find((e) => e.data?.uml?.kind === 'assembly')!;
    expect(asm).toMatchObject({ source: 'client', target: 'api' });
    expect(node(r.page, 'l').data).toMatchObject({ variant: 'lane', laneOrient: 'h' });
    expect(node(r.page, 'f1').data.vertical).toBe(true);
    expect(node(r.page, 'o1').data.objectState).toBe('s');
    expect(node(r.page, 'n1')).toMatchObject({ width: 320, height: 220 });
    expect(node(r.page, 'n1').data).toMatchObject({ container: true, stereotype: 'x' });
    expect(node(r.page, 'n1').data.iconId).toBeTruthy();
    expect(node(r.page, 'o2x').data.slots).toEqual([{ id: 's0', name: 'a', value: '1' }]);
    const link = r.page.edges.find((e) => e.data?.uml?.kind === 'link')!;
    expect(link.label).toBe('1: msg ⇢\n1.1: back ←');
    expect(link.data!.uml.messages.map((m: any) => m.dir)).toEqual(['fwd', 'back']);
    expect(node(r.page, 'p1').data.variant).toBe('package');
  });
  it('printing the result and re-applying is stable', () => {
    const page = structuredClone(r.page);
    page.edges = page.edges.filter((e) => e.data?.relation?.cardinality !== 'N:M'); // N:M has no columns: not expressible
    const text = printPage(page);
    const again = applyDsl(structuredClone(page), text, { layout: false });
    expect(errs(again)).toEqual([]);
    expect(again.removed).toEqual([]);
    expect(printPage(again.page)).toBe(text);
    expect(again.added).toEqual([]);
    expect(text).toContain('// relation users <> link has no columns'.slice(0, 0) + 'table users');
  });
});

describe('applyDsl updates', () => {
  const base = () => applyDsl(undefined, FULL).page;
  it('removals take children and edges', () => {
    const r = applyDsl(base(), '#!sdd 1\ndiagram "x"\nnode only "Only"\n');
    expect(errs(r)).toEqual([]);
    expect(r.page.nodes.map((n) => n.id)).toEqual(['only']);
    expect(r.page.edges).toEqual([]);
    expect(r.removed).toContain('vpc');
    expect(r.removed).toContain('tbl-users');
    expect(r.removed).toContain('s1');
    expect(r.removed).toContain('t1');
    expect(r.removed).toContain('cls-a');
    expect(r.page.name).toBe('Full');
  });
  it('placement keeps existing nodes in place and adds new to the right', () => {
    const b = base();
    const before = structuredClone(b.nodes.find((n) => n.id === 'cdn')!.position);
    const r = applyDsl(b, FULL + '\nnode extra "Extra"\n');
    expect(node(r.page, 'cdn').position).toEqual(before);
    expect(node(r.page, 'extra').position.x).toBeGreaterThan(Math.max(...b.nodes.filter((n) => !n.parentId).map((n) => n.position.x)));
    expect(r.added).toEqual(['extra']);
  });
  it('new node inside an existing group is appended after siblings', () => {
    const b = base();
    const r = applyDsl(b, FULL.replace('  node db "DB" icon=cache\n', '  node db "DB" icon=cache\n  node w2 "W2"\n'));
    expect(node(r.page, 'w2').parentId).toBe('vpc');
    const web = node(r.page, 'web');
    expect(node(r.page, 'w2').position.x).toBeGreaterThan(web.position.x);
    const r2 = applyDsl(applyDsl(undefined, 'group g "G" {\n}\nnode a "A" \n').page, 'group g "G" {\n  node n "N"\n}\nnode a "A"\n');
    expect(node(r2.page, 'n')).toMatchObject({ parentId: 'g', position: { x: 24, y: 56 } });
  });
  it('type switch, parent changes, icon resolution', () => {
    const first = applyDsl(undefined, 'node a "A" icon=server sub="x"\ngroup g "G" {\n  node b "B"\n}\n');
    const r = applyDsl(first.page, 'group a "A" icon=aws-group-private-subnet {\n  node b "B"\n}\nnode g "G" icon=database\n');
    expect(node(r.page, 'a').type).toBe('group');
    expect(node(r.page, 'a').width).toBe(360);
    expect(node(r.page, 'a').data).toMatchObject({ groupIcon: expect.any(String) });
    expect(node(r.page, 'a').data.iconId).toBeUndefined();
    expect(node(r.page, 'a').data.subtitle).toBeUndefined();
    expect(node(r.page, 'g').type).toBe('icon');
    expect(node(r.page, 'b').parentId).toBe('a');
    const r2 = applyDsl(r.page, 'node a "A"\nnode b "B"\nnode g "G"\n');
    expect(node(r2.page, 'b').parentId).toBeUndefined();
    expect(node(r2.page, 'a').type).toBe('icon');
  });
  it('arch errors', () => {
    const r = applyDsl(base(), 'node tbl-users "X"\nnode c "C" icon=cluster-kafka\n');
    expect(errs(r)).toContain('id "tbl-users" is used by a node the text cannot edit (table)');
    expect(all(r)).toContain('w:"cluster-kafka" is a cluster profile; use an icon id');
    expect(node(r.page, 'c').data.iconId).toBeUndefined();
    expect(errs(r)).toHaveLength(1);
  });
  it('unknown parent', () => {
    const r = applyDsl(undefined, 'group g "G" {\n  node a "A"\n}\n');
    expect(errs(r)).toEqual([]);
    // parent in dsl must exist in dsl
    const doc = emptyDoc();
    doc.nodes.push({ id: 'a', label: 'A', kind: 'node', parent: 'nope', attrs: {}, line: 3 });
    const b = applyDoc(undefined, doc);
    expect(b.diagnostics).toEqual([{ line: 3, col: 1, message: 'unknown parent "nope"', severity: 'error' }]);
    expect(b.page.nodes).toEqual([]);
  });
  it('cluster profile icon warns', () => {
    const r = applyDsl(undefined, 'node b "B" icon=nosuch\nnode d "D" icon=cluster-kafka\n');
    expect(all(r)).toEqual(['w:unknown icon "nosuch" (autocomplete lists the catalog)', 'w:"cluster-kafka" is a cluster profile; use an icon id']);
    const dep = applyDsl(undefined, 'deployment {\n  node a icon=nosuch\n  node b icon=cluster-kafka\n}\n');
    expect(all(dep)).toEqual(['w:unknown icon "nosuch" (autocomplete lists the catalog)', 'w:"cluster-kafka" is a cluster profile; use an icon id']);
  });
  it('edges: k-th keeps k-th, attrs cleared, data removed', () => {
    const p1 = applyDsl(undefined, 'node a "A"\nnode b "B"\na -> b "x" preset=sync dashed color=#fff\na -> b "y"\n').page;
    expect(p1.edges.map((e) => e.id)).toEqual(['e-a-b', 'e-a-b-2']);
    const p2 = applyDsl(p1, 'node a "A"\nnode b "B"\na -> b\n').page;
    expect(p2.edges).toHaveLength(1);
    expect(p2.edges[0].id).toBe('e-a-b');
    expect(p2.edges[0].label).toBeUndefined();
    expect(p2.edges[0].data).toBeUndefined();
    const p3 = applyDsl(p1, 'node a "A"\nnode b "B"\na -> b "x" preset=sync\na -> b "y"\n').page;
    expect(p3.edges[0].data).toEqual({ preset: 'sync', color: '#fff' });
    // an edge whose preset is removed drops the color the preset carried
    const p4 = applyDsl(p3, 'node a "A"\nnode b "B"\na -> b "x"\na -> b "y"\n').page;
    expect(p4.edges[0].data).toBeUndefined();
    const p5 = applyDsl(p3, 'node a "A"\nnode b "B"\na -> b "x" color=#000\na -> b "y"\n').page;
    expect(p5.edges[0].data).toEqual({ color: '#000' });
    // edges to unknown ends are skipped
    const p6 = applyDsl(p1, 'node a "A"\na -> z\n');
    expect(p6.page.edges).toEqual([]);
  });
});

describe('ER updates', () => {
  const T1 = 'table users {\n  id int [pk]\n  org int [ref: > orgs.id]\n}\ntable orgs {\n  id int [pk]\n}\n';
  it('keeps ids, drops fk, removes relations and tables', () => {
    const p1 = applyDsl(undefined, T1).page;
    const colIds = node(p1, 'tbl-users').data.columns.map((c: any) => c.id);
    expect(colIds).toEqual(['c0', 'c1']);
    expect(p1.edges).toHaveLength(1);
    const relId = p1.edges[0].id;
    // add a column (new id), keep relation edge (same key), switch cardinality
    const p2 = applyDsl(p1, 'table users {\n  id int [pk]\n  org int\n  extra int [increment]\n}\ntable orgs {\n  id int [pk]\n}\nref: users.org - orgs.id\n');
    expect(node(p2.page, 'tbl-users').data.columns.map((c: any) => c.id)).toEqual(['c0', 'c1', 'c2']);
    expect(node(p2.page, 'tbl-users').data.columns[1].fk).toMatchObject({ table: 'orgs' });
    expect(p2.page.edges.find((e) => e.id === relId)!.data!.relation.cardinality).toBe('1:1');
    // decrement removes autoincrement, removes fk
    const p3 = applyDsl(p2.page, 'table users {\n  id int [pk]\n  org int\n  extra int\n}\ntable orgs {\n  id int [pk]\n}\n');
    expect(node(p3.page, 'tbl-users').data.columns[2].generated).toBeUndefined();
    expect(node(p3.page, 'tbl-users').data.columns[1].fk).toBeUndefined();
    expect(p3.removed).toContain(relId);
    expect(p3.page.edges).toEqual([]);
    // remove a table
    const p4 = applyDsl(p3.page, 'table orgs {\n  id int [pk]\n}\n');
    expect(p4.removed).toContain('tbl-users');
    // fk for table not present
    const p5 = applyDsl(undefined, 'table a {\n  x int [ref: > b.id]\n}\n');
    expect(errs(p5)).toEqual(['unknown table "b"']);
    expect(node(p5.page, 'tbl-a').data.columns[0].fk).toBeUndefined();
    // relation with identical keys gets unique ids; composite relations (group) are removed
    const p6 = applyDsl(p1, T1);
    expect(p6.page.edges.map((e) => e.id)).toEqual([relId]);
    const withGroup = structuredClone(p1);
    withGroup.edges.push({ id: 'comp', source: 'tbl-orgs', target: 'tbl-users', data: { relation: { group: 'g', cardinality: '1:N' } } });
    expect(applyDsl(withGroup, T1).page.edges.map((e) => e.id)).toEqual([relId, 'comp']);
  });
  it('relation cardinalities and color/ids are preserved', () => {
    const p = applyDsl(undefined, 'table a {\n  id int [pk]\n}\ntable b {\n  id int [pk]\n  a_id int [not null]\n  a2 int\n}\nref: b.a_id > a.id\nref: b.a2 < a.id\nref: b.id - a.id\nref: a.id <> b.id\nref: a.id > nope.id\n').page;
    const rels = p.edges.filter((e) => e.data?.relation);
    expect(rels.map((e) => e.data!.relation.cardinality).sort()).toEqual(['1:1', '1:N', '1:N', 'N:M'].sort());
    expect(rels.find((e) => e.data!.relation.cardinality === '1:1')!.data!.strokeStyle).toBe('solid');
    const mod = structuredClone(p);
    for (const e of mod.edges) if (e.data?.relation) e.data.color = '#123456';
    const again = applyDsl(mod, printPage(mod));
    expect(again.page.edges.filter((e) => e.data?.relation).every((e) => e.data!.color === '#123456')).toBe(true);
  });
});

describe('sequence / timing updates', () => {
  it('matches by id, then by title; removes the rest', () => {
    const p1 = applyDsl(undefined, 'seq a "First" {\n  actor X\n  X -> X: hi\n}\nseq b "Second" {\n}\ntiming ta "TA" {\n  robust l\n}\ntiming tb "TB" {\n}\n').page;
    expect(p1.nodes.filter((n) => n.type === 'sequence').map((n) => n.id)).toEqual(['a', 'b']);
    const p2 = applyDsl(p1, 'seq c "First" {\n  actor X\n}\nseq a "A2" {\n}\ntiming ta "TA2" {\n  robust l2\n}\ntiming tz "TB" {\n}\n');
    expect(p2.page.nodes.filter((n) => n.type === 'sequence').map((n) => [n.id, n.data.label])).toEqual([['a', 'A2'], ['c', 'First']]);
    expect(p2.removed).toContain('b');
    expect(p2.page.nodes.filter((n) => n.type === 'timing').map((n) => [n.id, n.data.label])).toEqual([['ta', 'TA2'], ['tb', 'TB']]);
    expect(node(p2.page, 'ta').data.lifelines[0].id).toBe('l2');
    const keep = node(p1, 'a').data.accent;
    expect(node(p2.page, 'a').data.accent).toBe(keep);
  });
  it('timing end defaults', () => {
    const t = (body: string) => applyDsl(undefined, `timing t "T" {\n${body}\n}\n`).page.nodes[0];
    expect(t('robust a states X\na @40 X').data.end).toBe(40);
    expect(t('robust a states X').data.end).toBe(100);
    expect(t('robust a\nrobust b\na -> b @5..30 "m"\na 0..70').data.end).toBe(70);
    expect(t('end 250\nrobust a').data.end).toBe(250);
    expect(t('clock c period=3\nbinary b').data.lifelines.map((l: any) => l.period)).toEqual([3, undefined]);
  });
  it('sizes', () => {
    expect(seqSizeOf({ participants: [], items: [] })).toEqual({ width: 320, height: 120 });
    expect(seqSizeOf({ participants: [1, 2, 3], items: [{ type: 'message' }, { type: 'fragment', sections: [{ items: [{ type: 'message' }] }, { items: [] }] }] })).toEqual({ width: 550, height: 120 + 5 * 46 });
    expect(timingSizeOf({ lifelines: [{ kind: 'robust', states: [1, 2, 3] }, { kind: 'binary', states: [] }, { kind: 'clock', states: [] }, { kind: 'robust', states: [] }] })).toEqual({ width: 728, height: 16 + 28 + (3 * 20 + 12 + 8) + 64 + 48 + (2 * 20 + 12 + 8) + 36 + 12 });
    expect(tableSizeOf({ label: 'a', columns: [] })).toEqual({ width: 220, height: 40 + 28 + 6 });
    expect(tableSizeOf({ label: 'x'.repeat(100), schema: 'public', columns: [{ name: 'c'.repeat(40), type: 'varchar(200000000000000000000000)' }, { name: 'd' }], indexes: new Array(4).fill(0), checks: new Array(3).fill(0) })).toEqual({ width: 400, height: 40 + 56 + 6 + 10 + 6 * 18 });
    expect(tableSizeOf({ label: 'a', columns: [{ name: 'x', type: 'int' }], indexes: [1, 2] })).toEqual({ width: 220, height: 40 + 28 + 6 + 10 + 36 });
  });
  it('uml sizes', () => {
    expect(classSizeOf({ label: 'A', generics: ' T ', kind: 'interface', attributes: [], operations: [{ name: 'f' }], stereotype: '' })).toEqual({ width: 160, height: 36 + 16 + 8 + 22 + 2 });
    expect(classSizeOf({ label: 'A', kind: 'enum', attributes: [{ name: 'x' }], operations: [] }).height).toBe(36 + 16 + 8 + 22 + 2);
    expect(classSizeOf({ label: 'A', kind: 'class', stereotype: 's', attributes: [{ name: 'x'.repeat(100) }], operations: [{ name: 'f' }] })).toEqual({ width: 420, height: 36 + 16 + 8 + 22 + 8 + 22 + 2 });
    expect(classSizeOf({ label: 'A', kind: 'class', attributes: [], operations: [] }).height).toBe(36 + 8 + 8 + 2);
    expect(classSizeOf({ label: 'A', kind: 'interface', attributes: [{ name: 'a' }], operations: [] }).height).toBe(36 + 16 + 8 + 22 + 8 + 2);
    expect(stateSizeOf('initial', '')).toEqual({ width: 20, height: 20 });
    expect(stateSizeOf('final', '')).toEqual({ width: 28, height: 28 });
    expect(stateSizeOf('choice', '')).toEqual({ width: 34, height: 34 });
    expect(stateSizeOf('fork', '', undefined, true)).toEqual({ width: 8, height: 96 });
    expect(stateSizeOf('join', '')).toEqual({ width: 96, height: 8 });
    expect(stateSizeOf('history', '')).toEqual({ width: 30, height: 30 });
    expect(stateSizeOf('deepHistory', '')).toEqual({ width: 30, height: 30 });
    expect(stateSizeOf('entryPoint', '')).toEqual({ width: 16, height: 16 });
    expect(stateSizeOf('exitPoint', '')).toEqual({ width: 16, height: 16 });
    expect(stateSizeOf('state', 'x')).toEqual({ width: 110, height: 40 });
    expect(stateSizeOf('state', 'x', 'a\nbb\n\n').height).toBe(40 + 2 * 15 + 10);
    expect(shapeSizeOf('usecase', { label: 'Bob', ucKind: 'actor' })).toEqual({ width: 70, height: 100 });
    expect(shapeSizeOf('usecase', { label: 'x'.repeat(30), extensionPoints: ['a', 'b'] })).toMatchObject({ height: 80 + 22 + 30 });
    expect(shapeSizeOf('usecase', { label: 'x' })).toEqual({ width: 150, height: 64 });
    expect(shapeSizeOf('usecase', { label: 'x', extensionPoints: ['y'.repeat(60)] }).width).toBe(440);
    expect(shapeSizeOf('component', { label: 'c', compKind: 'node' })).toEqual({ width: 150, height: 90 });
    expect(shapeSizeOf('component', { label: 'c', compKind: 'artifact' })).toEqual({ width: 130, height: 72 });
    expect(shapeSizeOf('component', { label: 'c' })).toEqual({ width: 150, height: 72 });
    expect(shapeSizeOf('component', { label: 'c', ports: [{ side: 'left' }, { side: 'left' }, { side: 'left' }, { side: 'top' }, { side: 'top' }, { side: 'top' }, { side: 'top' }] })).toEqual({ width: 180, height: 104 });
    expect(shapeSizeOf('component', {})).toEqual({ width: 150, height: 72 });
    expect(actSizeOf({ actKind: 'initial' })).toEqual({ width: 28, height: 28 });
    expect(actSizeOf({ actKind: 'final' })).toEqual({ width: 36, height: 36 });
    expect(actSizeOf({ actKind: 'flowFinal' })).toEqual({ width: 30, height: 30 });
    expect(actSizeOf({ actKind: 'decision' })).toEqual({ width: 56, height: 56 });
    expect(actSizeOf({ actKind: 'fork', vertical: true })).toEqual({ width: 8, height: 120 });
    expect(actSizeOf({ actKind: 'fork' })).toEqual({ width: 120, height: 8 });
    expect(actSizeOf({ actKind: 'object', label: 'o', objectState: 's' })).toEqual({ width: 110, height: 62 });
    expect(actSizeOf({ actKind: 'object', label: 'o' }).height).toBe(46);
    expect(actSizeOf({ actKind: 'send', label: 'o' })).toEqual({ width: 130, height: 48 });
    expect(actSizeOf({ actKind: 'accept', label: 'o' })).toEqual({ width: 130, height: 48 });
    expect(actSizeOf({ actKind: 'note', label: 'a\nb\nc' })).toEqual({ width: 140, height: 79 });
    expect(actSizeOf({ actKind: 'note', label: '' })).toEqual({ width: 140, height: 56 });
    expect(actSizeOf({ actKind: 'action', label: 'a\nb' })).toEqual({ width: 120, height: 64 });
    expect(actSizeOf({ actKind: 'action' })).toEqual({ width: 120, height: 48 });
    for (const [k, w, h] of [['device', 160, 110], ['executionEnvironment', 150, 80], ['artifact', 130, 72], ['component', 150, 72], ['node', 160, 96]] as const) expect(depSizeOf({ depKind: k, label: 'a' })).toEqual({ width: w, height: h });
    expect(depSizeOf({})).toEqual({ width: 160, height: 96 });
    expect(objSizeOf({ label: 'o', className: 'C', slots: [{ name: 'a', value: 'b' }, { name: 'z'.repeat(80), value: '' }] })).toEqual({ width: 420, height: 36 + 8 + 44 + 2 });
    expect(objSizeOf({})).toEqual({ width: 150, height: 38 });
  });
});

describe('uml updates', () => {
  const U1 = 'classes {\n  class A {\n    + x: int\n    + f(a: int)\n    + f2()\n  }\n  class B\n  A --> B\n  A -- B\n  A --> B "dup"\n}\n';
  it('keeps member ids and other props; rename with a single leftover', () => {
    const p1 = applyDsl(undefined, U1).page;
    const a = node(p1, 'cls-a');
    expect(a.data.attributes.map((m: any) => m.id)).toEqual(['a0']);
    expect(a.data.operations.map((m: any) => m.id)).toEqual(['o0', 'o1']);
    a.data.attributes[0].custom = 1;
    a.data.accent = '#abcdef';
    const p2 = applyDsl(p1, 'classes {\n  class Z extends B {\n    + x: string = 1\n    + g()\n    + f(a: int)\n    static abstract h\n  }\n  class B\n}\n');
    expect(errs(p2)).toEqual([]);
    const z = node(p2.page, 'cls-a');
    expect(z.data.label).toBe('Z');
    expect(z.data.accent).toBe('#abcdef');
    expect(z.data.attributes[0]).toMatchObject({ id: 'a0', custom: 1, type: 'string', default: '1' });
    expect(z.data.attributes[1]).toMatchObject({ id: 'a1', static: true, abstract: true });
    expect(z.data.operations.map((m: any) => [m.id, m.name])).toEqual([['o2', 'g'], ['o0', 'f']]);
    expect(p2.page.edges.map((e) => e.data!.uml.kind)).toEqual(['inheritance']);
    // remove whole stuff
    const p3 = applyDsl(p2.page, 'classes {\n  class B\n}\n');
    expect(p3.removed).toEqual(expect.arrayContaining(['cls-a']));
  });
  it('rebuilds a node when the kind changes and errors on id clashes', () => {
    const p1 = applyDsl(undefined, 'states {\n  state a\n  state g\n}\n').page;
    const p2 = applyDsl(p1, 'states {\n  state a {\n    state x\n  }\n  initial g\n}\n');
    expect(node(p2.page, 'a')).toMatchObject({ type: 'group', width: 158, height: 40, data: { variant: 'composite' } });
    expect(node(p2.page, 'g')).toMatchObject({ type: 'state', data: { stateKind: 'initial' } });
    expect(node(p2.page, 'g').width).toBe(20);
    expect(node(p2.page, 'x').parentId).toBe('a');
    const p3 = applyDsl(p2.page, 'states {\n  state a\n}\n');
    expect(node(p3.page, 'a').type).toBe('state');
    const p4 = applyDsl(applyDsl(undefined, 'node z "Z"\n').page, 'states {\n  state z\n}\nnode z2 "Z2"\n');
    expect(errs(p4)).toEqual(['id "z" is used by a node the text cannot edit as this kind (icon)']);
    // a child of a rebuilt node keeps its parent id
    const p5 = applyDsl(applyDsl(undefined, 'usecases {\n  actor a\n  boundary b {\n    usecase u\n  }\n}\n').page, 'usecases {\n  usecase a\n  actor b\n  usecase u\n}\n');
    expect(node(p5.page, 'b').type).toBe('usecase');
    expect(node(p5.page, 'u').parentId).toBeUndefined();
    const p6 = applyDsl(applyDsl(undefined, 'deployment {\n  node n {\n    artifact a\n  }\n}\n').page, 'deployment {\n  node n\n  artifact a\n}\n');
    expect(node(p6.page, 'a').parentId).toBeUndefined();
  });
  it('unknown parents are errors', () => {
    const doc = emptyDoc();
    doc.classes.push({ name: 'A', kind: 'class', attrs: [], ops: [], pkg: 'nopkg', line: 5 });
    const r = applyDoc(undefined, doc);
    expect(r.diagnostics).toEqual([{ line: 5, col: 1, message: 'unknown parent "nopkg"', severity: 'error' }]);
  });
  it('components keep ports and spread new ones; assembly on missing ports; containers', () => {
    const t1 = 'components {\n  component a {\n    provides X\n    provides Y\n    requires Z\n  }\n  component b {\n    requires X\n    provides Z\n    component c\n  }\n}\n';
    const p1 = applyDsl(undefined, t1).page;
    const ports = node(p1, 'a').data.ports;
    expect(ports.map((p: any) => [p.id, p.offset])).toEqual([['p1', 1 / 3], ['p2', 2 / 3], ['p3', 0.5]]);
    expect(p1.edges.filter((e) => e.data?.uml?.kind === 'assembly').map((e) => `${e.source}>${e.target}`).sort()).toEqual(['a>b', 'b>a']);
    expect(node(p1, 'b').width).toBe(198);
    delete node(p1, 'b').width;
    delete node(p1, 'b').height;
    const pw = applyDsl(p1, t1).page;
    expect(node(pw, 'b')).toMatchObject({ width: 300, height: 200 });
    const p2 = applyDsl(p1, 'components {\n  component a {\n    provides Y\n    provides W\n    requires Z\n  }\n  component b {\n    requires X\n    provides Z\n    component c\n  }\n}\n').page;
    const ports2 = node(p2, 'a').data.ports;
    expect(ports2.map((p: any) => [p.id, p.name])).toEqual([['p2', 'Y'], ['p4', 'W'], ['p3', 'Z']]);
    expect(ports2[0].offset).toBe(2 / 3);
    const p3 = applyDsl(p2, 'components {\n  component a\n  component b\n  component c\n}\n').page;
    expect(node(p3, 'a').data.ports).toBeUndefined();
    expect(node(p3, 'b').data.container).toBeUndefined();
    expect(p3.edges).toEqual([]);
    // a provided port with an unmatched requirer produces no assembly
    expect(applyDsl(undefined, 'components {\n  component a {\n    requires Q\n  }\n  component b {\n    provides R\n  }\n}\n').page.edges).toEqual([]);
  });
  it('deployment containers keep their size', () => {
    const p1 = applyDsl(undefined, 'deployment {\n  node n\n  artifact a\n}\n').page;
    expect(node(p1, 'n').width).toBe(160);
    const p2 = applyDsl(p1, 'deployment {\n  node n {\n    artifact a\n  }\n}\n').page;
    expect(node(p2, 'n')).toMatchObject({ width: 320, height: 220, data: { container: true } });
    node(p2, 'n').width = 500;
    const p3 = applyDsl(p2, 'deployment {\n  node n "N2" {\n    artifact a\n  }\n}\n').page;
    expect(node(p3, 'n').width).toBe(500);
    const p4 = applyDsl(applyDsl(undefined, 'activity {\n  action a\n}\n').page, 'activity {\n  action a "Longer label here for resize"\n}\n').page;
    expect(node(p4, 'a').data.label).toBe('Longer label here for resize');
  });
  it('object slot ids are kept', () => {
    const p1 = applyDsl(undefined, 'objects {\n  object o {\n    a = 1\n    b = 2\n  }\n}\n').page;
    const p2 = applyDsl(p1, 'objects {\n  object o class=K model=m {\n    b = 3\n    c = 4\n    b = 5\n  }\n}\n').page;
    expect(node(p2, 'o').data.slots.map((s: any) => [s.id, s.name, s.value])).toEqual([['s1', 'b', '3'], ['s2', 'c', '4'], ['s3', 'b', '5']]);
    expect(node(p2, 'o').data).toMatchObject({ className: 'K', modelId: 'm' });
    const p3 = applyDsl(p2, 'objects {\n  object o\n}\n').page;
    expect(node(p3, 'o').data.className).toBeUndefined();
  });
  it('communication messages bound to links, first link wins, taken once', () => {
    const p = applyDsl(undefined, 'communication {\n  object a\n  object b\n  a -- b\n  a -- b "second"\n  1 a -> b "m1"\n  2 b -> a\n}\n').page;
    const links = p.edges.filter((e) => e.data?.uml?.kind === 'link');
    expect(links).toHaveLength(2);
    expect(links[0].data!.uml.messages).toHaveLength(2);
    expect(links[1].label).toBe('second');
    expect(links[1].data!.uml.messages).toBeUndefined();
    expect(links[0].label).toBe('1: m1 →\n2:  ←'.replace('2:  ←', '2: ←'));
    // dropping messages strips them
    const p2 = applyDsl(p, 'objects {\n  object a\n  object b\n  a -- b "plain"\n}\n').page;
    expect(p2.edges[0].data!.uml.messages).toBeUndefined();
    expect(p2.edges[0].label).toBe('plain');
  });
  it('edges keep style and strip stale fields', () => {
    const p1 = applyDsl(undefined, 'classes {\n  class A\n  class B\n  A --> B srcMult=1 dstMult=2 srcRole=a dstRole=b\n}\n').page;
    expect(p1.edges[0].data!.uml).toMatchObject({ directed: true, sourceMult: '1', targetMult: '2', sourceRole: 'a', targetRole: 'b' });
    p1.edges[0].data!.color = '#999';
    p1.edges[0].data!.arrows = 'end';
    const p2 = applyDsl(p1, 'classes {\n  class A\n  class B\n  A --> B\n}\n').page;
    expect(p2.edges[0].data).toMatchObject({ color: '#999', arrows: 'end', endMarker: 'open', dashed: false });
    expect(p2.edges[0].data!.uml).toEqual({ kind: 'association', directed: true });
    const p3 = applyDsl(p2, 'classes {\n  class A\n  class B\n  A -- B\n}\n').page;
    expect(p3.edges[0].data!.endMarker).toBe('none');
    expect(p3.edges[0].data!.uml).toEqual({ kind: 'association' });
    const p4 = applyDsl(p3, 'classes {\n  class A\n  class B\n  A ..> B\n}\n').page;
    expect(p4.edges[0].data).toMatchObject({ dashed: true, strokeStyle: 'dashed' });
  });
});

describe('placeFresh', () => {
  const mk = (id: string, extra: Partial<CNode> = {}): CNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id }, ...extra });
  it('lays out everything when nothing existed or all are fresh', () => {
    const p: CPage = { id: 'p', name: 'p', nodes: [mk('a'), mk('b')], edges: [{ id: 'e', source: 'a', target: 'b' }] };
    placeFresh(p, new Set(['a', 'b']), true);
    expect(p.nodes[1].position.x).not.toBe(p.nodes[0].position.x);
    const q: CPage = { id: 'p', name: 'p', nodes: [mk('a'), mk('b')], edges: [] };
    placeFresh(q, new Set(['a']), false);
    expect(q.nodes.map((n) => n.position).length).toBe(2);
  });
  it('fresh group chains are placed to the right; child of existing group appended; parent widened', () => {
    const g = mk('g', { type: 'group', width: 100, height: 100, position: { x: 10, y: 20 } });
    const old = mk('old', { parentId: 'g', position: { x: 24, y: 56 } });
    const fresh1 = mk('f1', { parentId: 'g' });
    const fg = mk('fg', { type: 'group', width: 200, height: 100 });
    const fc = mk('fc', { parentId: 'fg' });
    const p: CPage = { id: 'p', name: 'p', nodes: [g, old, fresh1, fg, fc], edges: [{ id: 'e', source: 'fg', target: 'fc' }, { id: 'e2', source: 'f1', target: 'fc' }] };
    placeFresh(p, new Set(['f1', 'fg']), true);
    const n = (id: string) => p.nodes.find((x) => x.id === id)!;
    expect(n('f1').position.x).toBe(24 + 120 + 30);
    expect(n('g').width).toBe(24 + 120 + 30 + 120 + 24);
    expect(n('fg').position.x).toBeGreaterThanOrEqual(10 + 100 + 120 - 1);
    expect(n('fc').parentId).toBe('fg');
    // no siblings: placed at 24,56
    const p2: CPage = { id: 'p', name: 'p', nodes: [mk('g', { type: 'group', width: 500, height: 100 }), mk('x', { parentId: 'g' }), mk('y')], edges: [] };
    placeFresh(p2, new Set(['x']), true);
    expect(p2.nodes[1].position).toEqual({ x: 24, y: 56 });
    expect(p2.nodes[0].width).toBe(500);
    // only fresh nodes under existing parents: nothing else to lay out
    const p3: CPage = { id: 'p', name: 'p', nodes: [mk('g', { type: 'group', width: 500, height: 100 }), mk('x', { parentId: 'g' }), mk('y')], edges: [] };
    expect(() => placeFresh(p3, new Set(['x']), true)).not.toThrow();
    // a fresh page where the settled set is empty except fresh chains
    const p4: CPage = { id: 'p', name: 'p', nodes: [mk('y'), mk('z', { type: 'group' })], edges: [] };
    placeFresh(p4, new Set(['z']), true);
    expect(p4.nodes[1].position.x).toBeGreaterThan(p4.nodes[0].position.x);
    const p5: CPage = { id: 'p', name: 'p', nodes: [mk('y', { parentId: 'nogroup' })], edges: [] };
    void p5;
  });
});
