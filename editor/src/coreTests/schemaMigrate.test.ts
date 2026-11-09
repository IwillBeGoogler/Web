import { describe, expect, it } from 'vitest';
import { diffSchemas, migrationSql } from '@core/schema/migrate';
import type { Dialect, Schema, SchemaColumn, SchemaTable } from '@core/schema/types';

const col = (name: string, o: Partial<SchemaColumn> = {}): SchemaColumn => ({ name, type: 'text', pk: false, unique: false, nullable: true, ...o });
const tbl = (name: string, columns: SchemaColumn[], o: Partial<SchemaTable> = {}): SchemaTable => ({ name, columns, indexes: [], checks: [], ...o });
const sch = (...tables: SchemaTable[]): Schema => ({ tables, enums: [] });
const D: Dialect[] = ['postgres', 'mysql', 'sqlite'];

describe('diffSchemas', () => {
  it('empty for same, ignores views', () => {
    const a = sch(tbl('t', [col('id', { pk: true, nullable: false })]), tbl('v', [], { kind: 'view' }));
    expect(diffSchemas(a, a).isEmpty).toBe(true);
  });
  it('renames tables and columns by id and by unique shape', () => {
    const a = sch(tbl('old', [col('a', { type: 'int', id: 'c1' }), col('b', { type: 'varchar(10)' })], { id: 't1' }), tbl('x', [col('q', { type: 'int' })]));
    const b = sch(tbl('new', [col('a2', { type: 'int', id: 'c1' }), col('b2', { type: 'VARCHAR (10)' })], { id: 't1' }), tbl('y', [col('q', { type: 'int' })]));
    const d = diffSchemas(a, b);
    expect(d.renamedTables.map((r) => r.to.name).sort()).toEqual(['new', 'y']);
    expect(d.tables[0].renamedColumns).toHaveLength(2);
    expect(diffSchemas(a, b, { detectRenames: false }).renamedTables).toHaveLength(0);
  });
  it('ambiguous renames', () => {
    const a = sch(tbl('t', [col('a'), col('b')]), tbl('p1', [col('z')]), tbl('p2', [col('z')]));
    const b = sch(tbl('t', [col('c'), col('d')]), tbl('q1', [col('z')]), tbl('q2', [col('z')]));
    const d = diffSchemas(a, b);
    expect(d.possibleRenames.length).toBe(4);
    expect(d.tables[0].possibleRenames.length).toBe(4);
  });
  it('alterations, unique, pk, indexes, fks', () => {
    const fk = { table: 'p', column: 'id', onDelete: 'cascade' };
    const a = sch(tbl('p', [col('id', { pk: true, nullable: false })]), tbl('t', [
      col('id', { pk: true, nullable: false }), col('n', { type: 'int', default: '1', unique: true, fk }), col('u'), col('g'), col('gone', { unique: true, fk }),
    ], { indexes: [{ columns: ['n'], unique: false }, { name: 'ux', columns: ['u'], unique: true }] }));
    const b = sch(tbl('p', [col('id', { pk: true, nullable: false })]), tbl('t', [
      col('id2', { pk: true, nullable: false }), col('n', { type: 'bigint', nullable: false, default: '2', fk: { table: 'p', column: 'id', onUpdate: 'set null' } }), col('u', { unique: true }), col('g', { generated: 'identity' }), col('added', { unique: true, fk }),
    ], { indexes: [{ columns: ['added'], unique: false }] }));
    const d = diffSchemas(a, b);
    const t = d.tables[0];
    expect(t.alteredColumns.length).toBeGreaterThan(1);
    expect(t.uniqueAdded.length).toBeGreaterThan(0);
    expect(t.uniqueDropped.length).toBeGreaterThan(0);
    expect(t.addedFks.length).toBeGreaterThan(0);
    expect(t.droppedFks.length).toBeGreaterThan(0);
    expect(t.addedIndexes).toHaveLength(1);
    expect(t.droppedIndexes).toHaveLength(2);
    for (const dl of D) expect(migrationSql(a, b, dl)).toContain('Migration for');
  });
});

