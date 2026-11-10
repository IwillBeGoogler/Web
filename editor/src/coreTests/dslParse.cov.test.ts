import { describe, expect, it } from 'vitest';
import { parseDsl } from '@core/dsl/parse';
import { quote, stripComment, tokenize, word } from '@core/dsl/lex';

const msgs = (t: string) => parseDsl(t).diagnostics.map((d) => d.message);

describe('lex', () => {
  it('stripComment respects strings and escapes', () => {
    expect(stripComment('a // c')).toBe('a ');
    expect(stripComment('"a // b" // c')).toBe('"a // b" ');
    expect(stripComment('"a\\"//b" x')).toBe('"a\\"//b" x');
    expect(stripComment('no comment')).toBe('no comment');
  });
  it('tokenize', () => {
    const r = tokenize('node a "L\\n\\"q" {x=1}\t,');
    expect(r.toks.map((t) => t.v)).toEqual(['node', 'a', 'L\n"q', '{', 'x', '=', '1', '}', ',']);
    expect(r.toks[2]).toMatchObject({ k: 'str', col: 8 });
    expect(tokenize('a "oops').error).toEqual({ col: 3, message: 'unterminated string' });
    expect(tokenize('"x\\').error?.message).toBe('unterminated string');
  });
  it('quote / word', () => {
    expect(quote('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"');
    expect(word('abc-1')).toBe('abc-1');
    expect(word('a b')).toBe('"a b"');
    expect(word('a:b')).toBe('"a:b"');
  });
});

describe('parseDsl basics', () => {
  it('header, title, nodes, groups, edges', () => {
    const r = parseDsl(`#!sdd 2
diagram "Sys"
group g "Group" {
  node a "A" icon=db sub="x y" color=red
  node b
}
node c
a -> b "calls" style=dashed
b <-> c
c -- a
a <- c
# a comment
// another
`);
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.header).toBe(true);
    expect(r.doc.version).toBe(2);
    expect(r.doc.title).toBe('Sys');
    expect(r.doc.nodes.map((n) => [n.id, n.label, n.kind, n.parent])).toEqual([
      ['g', 'Group', 'group', undefined], ['a', 'A', 'node', 'g'], ['b', 'b', 'node', 'g'], ['c', 'c', 'node', undefined]]);
    expect(r.doc.nodes[1]).toMatchObject({ icon: 'db', sub: 'x y', attrs: { color: 'red' } });
    expect(r.doc.edges.map((e) => [e.from, e.to, e.arrow, e.label])).toEqual([
      ['a', 'b', '->', 'calls'], ['b', 'c', '<->', undefined], ['c', 'a', '--', undefined], ['a', 'c', '<-', undefined]]);
    expect(r.doc.edges[0].attrs).toEqual({ style: 'dashed' });
  });
  it('page keyword, header without version, CRLF', () => {
    const r = parseDsl('#!sdd\r\npage "P"\r\nnode a\r\n');
    expect(r.doc.title).toBe('P');
    expect(r.doc.version).toBe(1);
    expect(r.diagnostics).toEqual([]);
  });
  it('late header warns', () => {
    const r = parseDsl('node a\n#!sdd 1');
    expect(r.diagnostics).toEqual([{ line: 2, col: 1, message: 'the #!sdd header must be the first line', severity: 'warning' }]);
    expect(parseDsl('#!sdd\n#!sdd').diagnostics).toEqual([]);
  });
  it('blank / comment-only lines are skipped', () => {
    expect(parseDsl('\n   \n// x\n   // y\n').diagnostics).toEqual([]);
  });
  it('attrs: number lists, commas, flags, errors', () => {
    const r = parseDsl('node a x=10,20 pin,"quoted" y=1,2,abc\nnode b q=\nnode c = z\nnode d (');
    const a = r.doc.nodes[0].attrs;
    expect(a.x).toBe('10,20');
    expect(a.pin).toBe('true');
    expect(a.quoted).toBe('true');
    expect(a.y).toBe('1,2');
    expect(r.diagnostics.map((d) => d.message)).toEqual(expect.arrayContaining(['missing value for "q"', 'unexpected "="', 'unexpected "("']));
  });
  it('statement errors', () => {
    expect(msgs('diagram')).toEqual(['diagram needs a title, e.g. diagram "My system"']);
    expect(msgs('page {')).toEqual(['page needs a title, e.g. page "My system"']);
    expect(msgs('node')).toEqual(['node needs an id, e.g. node api "API"']);
    expect(msgs('group {')).toEqual(['group needs an id, e.g. group api "API"']);
    expect(msgs('node a {')).toEqual(['only groups can contain nodes']);
    expect(msgs('node a\nnode a')).toEqual(['duplicate id "a"']);
    expect(msgs('}')).toEqual(['unexpected "}"']);
    expect(msgs('a -> zz')).toEqual(['unknown node "a"']);
    expect(msgs('node a\na -> zz')).toEqual(['unknown node "zz"']);
    expect(msgs('foo bar')).toEqual(['unknown statement "foo"']);
    expect(msgs('"str"')).toEqual(['unknown statement "str"']);
    expect(msgs('node a "unterminated')).toEqual(['unterminated string']);
    expect(msgs('users.id > orders.id')).toEqual(['relations are written: ref: a.col > b.col']);
    expect(msgs('a.b foo')).toEqual(['unknown statement "a.b"']);
    expect(msgs('{')).toEqual(['unknown statement "{"']);
  });
  it('closing brace pops groups; unclosed blocks reported', () => {
    expect(msgs('group g {\nnode a\n}\nnode b')).toEqual([]);
    expect(msgs('group g {\nnode a')).toEqual(['missing "}" to close group "g"']);
    expect(msgs('table t {\nid int')).toEqual(['missing "}" to close table "t"']);
    expect(msgs('table t {\nindexes {')).toEqual(['missing "}" to close table "t"']);
    expect(msgs('seq "S" {\n')).toEqual(['missing "}" to close seq "S"']);
    expect(msgs('timing t "T" {\n')).toEqual(['missing "}" to close timing "T"']);
    expect(msgs('classes {\n')[0]).toMatch(/missing "}"/);
  });
});

