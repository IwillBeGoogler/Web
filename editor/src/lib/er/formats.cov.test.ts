import { describe, expect, it } from 'vitest';
import { parseMermaid, renderMermaid } from './mermaid';
import { parseDbml, renderDbml } from './dbml';
import { detectFormat, ER_FORMATS, exportErText, importErText, isImportFile } from './io';
import { emptySchema, newColumn, newTable, type ErSchemaDef } from './types';

const c = newColumn;
const sch = (...tables: ReturnType<typeof newTable>[]): ErSchemaDef => ({ ...emptySchema(), tables });
const tbl = (s: ErSchemaDef, n: string) => s.tables.find((t) => t.name === n)!;

describe('renderMermaid', () => {
  const s = sch(
    newTable('users', [c('id', 'int', { pk: true }), c('email', 'varchar(80)', { unique: true, comment: 'say "hi"' }), c('', '')]),
    newTable('orders', [
      c('id', 'int', { pk: true }),
      c('user_id', 'int', { nullable: false, fk: { table: 'users', column: 'id', label: 'places' } }),
      c('a', 'int', { pk: true, fk: { table: 'k', column: 'a', group: 'g', identifying: false } }),
      c('b', 'int', { pk: true, fk: { table: 'k', column: 'b', group: 'g' } }),
      c('req', 'int', { fk: { table: 'users', column: 'id', manyRequired: true } }),
      c('uniq', 'int', { unique: true, fk: { table: 'users', column: 'id' } }),
    ]),
  );
  s.loose.push({ from: 'users', to: 'orders', cardinality: 'N:M', identifying: true, label: 'likes' }, { from: 'a b', to: 'c', cardinality: 'N:M', identifying: false });
  it('lists entities with marks/comments and sorted relations', () => {
    const out = renderMermaid(s);
    expect(out.startsWith('erDiagram\n  users {')).toBe(true);
    expect(out).toContain('    int id PK');
    expect(out).toContain(`    varchar email UK "say 'hi'"`);
    expect(out).toContain('    unknown unnamed');
    expect(out).toContain('users ||..o{ orders : places');
    expect(out).toContain('users |o..|{ orders : req');
    expect(out).toContain('users |o..o| orders : uniq');
    expect(out).toContain('k ||..o{ orders : a');
    expect(out).toContain('users }o--o{ orders : likes');
    expect(out).toContain('a_b }o..o{ c : relates');
    const rels = out.split('\n').filter((l) => /^  \S+ \S+ \S+ : /.test(l) && !l.endsWith('{'));
    expect(rels).toEqual([...rels].sort());
  });
  it('1:1 with manyRequired and N:1 tokens come out of loose relations', () => {
    const t = sch();
    t.loose.push({ from: 'a', to: 'b', cardinality: '1:1', identifying: false }, { from: 'a', to: 'b', cardinality: 'N:1', identifying: false }, { from: 'a', to: 'b', cardinality: '1:N', identifying: false });
    const out = renderMermaid(t);
    expect(out).toContain('a ||..o| b');
    expect(out).toContain('a }o..|| b');
    expect(out).toContain('a ||..o{ b');
  });
});