describe('migrationSql', () => {
  it('no changes', () => {
    const a = sch(tbl('t', [col('id')]));
    for (const d of D) expect(migrationSql(a, a, d)).toContain('No schema changes');
  });
  const prev = sch(
    tbl('parent', [col('id', { pk: true, nullable: false })]),
    tbl('t', [col('id', { pk: true, nullable: false }), col('a', { unique: true, fk: { table: 'parent', column: 'id' } }), col('b', { default: "'x'" }), col('c'), col('d', { type: 'int' })], { indexes: [{ name: 'ia', columns: ['a'], unique: false }] }),
    tbl('gone', [col('id', { pk: true, nullable: false, generated: 'autoincrement' }), col('p', { fk: { table: 'parent', column: 'id' } })]),
    tbl('old', [col('k', { type: 'int' })], { id: 'T' }),
  );
  const next = sch(
    tbl('parent', [col('id', { pk: true, nullable: false })]),
    tbl('t', [col('id', { pk: true, nullable: false }), col('b', { type: 'varchar(5)', nullable: false, default: "'y'", generated: 'identity' }), col('c', { unique: true }), col('d', { type: 'int', default: undefined }), col('e', { nullable: false }), col('f', { fk: { table: 'parent', column: 'id', onDelete: 'cascade', onUpdate: 'restrict', name: 'myfk' } })], { indexes: [{ columns: ['c'], unique: true }], checks: [{ name: 'ck', expr: 'e > 0' }, { expr: 'c <> 1' }] }),
    tbl('fresh', [col('id', { pk: true, nullable: false, generated: 'identity' }), col('gen', { generated: 'as (id + 1)' }), col('ref', { fk: { table: 'parent', column: 'id' }, unique: true }), col('d', { default: '0' })], { indexes: [{ columns: ['ref'], unique: true }], checks: [] }),
    tbl('child', [col('id', { pk: true, nullable: false }), col('f', { fk: { table: 'fresh', column: 'id' } })]),
    tbl('renamed', [col('k', { type: 'int' })], { id: 'T' }),
  );
  for (const d of D) it(`full migration ${d}`, () => {
    const sql = migrationSql(prev, next, d);
    expect(sql).toContain('CREATE TABLE');
    expect(sql).toContain('DROP TABLE');
    if (d === 'sqlite') expect(sql).toContain('PRAGMA foreign_keys = OFF');
    if (d === 'mysql') expect(sql).toContain('RENAME TABLE');
    const back = migrationSql(next, prev, d);
    expect(back).toContain('Migration for');
  });
  it('pk changes and unique dropped, mysql/postgres', () => {
    const a = sch(tbl('t', [col('a', { pk: true, nullable: false }), col('b', { unique: true })]));
    const b = sch(tbl('t', [col('a'), col('b'), col('c', { pk: true, nullable: false })]));
    const c = sch(tbl('t', [col('a'), col('b')]));
    for (const d of D) { migrationSql(a, b, d); migrationSql(a, c, d); migrationSql(c, a, d); }
    expect(migrationSql(a, c, 'mysql')).toContain('DROP PRIMARY KEY');
    expect(migrationSql(a, b, 'mysql')).toContain('ADD PRIMARY KEY');
    expect(migrationSql(a, b, 'postgres')).toContain('_pkey');
  });
  it('postgres alters', () => {
    const a = sch(tbl('t', [col('x', { default: '1', generated: 'identity' }), col('y', { nullable: false })]));
    const b = sch(tbl('t', [col('x', { type: 'int' }), col('y', { default: '2', generated: 'identity' })]));
    const sql = migrationSql(a, b, 'postgres');
    expect(sql).toContain('DROP DEFAULT');
    expect(sql).toContain('DROP IDENTITY');
    expect(sql).toContain('ADD GENERATED');
    expect(sql).toContain('TYPE int');
    expect(migrationSql(b, a, 'postgres')).toContain('SET DEFAULT');
    expect(migrationSql(b, a, 'postgres')).toContain('SET NOT NULL');
  });
  it('dependency cycles and self refs do not loop', () => {
    const a = sch();
    const b = sch(tbl('a', [col('id'), col('bid', { fk: { table: 'b', column: 'id' } })]), tbl('b', [col('id'), col('aid', { fk: { table: 'a', column: 'id' } }), col('me', { fk: { table: 'b', column: 'id' } })]));
    expect(migrationSql(a, b, 'postgres')).toContain('CREATE TABLE "a"');
    expect(migrationSql(b, a, 'postgres')).toContain('DROP TABLE');
  });
  it('sqlite rebuild skips insert when no kept columns and escapes quotes', () => {
    const a = sch(tbl('t"q', [col('a', { type: 'int' })]));
    const b = sch(tbl('t"q', [col('b', { type: 'int', nullable: false })]));
    expect(migrationSql(a, b, 'sqlite', { detectRenames: false })).toContain('"t""q__new"');
    expect(migrationSql(a, b, 'mysql')).toContain('`');
  });
});
