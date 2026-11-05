import { describe, expect, it } from 'vitest';
import { parseSql } from './sqlParse';
import { renderSql } from './renderSql';
import { parseMermaid, renderMermaid } from './mermaid';
import { parseDbml, renderDbml } from './dbml';
import { parseSeedora, renderSeedora } from './seedora';
import { findTable, type ErSchemaDef } from './types';
import pg from './fixtures/postgres.sql?raw';
import my from './fixtures/mysql.sql?raw';
import lite from './fixtures/sqlite.sql?raw';
import demo from './fixtures/demo_large.sql?raw';
import seedoraJson from './fixtures/seedora.json?raw';

const fks = (s: ErSchemaDef) => s.tables.flatMap((t) => t.columns.filter((c) => c.fk).map((c) => `${t.name}.${c.name}>${c.fk!.table}`)).sort();
const shape = (s: ErSchemaDef) => s.tables.map((t) => `${t.name}(${t.columns.map((c) => c.name + (c.pk ? '*' : '')).join(',')})`);

describe('Seedora JSON import', () => {
  const { schema, warnings } = parseSeedora(seedoraJson);
  it('maps tables, native types, keys, FKs, checks and enums', () => {
    expect(warnings).toEqual([]);
    expect(schema.tables.map((t) => t.name)).toEqual(['users', 'posts']);
    const u = findTable(schema, 'users')!;
    expect(u.schema).toBe('public');
    expect(u.columns.find((c) => c.name === 'id')).toMatchObject({ pk: true, nullable: false, generated: 'autoincrement' });
    expect(u.columns.find((c) => c.name === 'email')).toMatchObject({ type: 'character varying(255)', unique: true });
    const p = findTable(schema, 'posts')!;
    expect(p.columns.find((c) => c.name === 'author_id')!.fk).toEqual({ table: 'users', column: 'id' });
    expect(p.columns.find((c) => c.name === 'editor_id')).toMatchObject({ nullable: true });
    expect(p.checks).toEqual([{ name: 'title_len', expr: 'char_length(title) > 2' }]);
    expect(schema.enums).toEqual([{ name: 'user_role', values: ['admin', 'member', 'guest'] }]);
  });
  it('rejects non-Seedora JSON', () => expect(parseSeedora('{"a":1}').warnings[0]).toMatch(/Not a Seedora/));
  it('round-trips', () => {
    const again = parseSeedora(renderSeedora(schema)).schema;
    expect(shape(again)).toEqual(shape(schema));
    expect(fks(again)).toEqual(fks(schema));
    expect(again.enums).toEqual(schema.enums);
  });
});

