import { describe, expect, it } from 'vitest';
import { parseDbml } from './dbml';
import { findTable } from './types';

describe('parseDbml extra branches', () => {
  it('trailing backslash inside an unterminated string does not throw', () => {
    expect(() => parseDbml("Table t { a varchar [note: 'x\\")).not.toThrow();
  });
  it('column with dotted type, params and array suffix', () => {
    const t = findTable(parseDbml('Table t { a pg.geom\n b decimal(10,2)\n c int[] }').schema, 't')!;
    expect(t.columns.map((c) => c.type)).toEqual(['pg.geom', 'decimal(10, 2)', 'int[]']);
  });
  it('trailing dotted type without name and column at end of input', () => {
    expect(() => parseDbml('Table t { a x.')).not.toThrow();
    expect(() => parseDbml('Table t { a')).not.toThrow();
  });
  it('multi-word settings and unbalanced brackets in attrs', () => {
    const t = findTable(parseDbml("Table t { a int [primary key, default: 1 2]\n b int [note: 'x', ref: > o.id] }").schema, 't')!;
    expect(t.columns[0]).toMatchObject({ pk: true, nullable: false });
    expect(t.columns[1].comment).toBe('x');
    expect(() => parseDbml('Table t { a int [default: [1, 2], note: "n"')).not.toThrow();
  });
  it('inline ref with only a table (no column) is dropped; quoted parts', () => {
    const r = parseDbml('Table o { id int }\nTable t { a int [ref: > o] \n b int [ref: > "o"."id"] }').schema;
    const t = findTable(r, 't')!;
    expect(t.columns[0].fk).toBeUndefined();
    expect(t.columns[1].fk).toMatchObject({ table: 'o', column: 'id' });
  });
  it('enum values with settings and unquoted/quoted/str values', () => {
    const r = parseDbml("Enum e { a [note: 'x']\n \"b c\"\n 'd' }").schema;
    expect(r.enums[0].values).toEqual(['a', 'b c', 'd']);
  });
  it('Ref with on-delete/update attrs maps onto fk; one-to-one sets unique', () => {
    const r = parseDbml('Table p { id int }\nTable c { pid int }\nRef: c.pid - p.id [delete: cascade, update: set null]').schema;
    const c = findTable(r, 'c')!;
    expect(c.columns[0].fk).toMatchObject({ table: 'p', column: 'id', onDelete: 'CASCADE', onUpdate: 'SET NULL' });
    expect(c.columns[0].unique).toBe(true);
  });
  it('Ref referencing unknown column ignored; composite refs with fewer parent cols fall back', () => {
    const r = parseDbml('Table p { id int }\nTable c { a int\n b int }\nRef: c.(a, ghost, b) > p.(id)').schema;
    const c = findTable(r, 'c')!;
    expect(c.columns[0].fk?.column).toBe('id');
    expect(c.columns[1].fk?.column).toBe('id');
  });
  it('Ref with trailing garbage, missing sides and bare name', () => {
    expect(() => parseDbml('Ref: > ')).not.toThrow();
    expect(() => parseDbml('Ref: a > ')).not.toThrow();
    expect(() => parseDbml('Ref r1 { a.b > c.d }')).not.toThrow();
    expect(() => parseDbml('Ref: (')).not.toThrow();
  });
});