describe('tables', () => {
  const src = `table users {
  id int [pk, increment]
  "e mail" varchar(255) [unique, not null, note: 'login', default: 'x']
  \`bio\` text [null, ref: > orders.id]
  alt int [primary key, autoincrement, default: now(), ref: < nowhere.id]
  note: 'users table'
  indexes {
    id
    (id, email) [unique, name: "idx_a"]
    email [name: 'idx_b']
  }
}
table orders {
  id int
}
enum status {
  active [note: "x"]
  "off"
}
view v {
  id int
}
ref: users.id > orders.id [delete: cascade, update: 'set null']
ref users.id <> orders.id
`;
  it('parses columns, indexes, notes, enums, views, refs', () => {
    const r = parseDsl(src);
    const t = r.doc.tables;
    expect(t.map((x) => [x.name, x.kind])).toEqual([['users', 'table'], ['orders', 'table'], ['status', 'enum'], ['v', 'view']]);
    expect(t[0].note).toBe('users table');
    const [id, email, bio, alt] = t[0].columns;
    expect(id).toMatchObject({ name: 'id', type: 'int', pk: true, increment: true });
    expect(email).toMatchObject({ name: 'e mail', type: 'varchar(255)', unique: true, notNull: true, note: 'login', default: 'x' });
    expect(bio).toMatchObject({ name: 'bio', type: 'text', notNull: false });
    expect(bio.ref).toEqual({ op: '>', to: { table: 'orders', column: 'id' } });
    expect(alt).toMatchObject({ pk: true, increment: true, default: 'now()' });
    expect(alt.ref).toBeUndefined();
    expect(t[0].indexes).toEqual([
      { columns: ['id'], unique: false },
      { columns: ['id', 'email'], unique: true, name: 'idx_a' },
      { columns: ['email'], unique: false, name: 'idx_b' }]);
    expect(t[2].columns.map((c) => [c.name, c.notNull])).toEqual([['active', true], ['off', true]]);
    expect(r.doc.refs).toHaveLength(2);
    expect(r.doc.refs[0]).toMatchObject({ op: '>', attrs: { delete: 'cascade', update: 'set null' } });
    expect(r.doc.refs[1].op).toBe('<>');
    expect(r.diagnostics.map((d) => d.message)).toEqual(['unknown table "nowhere"']);
  });
  it('table errors', () => {
    expect(msgs('table')).toEqual(['table needs a name, e.g. table users {']);
    expect(msgs('table users')).toEqual(['expected "{" after the table name']);
    expect(msgs('table a {\n}\ntable a {\n}')).toEqual(['duplicate table "a"']);
    expect(msgs('group g {\ntable a {\n}\n}')).toEqual(['table blocks must be at the top level']);
    expect(msgs('table a {\nid int\nid text\n}')).toEqual(['duplicate column "id" in table a']);
    expect(msgs('table a {\nonlyname\n}')[0]).toMatch(/expected a column/);
    expect(msgs('table a {\nid int [wat]\n}')).toEqual(['unknown column attribute "wat"']);
    expect(msgs('table a {\nid int [ref: nonsense]\n}')).toEqual(['expected ref: > table.column']);
    expect(msgs('table a {\nid int [ref: > b.id]\n}')).toEqual(['unknown table "b"']);
    expect(msgs('table a {\nid int [ref: > a.zzz]\n}')).toEqual(['unknown column "a.zzz"']);
    expect(msgs('table a {\nindexes {\n(\n}\n}')).toEqual([]);
    expect(msgs('table a {\nindexes {\nx y z\n}\n}')).toEqual(['expected: column  or  (a, b) [unique, name: "x"]']);
    expect(msgs('table a {\nid int\n}\nref: a.id >')).toEqual(['expected: ref: orders.user_id > users.id']);
    expect(msgs('table a {\nid int\n}\nref: a.id > a.id.x')).toEqual(['expected: ref: orders.user_id > users.id']);
    expect(msgs('table a {\nid int\n}\nref: a.id > b.id')).toEqual(['unknown table "b"']);
    expect(msgs('table a {\nid int\n}\nref: a.id > a.zz')).toEqual(['unknown column "a.zz"']);
  });
  it('quoted table.column ends and quoted default with commas/parens', () => {
    const r = parseDsl(`table "my t" {
  "my id" int
  v text [default: 'a, b', note: "x(1,2)"]
}
ref: "my t"."my id" - "my t"."my id"`);
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.tables[0].columns[1]).toMatchObject({ default: 'a, b', note: 'x(1,2)' });
    expect(r.doc.refs[0]).toMatchObject({ op: '-', from: { table: 'my t', column: 'my id' } });
  });
  it('enum nested at top gets error only inside', () => {
    expect(msgs('enum e {\n a\n}')).toEqual([]);
  });
});