describe('parseMermaid', () => {
  it('warns on a missing header and empty input', () => {
    expect(parseMermaid('').warnings).toContain('Missing "erDiagram" header');
    expect(parseMermaid('A {\n}').warnings).toContain('Missing "erDiagram" header');
  });
  it('reads entities, attributes with keys/comments, aliases, quotes, bare names, comments', () => {
    const r = parseMermaid(`%% a comment
erDiagram
  "my table" {
    int id PK
    varchar(20) name UK "the name"
    int ref_id FK
    bad
  }
  CUSTOMER[Alias] {
    string x PK, FK
  }
  lonely
  "quoted"
  nonsense line here
  A ||--o{ B : "has many"
`);
    const warn = r.warnings.join('|');
    expect(warn).toContain('Unreadable attribute: bad');
    expect(warn).toContain('Skipped: nonsense line here');
    expect(warn).toContain('my table.ref_id is marked FK but no relation uses it');
    const mt = tbl(r.schema, 'my table');
    expect(mt.columns.map((x) => [x.name, x.pk, x.unique, x.nullable, x.comment])).toEqual([
      ['id', true, false, false, undefined],
      ['name', false, true, true, 'the name'],
      ['ref_id', false, false, true, undefined],
    ]);
    expect(mt.columns[2].fk).toBeUndefined();
    expect(r.schema.tables.map((t) => t.name)).toEqual(expect.arrayContaining(['CUSTOMER', 'lonely', 'quoted', 'A', 'B']));
  });
  it('relations become FK columns on the many side, parent gets an id pk, label names the column', () => {
    const r = parseMermaid(`erDiagram
  users ||--o{ orders : places
  users ||..|{ items : ""
  orders }o--|| users : owner
`);
    const orders = tbl(r.schema, 'orders');
    expect(tbl(r.schema, 'users').columns[0]).toMatchObject({ name: 'id', pk: true });
    const fk = orders.columns.find((x) => x.fk)!;
    expect(fk.name).toBe('user_id');
    expect(fk.fk).toMatchObject({ table: 'users', column: 'id', identifying: true, label: 'places' });
    expect(fk.fk!.manyRequired).toBeUndefined();
    const items = tbl(r.schema, 'items');
    expect(items.columns[0].fk).toMatchObject({ identifying: false, manyRequired: true });
    expect(orders.columns.filter((x) => x.fk)).toHaveLength(2); // "places" and "owner"
  });
  it('1:1 sets unique + optional end, existing declared fk column is reused', () => {
    const r = parseMermaid(`erDiagram
  parent {
    int pid PK
  }
  child {
    int pid FK
    int other FK
  }
  parent |o--o| child : link
`);
    const child = tbl(r.schema, 'child');
    const pid = child.columns.find((x) => x.name === 'pid')!;
    expect(pid.fk).toMatchObject({ table: 'parent', column: 'pid', label: 'link' });
    expect(pid.unique).toBe(true);
    expect(pid.nullable).toBe(true);
    expect(child.columns).toHaveLength(2);
    expect(r.warnings.some((w) => w.includes('child.other is marked FK'))).toBe(true);
  });
  it('label matching a column picks it; pk fk columns stay NOT NULL', () => {
    const r = parseMermaid(`erDiagram
  p {
    int id PK
  }
  q {
    int mine PK
    int id2 FK
  }
  p ||--o{ q : mine
`);
    const q = tbl(r.schema, 'q');
    expect(q.columns[0].fk).toMatchObject({ table: 'p' });
    expect(q.columns[0].nullable).toBe(false);
    expect(q.columns[0].fk!.label).toBeUndefined();
    expect(r.warnings.some((w) => w.includes('q.id2'))).toBe(true);
  });
  it('many-to-many becomes a loose relation (with and without label); unknown symbols warn', () => {
    const r = parseMermaid('erDiagram\n  a }o--o{ b : knows\n  a }|..|{ c\n  a xx--yy b');
    expect(r.schema.loose).toEqual([
      { from: 'a', to: 'b', cardinality: 'N:M', identifying: true, label: 'knows' },
      { from: 'a', to: 'c', cardinality: 'N:M', identifying: false },
    ]);
    expect(r.warnings).toContain('Unknown relation symbol: a xx--yy b');
  });
  it('left-many/right-one picks the right side as parent; plural names lose the trailing s', () => {
    const r = parseMermaid('erDiagram\n  comments }o--|| posts : on');
    expect(tbl(r.schema, 'comments').columns[0].fk!.table).toBe('posts');
    expect(tbl(r.schema, 'comments').columns[0].name).toBe('post_id');
    const r2 = parseMermaid('erDiagram\n  a ||--o{ b : x\n  a ||--o{ b : y');
    expect(tbl(r2.schema, 'b').columns.filter((x) => x.fk).length).toBeGreaterThan(0);
  });
  it('round-trips an exported schema', () => {
    const s = sch(newTable('p', [c('id', 'int', { pk: true, nullable: false })]), newTable('k', [c('id', 'int', { pk: true, nullable: false }), c('p_id', 'int', { fk: { table: 'p', column: 'id' } })]));
    const back = parseMermaid(renderMermaid(s));
    expect(tbl(back.schema, 'k').columns.find((x) => x.fk)).toMatchObject({ name: 'p_id' });
    expect(back.warnings).toEqual([]);
  });
});