describe('Mermaid', () => {
  const src = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER }o--o{ TAG : follows
    PROFILE |o--o| CUSTOMER : "has"
    CUSTOMER {
      int id PK
      string name "full name"
    }
    ORDER {
      int id PK
      int customer_id FK
      date placed_at
    }`;
  const { schema } = parseMermaid(src);
  it('reads entities, attributes, keys and relations', () => {
    expect(schema.tables.map((t) => t.name).sort()).toEqual(['CUSTOMER', 'LINE_ITEM', 'ORDER', 'PROFILE', 'TAG']);
    expect(findTable(schema, 'CUSTOMER')!.columns.find((c) => c.name === 'name')).toMatchObject({ type: 'string', comment: 'full name' });
    expect(findTable(schema, 'ORDER')!.columns.find((c) => c.name === 'customer_id')!.fk).toMatchObject({ table: 'CUSTOMER', column: 'id' });
    const li = findTable(schema, 'LINE_ITEM')!;
    expect(li.columns.find((c) => c.fk)!.fk).toMatchObject({ table: 'ORDER', manyRequired: true });
    expect(schema.loose).toEqual([{ from: 'CUSTOMER', to: 'TAG', cardinality: 'N:M', identifying: true, label: 'follows' }]);
    expect(findTable(schema, 'CUSTOMER')!.columns.find((c) => c.fk)!.unique).toBe(true); // 1:1
  });
  it('round-trips through render', () => {
    const again = parseMermaid(renderMermaid(schema)).schema;
    expect(fks(again)).toEqual(fks(schema));
    expect(again.loose.length).toBe(1);
    expect(again.tables.map((t) => t.name).sort()).toEqual(schema.tables.map((t) => t.name).sort());
  });
  it('exports SQL FKs as relations with the right symbols', () => {
    const m = renderMermaid(parseSql('create table u(id int primary key); create table o(id int primary key, uid int references u(id)); create table p(uid int primary key references u(id));').schema);
    expect(m).toContain('u |o..o{ o : uid');
    expect(m).toContain('u ||--o| p');
    expect(m).toContain('int id PK');
  });
});

describe('DBML', () => {
  const src = `// comment
Enum status { active\n inactive }
Table users [headercolor: #3498DB] {
  id integer [pk, increment]
  email varchar(255) [unique, not null, note: 'login']
  status status [default: 'active']
  Note: 'app users'
  indexes {
    (email, status) [unique, name: 'uq_e']
  }
}
Table posts {
  id int [pk]
  user_id int [not null, ref: > users.id]
  editor int
  tags text[]
}
Ref: posts.editor > users.id [delete: set null]
Ref fk_m2m: posts.id <> users.id`;
  const { schema, warnings } = parseDbml(src);
  it('parses tables, attrs, indexes, enums and refs', () => {
    expect(warnings).toEqual([]);
    const u = findTable(schema, 'users')!;
    expect(u.accent).toBe('#3498DB');
    expect(u.comment).toBe('app users');
    expect(u.columns[0]).toMatchObject({ pk: true, generated: 'autoincrement' });
    expect(u.columns[1]).toMatchObject({ type: 'varchar(255)', unique: true, nullable: false, comment: 'login' });
    expect(u.indexes).toEqual([{ name: 'uq_e', columns: ['email', 'status'], unique: true }]);
    expect(schema.enums).toEqual([{ name: 'status', values: ['active', 'inactive'] }]);
    const p = findTable(schema, 'posts')!;
    expect(p.columns.find((c) => c.name === 'user_id')!.fk).toMatchObject({ table: 'users', column: 'id' });
    expect(p.columns.find((c) => c.name === 'editor')!.fk).toMatchObject({ table: 'users', onDelete: 'SET NULL' });
    expect(p.columns.find((c) => c.name === 'tags')!.type).toBe('text[]');
    expect(schema.loose[0]).toMatchObject({ from: 'posts', to: 'users', cardinality: 'N:M' });
  });
  it('round-trips', () => {
    const again = parseDbml(renderDbml(schema)).schema;
    expect(shape(again)).toEqual(shape(schema));
    expect(fks(again)).toEqual(fks(schema));
    expect(again.enums).toEqual(schema.enums);
    expect(findTable(again, 'users')!.indexes[0].unique).toBe(true);
  });
  it('round-trips a real SQL schema', () => {
    const s = parseSql(demo).schema;
    const again = parseDbml(renderDbml(s)).schema;
    expect(fks(again)).toEqual(fks(s));
    expect(again.tables.length).toBe(s.tables.length);
  });
});

describe('SQL render per dialect', () => {
  const s = parseSql(pg).schema;
  it('PostgreSQL output re-parses to the same structure', () => {
    const out = renderSql(s, 'postgres');
    const again = parseSql(out).schema;
    const base = (x: ErSchemaDef) => shape({ ...x, tables: x.tables.filter((t) => t.kind !== 'view') }).sort();
    expect(base(again)).toEqual(base(s));
    expect(fks(again)).toEqual(fks(s));
    expect(out).toContain('CREATE TYPE "order_status" AS ENUM');
    expect(out).toContain('GENERATED BY DEFAULT AS IDENTITY');
  });
  it('parents come before children', () => {
    const out = renderSql(s, 'postgres');
    expect(out.indexOf('CREATE TABLE "public"."Users"')).toBeLessThan(out.indexOf('CREATE TABLE "orders"'));
    expect(out.indexOf('CREATE TABLE "orders"')).toBeLessThan(out.indexOf('CREATE TABLE "order_items"'));
  });
  it('MySQL uses backticks, AUTO_INCREMENT, ENGINE and maps types', () => {
    const out = renderSql(s, 'mysql');
    expect(out).toContain('CREATE TABLE `orders`');
    expect(out).toContain('AUTO_INCREMENT');
    expect(out).toContain('ENGINE=InnoDB');
    expect(out).toContain('char(36)'); // uuid
    expect(out).not.toContain('CREATE TYPE');
    const again = parseSql(out).schema;
    expect(fks(again)).toEqual(fks(s));
  });
  it('SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT for a sole auto key', () => {
    const out = renderSql(parseSql(my).schema, 'sqlite');
    expect(out).toMatch(/"id" INTEGER PRIMARY KEY AUTOINCREMENT/);
    expect(out).not.toContain('ENGINE');
    expect(fks(parseSql(out).schema)).toEqual(fks(parseSql(my).schema));
  });
  it('every dialect re-parses the demo schema with the same FKs', () => {
    const base = parseSql(demo).schema;
    for (const d of ['postgres', 'mysql', 'sqlite'] as const) {
      const again = parseSql(renderSql(base, d)).schema;
      expect(again.tables.length, d).toBe(base.tables.length);
      expect(fks(again), d).toEqual(fks(base));
    }
  });
  it('sqlite fixture renders composite keys and FKs', () => {
    const out = renderSql(parseSql(lite).schema, 'postgres');
    expect(out).toContain('PRIMARY KEY ("playlist_id", "track_id")');
    expect(out).toContain('REFERENCES "albums" ("AlbumId")');
  });
});

import { detectFormat, exportErText, importErText } from './io';
describe('format detection', () => {
  it('detects each format', () => {
    expect(detectFormat(seedoraJson)).toBe('seedora');
    expect(detectFormat('erDiagram\n A ||--o{ B : x')).toBe('mermaid');
    expect(detectFormat('Table a {\n id int\n}')).toBe('dbml');
    expect(detectFormat('create table a (id int);')).toBe('sql');
  });
  it('imports and exports through one entry point', () => {
    const r = importErText(pg);
    expect(r.format).toBe('sql');
    expect(exportErText(r.schema, 'mermaid')).toMatch(/^erDiagram/);
    expect(exportErText(r.schema, 'dbml')).toContain('Table');
    expect(JSON.parse(exportErText(r.schema, 'seedora')).tables.length).toBeGreaterThan(2);
  });
});
