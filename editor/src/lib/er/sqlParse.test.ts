import { describe, expect, it } from 'vitest';
import { detectDialect, parseSql, tokenize } from './sqlParse';
import { findTable } from './types';
import pg from './fixtures/postgres.sql?raw';
import my from './fixtures/mysql.sql?raw';
import lite from './fixtures/sqlite.sql?raw';
import demo from './fixtures/demo_large.sql?raw';

describe('tokenize', () => {
  it('drops comments and keeps quoted pieces whole', () => {
    const t = tokenize(`-- c\nSELECT 'a;b''c', "x""y", \`z\`, /* q */ 1.5e3 -- tail`);
    expect(t.map((x) => x.v)).toEqual(['SELECT', "a;b'c", ',', 'x"y', ',', 'z', ',', '1.5e3']);
  });
  it('handles dollar quotes', () => {
    expect(tokenize('$$a;b$$ x').map((x) => x.v)).toEqual(['a;b', 'x']);
  });
});

describe('PostgreSQL', () => {
  const { schema, warnings } = parseSql(pg);
  it('parses tables, views and enums', () => {
    expect(schema.tables.filter((t) => t.kind !== 'view').map((t) => t.name)).toEqual(['Users', 'orders', 'order_items', 'employees']);
    expect(findTable(schema, 'paid_orders')?.kind).toBe('view');
    expect(findTable(schema, 'paid_orders')?.columns.map((c) => c.name)).toEqual(['id', 'buyer']);
    expect(schema.enums).toEqual([{ name: 'order_status', values: ['pending', 'paid', 'shipped', "it's done"] }]);
    expect(warnings).toEqual([]);
  });
  it('reads quoted identifiers, schema, types, defaults and checks', () => {
    const u = findTable(schema, 'Users')!;
    expect(u.schema).toBe('public');
    const email = u.columns.find((c) => c.name === 'e-mail')!;
    expect(email).toMatchObject({ type: 'character varying(255)', nullable: false, unique: true });
    expect(u.columns.find((c) => c.name === 'name')).toMatchObject({ default: "'a;b, c'", nullable: false, comment: 'display name' });
    expect(u.columns.find((c) => c.name === 'created_at')).toMatchObject({ type: 'timestamp with time zone', default: 'now()' });
    expect(u.columns.find((c) => c.name === 'tags')?.type).toBe('text[]');
    expect(u.columns.find((c) => c.name === 'id')).toMatchObject({ pk: true, nullable: false });
    expect(u.checks).toEqual([{ expr: 'age >= 0 AND age < 150' }]);
    expect(u.comment).toBe('people');
  });
  it('reads table-level PK / FK / CHECK and serial', () => {
    const o = findTable(schema, 'orders')!;
    expect(o.columns.find((c) => c.name === 'id')).toMatchObject({ pk: true, generated: 'autoincrement', type: 'bigserial' });
    expect(o.columns.find((c) => c.name === 'user_id')!.fk).toMatchObject({ table: 'Users', column: 'id', onDelete: 'CASCADE', onUpdate: 'NO ACTION', name: 'orders_user_fk' });
    expect(o.checks).toEqual([{ name: 'positive', expr: 'total >= 0' }]);
    expect(o.columns.find((c) => c.name === 'total')?.type).toBe('numeric(10, 2)');
  });
  it('merges composite keys and ALTER TABLE ADD CONSTRAINT', () => {
    const i = findTable(schema, 'order_items')!;
    expect(i.columns.filter((c) => c.pk).map((c) => c.name)).toEqual(['order_id', 'line']);
    expect(i.columns.find((c) => c.name === 'order_id')!.fk).toMatchObject({ table: 'orders', column: 'id', onDelete: 'SET NULL' });
    expect(i.indexes).toContainEqual({ name: 'sku_unique', columns: ['order_id', 'sku'], unique: true });
  });
  it('reads identity, generated columns and self references', () => {
    const e = findTable(schema, 'employees')!;
    expect(e.columns.find((c) => c.name === 'id')).toMatchObject({ pk: true, generated: 'identity' });
    expect(e.columns.find((c) => c.name === 'manager_id')!.fk).toMatchObject({ table: 'employees', column: 'id' });
    expect(e.columns.find((c) => c.name === 'full_name')!.generated).toMatch(/^as \(first/);
  });
  it('reads CREATE INDEX with USING / WHERE and expressions; ignores INSERT bodies', () => {
    const o = findTable(schema, 'orders')!;
    expect(o.indexes[0]).toMatchObject({ name: 'idx_orders_user_status', columns: ['user_id', 'status'], unique: true, using: 'btree' });
    expect(o.indexes[0].where).toContain("status <> 'pending'");
    expect(findTable(schema, 'Users')!.indexes[0].columns[0]).toContain('lower(');
    expect(findTable(schema, 'fake')).toBeUndefined();
  });
  it('is detected as postgres', () => expect(detectDialect(pg)).toBe('postgres'));
});

describe('MySQL / MariaDB', () => {
  const { schema, dialect } = parseSql(my);
  it('detects the dialect', () => expect(dialect).toBe('mysql'));
  it('parses backticks, unsigned, enums, charset, comments, ON UPDATE', () => {
    expect(schema.tables.map((t) => t.name)).toEqual(['customers', 'invoices']);
    const c = findTable(schema, 'customers')!;
    expect(c.columns.find((x) => x.name === 'id')).toMatchObject({ type: 'int unsigned', generated: 'autoincrement', pk: true });
    expect(c.columns.find((x) => x.name === 'email')).toMatchObject({ type: 'varchar(190)', comment: 'login email', nullable: false });
    expect(c.columns.find((x) => x.name === 'status')?.type).toBe("enum('active', 'blocked')");
    expect(c.columns.find((x) => x.name === 'status')?.default).toBe("'active'");
    expect(c.columns.find((x) => x.name === 'updated')).toMatchObject({ type: 'timestamp', default: 'CURRENT_TIMESTAMP' });
    expect(c.columns.map((x) => x.name)).toContain('key');
    expect(c.columns.find((x) => x.name === 'key')).toMatchObject({ type: 'varchar(10)' });
  });
  it('reads KEY / UNIQUE KEY and foreign keys', () => {
    const c = findTable(schema, 'customers')!;
    expect(c.indexes).toContainEqual({ name: 'idx_status', columns: ['status', 'updated'], unique: false });
    expect(c.indexes).toContainEqual({ name: 'uq_email', columns: ['email'], unique: true });
    const inv = findTable(schema, 'invoices')!;
    expect(inv.columns.find((x) => x.name === 'customer_id')!.fk).toMatchObject({ table: 'customers', column: 'id', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
    expect(inv.columns.find((x) => x.name === 'parent_id')!.fk).toMatchObject({ table: 'invoices', column: 'id' });
    expect(inv.columns.find((x) => x.name === 'parent_id')!.nullable).toBe(true);
  });
});

describe('SQLite', () => {
  const { schema, dialect } = parseSql(lite);
  it('detects the dialect', () => expect(dialect).toBe('sqlite'));
  it('parses bracket identifiers, AUTOINCREMENT, inline REFERENCES and table-level FK', () => {
    expect(schema.tables.map((t) => t.name)).toEqual(['artists', 'albums', 'playlist_track']);
    expect(findTable(schema, 'artists')!.columns[0]).toMatchObject({ name: 'ArtistId', pk: true, generated: 'autoincrement' });
    const al = findTable(schema, 'albums')!;
    expect(al.columns.find((c) => c.name === 'ArtistId')!.fk).toMatchObject({ table: 'artists', column: 'ArtistId', onDelete: 'CASCADE' });
    expect(al.columns.find((c) => c.name === 'Price')?.default).toBe('9.99');
    expect(al.indexes).toContainEqual({ columns: ['Title', 'ArtistId'], unique: true });
    expect(findTable(schema, 'playlist_track')!.columns.find((c) => c.name === 'track_id')!.fk).toMatchObject({ table: 'albums', column: 'AlbumId' });
    expect(al.indexes.some((i) => i.name === 'idx_album_title')).toBe(true);
  });
});

describe('demo_large.sql (Seedora)', () => {
  const { schema, warnings } = parseSql(demo);
  it('parses all tables with foreign keys', () => {
    expect(schema.tables.length).toBe(23);
    expect(schema.tables.reduce((a, t) => a + t.columns.filter((c) => c.fk).length, 0)).toBeGreaterThan(20);
    expect(findTable(schema, 'categories')!.columns.find((c) => c.name === 'parent_id')!.fk?.table).toBe('categories');
    expect(warnings).toEqual([]);
  });
});

describe('robustness', () => {
  it('never throws on garbage and reports nothing', () => {
    expect(parseSql('CREATE TABLE ( ; ))) ((').schema.tables).toEqual([]);
    expect(parseSql('').schema.tables).toEqual([]);
  });
  it('warns on an FK to an unknown table', () => {
    expect(parseSql('create table a (b int references nope(id));').warnings[0]).toMatch(/unknown table nope/);
  });
});

describe('migration scripts', () => {
  it('replays ALTER/DROP/RENAME and skips goose down sections', () => {
    const sql = `-- +goose Up
CREATE TABLE users (id INT PRIMARY KEY, role TEXT, pw TEXT, nick TEXT, CONSTRAINT users_role_check CHECK (role <> ''));
CREATE TABLE old_posts (id INT PRIMARY KEY, user_id INT REFERENCES users (id));
CREATE INDEX posts_user_idx ON old_posts (user_id);
-- +goose Down
DROP TABLE old_posts;
-- +goose Up
ALTER TABLE users DROP COLUMN pw, DROP CONSTRAINT users_role_check;
ALTER TABLE users RENAME COLUMN nick TO display_name;
ALTER TABLE users ALTER COLUMN role SET NOT NULL, ALTER COLUMN role TYPE VARCHAR(20);
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE old_posts RENAME TO posts;
DROP INDEX posts_user_idx;
CREATE TABLE tmp (id INT);
DROP TABLE IF EXISTS tmp;
-- +goose Down
ALTER TABLE users ADD COLUMN pw TEXT;
`;
    const { schema } = parseSql(sql);
    expect(schema.tables.map((t) => t.name)).toEqual(['users', 'posts']);
    const users = schema.tables[0];
    expect(users.columns.map((c) => c.name)).toEqual(['id', 'role', 'display_name']);
    expect(users.checks).toEqual([]);
    expect(users.columns[1]).toMatchObject({ type: 'VARCHAR(20)', nullable: false, default: "'user'" });
    const posts = schema.tables[1];
    expect(posts.indexes).toEqual([]);
    expect(posts.columns[1].fk?.table).toBe('users');
  });

  it('hides partitions, copies LIKE, applies INHERITS', () => {
    const { schema, warnings } = parseSql(`
CREATE TABLE ev (id INT, at DATE, PRIMARY KEY (id, at)) PARTITION BY RANGE (at);
CREATE TABLE ev_2024 PARTITION OF ev FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE ev_copy (LIKE ev INCLUDING ALL);
CREATE TABLE ev_copy2 (LIKE ev, extra TEXT);
CREATE TABLE base (id INT PRIMARY KEY, name TEXT);
CREATE TABLE child (extra INT) INHERITS (base);
CREATE TABLE snap AS SELECT * FROM base;`);
    expect(schema.tables.map((t) => t.name)).toEqual(['ev', 'ev_copy', 'ev_copy2', 'base', 'child']);
    expect(findTable(schema, 'ev_copy')!.columns.map((c) => c.name)).toEqual(['id', 'at']);
    expect(findTable(schema, 'ev_copy')!.columns[0]).not.toBe(findTable(schema, 'ev')!.columns[0]);
    expect(findTable(schema, 'ev_copy2')!.columns.map((c) => c.name)).toEqual(['id', 'at', 'extra']);
    expect(findTable(schema, 'child')!.columns.map((c) => c.name)).toEqual(['id', 'name', 'extra']);
    expect(warnings.filter((w) => w.includes('snap'))).toHaveLength(1);
  });

  it('ALTER TYPE, ALTER INDEX, identity', () => {
    const { schema } = parseSql(`
CREATE TYPE mood AS ENUM ('sad', 'ok');
CREATE TABLE p (id INT, m mood, ms mood[]);
CREATE INDEX p_idx ON p (id);
ALTER TYPE mood ADD VALUE IF NOT EXISTS 'happy';
ALTER TYPE mood ADD VALUE 'meh' BEFORE 'ok';
ALTER TYPE mood ADD VALUE 'glad' AFTER 'happy';
ALTER TYPE mood RENAME VALUE 'sad' TO 'blue';
ALTER TYPE mood RENAME TO feeling;
ALTER INDEX p_idx RENAME TO p_id_idx;
ALTER TABLE p ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (START WITH 1, INCREMENT BY 1);`);
    expect(schema.enums).toEqual([{ name: 'feeling', values: ['blue', 'meh', 'ok', 'happy', 'glad'] }]);
    const t = findTable(schema, 'p')!;
    expect(t.columns.map((c) => c.type)).toEqual(['INT', 'feeling', 'feeling[]']);
    expect(t.indexes[0].name).toBe('p_id_idx');
    expect(t.columns[0].generated).toBe('identity');
  });

  it('one concise warning for a failing statement', () => {
    const { warnings } = parseSql(`ALTER TYPE nope ADD VALUE 'x';`);
    expect(warnings).toHaveLength(1);
  });
});