describe('renderDbml', () => {
  const s = sch(
    newTable('u', [c('id', 'int', { pk: true, generated: 'identity' }), c('e', 'varchar(20)', { nullable: false, unique: true, default: "'x'" }), c('n', 'numeric(10, 2)', { default: '0' }), c('weird name', 'double precision', { comment: "it's \\ ok", default: 'now()' }), c('tags', 'text[]', {})], {
      schema: 'app', accent: '#112233', comment: "hello 'x'", indexes: [{ columns: ['e'], unique: true, name: 'ix', using: 'btree' }, { columns: ['e', 'n'], unique: false }, { columns: ['lower(e)'], unique: false }], checks: [{ expr: 'x' }],
    }),
    newTable('k', [c('a', 'int', { fk: { table: 'u', column: 'id', onDelete: 'CASCADE', onUpdate: 'SET NULL' } }), c('p', 'int', { fk: { table: 'u', column: '', group: 'g' } }), c('q', 'int', { fk: { table: 'u', column: 'e', group: 'g' } }), c('o', 'int', { unique: true, fk: { table: 'zip', column: '' } })]),
    newTable('v', [c('x')], { kind: 'view' }),
  );
  s.enums.push({ name: 'mood', values: ['happy', 'very sad'] });
  s.loose.push({ from: 'u', to: 'k', cardinality: 'N:M', identifying: false });
  it('renders enums, tables, indexes, notes, refs', () => {
    const out = renderDbml(s);
    expect(out).toContain('Enum mood {\n  happy\n  "very sad"\n}');
    expect(out).toContain('Table app.u [headercolor: #112233] {');
    expect(out).toContain('id int [pk, increment]');
    expect(out).toContain("e varchar(20) [not null, unique, default: 'x']".replace("'x'", "`'x'`"));
    expect(out).toContain('n numeric(10, 2) [default: 0]');
    expect(out).toContain('"weird name" "double precision" [default: `now()`, note: \'it\\\'s \\\\ ok\']');
    expect(out).toContain('tags "text[]"');
    expect(out).toContain('    e [unique, name: \'ix\', type: btree]');
    expect(out).toContain('    (e, n)');
    expect(out).toContain('    (`lower(e)`)');
    expect(out).toContain("Note: 'hello \\'x\\''");
    expect(out).not.toContain('Table v');
    expect(out).toContain('Ref: k.a > u.id [delete: cascade, update: set null]');
    expect(out).toContain('Ref: k.(p, q) > u.(id, e)');
    expect(out).toContain('Ref: k.o - zip.id');
    expect(out).toContain('Ref: u.id <> k.id');
  });
  it('a table with only checks still prints an (empty) indexes block; plain tables have no extras', () => {
    const t = sch(newTable('a', [c('id')], { checks: [{ expr: '1' }] }), newTable('b', [c('id')]));
    const out = renderDbml(t);
    expect(out).toContain('indexes {\n  }');
    expect(out.split('Table b {')[1]).not.toContain('indexes');
  });
});