describe('seq blocks', () => {
  it('participants, messages, notes, fragments, autonumber', () => {
    const r = parseDsl(`seq s1 "Login" {
  autonumber
  participant U as "User"
  actor A model=cls.1
  database "DB X"
  U -> A : hi
  A ->> U : async
  A --> U : ret
  A -->> U
  U -x A : kill
  note over U, A : both
  note left of U : l
  note right of A : r
  alt ok
    U -> A: in-alt
  else bad
    A -> U: bad
  end
  opt maybe
  end
  loop 3
  end
  par x
    U -> A: one
  and y
    A -> U: two
  end
  critical c
  option o
  end
  break b
  else z
  end
  participant U as "Renamed"
}`);
    expect(r.diagnostics).toEqual([]);
    const s = r.doc.seqs[0];
    expect(s).toMatchObject({ id: 's1', title: 'Login', autonumber: true });
    expect(s.participants.map((p) => [p.id, p.name, p.kind, p.modelId])).toEqual([
      ['U', 'Renamed', 'participant', undefined], ['A', 'A', 'actor', 'cls.1'], ['DB X', 'DB X', 'database', undefined]]);
    const kinds = s.items.map((i) => (i.type === 'message' ? i.kind : i.type === 'note' ? `note:${i.side ?? 'over'}` : i.op));
    expect(kinds).toEqual(['sync', 'async', 'return', 'create', 'destroy', 'note:over', 'note:left', 'note:right', 'alt', 'opt', 'loop', 'par', 'critical', 'break']);
    const alt = s.items[8];
    expect(alt.type === 'fragment' && alt.sections.map((x) => x.guard)).toEqual(['ok', 'bad']);
  });
  it('re-declaring participant with model removes/sets modelId', () => {
    const r = parseDsl('seq "S" {\nactor A model=m1\nactor A\n}');
    expect(r.doc.seqs[0].participants[0].modelId).toBeUndefined();
    const r2 = parseDsl('seq "S" {\nactor A\nactor A model=m2\n}');
    expect(r2.doc.seqs[0].participants[0].modelId).toBe('m2');
  });
  it('ids derived from title', () => {
    expect(parseDsl('seq "My Seq!" {\n}').doc.seqs[0].id).toBe('seq-my-seq');
    expect(parseDsl('seq {\n}').doc.seqs[0]).toMatchObject({ id: 'seq-sequence', title: 'Sequence' });
    expect(parseDsl('seq abc {\n}').doc.seqs[0]).toMatchObject({ id: 'abc', title: 'abc' });
    expect(parseDsl('seq "!!!" {\n}').doc.seqs[0].id).toBe('seq-seq');
  });
  it('seq errors', () => {
    expect(msgs('seq "S"')).toEqual(['expected: seq "Title" {']);
    expect(msgs('seq a {\n}\nseq a {\n}')).toEqual(['duplicate sequence "a"']);
    expect(msgs('seq "S" {\nnote over : x\n}')).toEqual(['cannot read sequence statement "note over : x"']);
    expect(msgs('seq "S" {\nnote over A,B,C : x\n}')).toEqual(['a note sits over one or two participants']);
    expect(msgs('seq "S" {\nnote over , : x\n}')).toEqual(['a note sits over one or two participants']);
    expect(msgs('seq "S" {\nend\n}')).toEqual(['"end" without an open alt/opt/loop/par/break/critical']);
    expect(msgs('seq "S" {\nalt x\n}')).toEqual(['missing "end" for alt']);
    expect(msgs('seq "S" {\nloop x\nand y\nend\n}')).toEqual(['"and" does not belong in loop']);
    expect(msgs('seq "S" {\nalt x\noption y\nend\n}')).toEqual(['"option" does not belong in alt']);
    expect(msgs('seq "S" {\nwhat is this\n}')).toEqual(['cannot read sequence statement "what is this"']);
    expect(msgs('seq "S" {\nelse z\n}')).toEqual(['cannot read sequence statement "else z"']);
  });
  it('a fragment word used as participant in message is a message', () => {
    const r = parseDsl('seq "S" {\nloop -> opt : x\n}');
    expect(r.doc.seqs[0].items[0]).toMatchObject({ type: 'message', from: 'loop', to: 'opt', text: 'x' });
  });
});

describe('timing', () => {
  it('header forms', () => {
    expect(msgs('timing')).toEqual(['expected: timing id "Title" {']);
    expect(parseDsl('timing {\n}').doc.timings[0]).toMatchObject({ id: 'timing-timing', title: 'Timing' });
    expect(parseDsl('timing t1 {\n}').doc.timings[0]).toMatchObject({ id: 't1', title: 't1' });
    expect(parseDsl('timing "Hi There" {\n}').doc.timings[0].id).toBe('timing-hi-there');
    expect(msgs('timing a {\n}\ntiming a {\n}')).toEqual(['duplicate timing "a"']);
  });
});