describe('parseDbml', () => {
  const SRC = `// header comment
Project demo { database_type: 'PostgreSQL' }
Enum mood { happy [note: 'x']  "very sad" }
TableGroup g { users }
Table app.users as U [headercolor: #ff0000] {
  id integer [pk, increment]
  email varchar(80) [unique, not null, note: 'mail']
  bio text [null, default: 'hi']
  score numeric(10,2) [default: 0]
  tags text[]
  ext public.hstore
  "quoted col" "my type"
  Note: 'users table'
  indexes {
    email [unique, name: 'ix_email', type: hash]
    (id, email)
    \`lower(email)\`
  }
}
Table posts {
  id int [pk]
  user_id int [ref: > app.users.id]
  other_id int [ref: - users.id]
  k1 int
  k2 int
  Note {
    'multi'
  }
}
Table orphan { x int  y int }
Table bad_header
Ref: posts.user_id > users.id [delete: cascade, update: restrict]
Ref named { posts.id - orphan.x }
Ref: users.id < posts.user_id
Ref: posts.(k1, k2) > orphan.(x, y)
Ref: users.id <> posts.id
Ref: nowhere.id > users.id
Ref extra : posts.id > orphan.x
`;
  const r = parseDbml(SRC);
  it('reads tables, schema, header colour, columns/attrs, types, notes, indexes', () => {
    const u = tbl(r.schema, 'users');
    expect(u.schema).toBe('app');
    expect(u.accent).toBe('#ff0000');
    expect(u.comment).toBe('users table');
    expect(u.columns.map((x) => [x.name, x.type])).toEqual([['id', 'integer'], ['email', 'varchar(80)'], ['bio', 'text'], ['score', 'numeric(10, 2)'], ['tags', 'text[]'], ['ext', 'public.hstore'], ['quoted col', 'my type']]);
    expect(u.columns[0]).toMatchObject({ pk: true, nullable: false, generated: 'autoincrement' });
    expect(u.columns[1]).toMatchObject({ unique: true, nullable: false, comment: 'mail' });
    expect(u.columns[2]).toMatchObject({ nullable: true });
    expect(u.columns[2].default).toBe('hi');
    expect(u.columns[3].default).toBe('0');
    expect(u.indexes).toEqual([
      { name: 'ix_email', columns: ['email'], unique: true, using: 'hash' },
      { columns: ['id', 'email'], unique: false },
      { columns: ['lower(email)'], unique: false },
    ]);
    expect(tbl(r.schema, 'posts').comment).toBe('multi');
    expect(r.schema.enums).toEqual([{ name: 'mood', values: ['happy', 'very sad'] }]);
  });
  it('resolves inline and standalone refs with actions, one-to-one, composite and many-to-many', () => {
    const posts = tbl(r.schema, 'posts');
    const uid = posts.columns.find((x) => x.name === 'user_id')!;
    expect(uid.fk).toMatchObject({ table: 'users', column: 'id' });
    const act = parseDbml('Table a { id int }\nTable b { a_id int }\nRef: b.a_id > a.id [delete: cascade, update: restrict]');
    expect(tbl(act.schema, 'b').columns[0].fk).toMatchObject({ table: 'a', column: 'id', onDelete: 'CASCADE', onUpdate: 'RESTRICT' });
    const oid = posts.columns.find((x) => x.name === 'other_id')!;
    expect(oid.fk).toMatchObject({ table: 'users', column: 'id' });
    expect(oid.unique).toBe(true);
    expect(r.schema.loose).toEqual([{ from: 'users', to: 'posts', cardinality: 'N:M', identifying: false }]);
    // `Ref: users.id < posts.user_id` : users is the parent
    // composite
    const pid = posts.columns.find((x) => x.name === 'k1')!;
    expect(pid.fk).toBeDefined();
    expect(pid.fk!.group).toBeTruthy();
    expect(r.warnings).toContain('Ref to unknown table nowhere');
  });
  it('tolerates garbage, triple-quoted strings, unterminated blocks', () => {
    expect(parseDbml('').schema.tables).toEqual([]);
    const g = parseDbml("Table t {\n  a int [note: '''long\nnote''']\n  ???\n}\n// trailing");
    expect(tbl(g.schema, 't').columns[0].comment).toContain('long');
    expect(parseDbml('Table t { a int').schema.tables.length).toBe(1);
    expect(parseDbml('Enum e').schema.enums).toEqual([]);
    expect(parseDbml('Ref: a.b > c.d').warnings).toEqual(['Ref to unknown table a']);
    expect(parseDbml('Table t { a int [ref: > x] }').schema.tables).toHaveLength(1);
    expect(parseDbml("Table \"a b\" { 'c' int }").schema.tables[0].name).toBe('a b');
    expect(parseDbml('Table t [headercolor: nope] { a int }').schema.tables[0].accent).toBeUndefined();
    const cm = parseDbml("Table t { a int [note: 'a // not a comment'] // real\n }");
    expect(cm.schema.tables[0].columns[0].comment).toBe('a // not a comment');
    expect(parseDbml('Table t { Note: 5 \n a int }').schema.tables[0].comment).toBeUndefined();
    expect(parseDbml('Table t { Note { 5 } a int }').schema.tables[0].comment).toBeUndefined();
    expect(parseDbml('Ref r { a.b > c.d').warnings).toEqual(['Ref to unknown table a']);
  });
  it('round-trips an exported schema', () => {
    const s = sch(newTable('p', [c('id', 'int', { pk: true, nullable: false })]), newTable('k', [c('id', 'int', { pk: true, nullable: false }), c('p_id', 'int', { fk: { table: 'p', column: 'id', onDelete: 'CASCADE' } })], { indexes: [{ columns: ['p_id'], unique: false }] }));
    const back = parseDbml(renderDbml(s));
    expect(tbl(back.schema, 'k').columns[1].fk).toMatchObject({ table: 'p', column: 'id', onDelete: 'CASCADE' });
    expect(tbl(back.schema, 'k').indexes).toEqual([{ columns: ['p_id'], unique: false }]);
  });
});

describe('io', () => {
  it('detects formats', () => {
    expect(detectFormat('{"tables":[{"name":"a"}]}')).toBe('seedora');
    expect(detectFormat('{nope')).toBe('sql');
    expect(detectFormat('[1]')).toBe('sql');
    expect(detectFormat('%% c\nerDiagram\n a')).toBe('mermaid');
    expect(detectFormat('Table a { id int }')).toBe('dbml');
    expect(detectFormat('Table a (id int);\nCREATE TABLE b (id int)')).toBe('sql');
    expect(detectFormat('select 1')).toBe('sql');
  });
  it('importErText honours explicit formats', () => {
    expect(importErText('Table a { id int }', 'dbml').format).toBe('dbml');
    expect(importErText('{"tables":[{"name":"a"}]}', 'seedora').schema.tables).toHaveLength(1);
    expect(importErText('erDiagram\n a ||--o{ b : x', 'mermaid').format).toBe('mermaid');
    expect(importErText('CREATE TABLE a (id int)', 'sql').format).toBe('sql');
    expect(importErText('CREATE TABLE a (id int)').format).toBe('sql');
    expect(importErText('erDiagram\n a', 'auto').format).toBe('mermaid');
  });
  it('isImportFile', () => {
    expect(isImportFile('a.SQL')).toBe(true);
    expect(isImportFile('a.dbml')).toBe(true);
    expect(isImportFile('a.txt')).toBe(false);
    expect(isImportFile('noext')).toBe(false);
  });
  it('exportErText for every format', () => {
    const s = sch(newTable('a', [c('id', 'int', { pk: true, nullable: false })]));
    for (const f of ER_FORMATS) expect(exportErText(s, f.id, 'mysql').length).toBeGreaterThan(5);
    expect(exportErText(s, 'sql', 'mysql')).toContain('`a`');
    expect(exportErText(s, 'sql')).toContain('"a"');
    expect(exportErText(s, 'mermaid')).toMatch(/^erDiagram/);
    expect(exportErText(s, 'dbml')).toContain('Table a');
    expect(JSON.parse(exportErText(s, 'seedora')).tables).toHaveLength(1);
  });
});
