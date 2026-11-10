import { describe, expect, it } from 'vitest';
import { parseDbml, renderDbml } from './dbml';
import { findTable } from './types';

describe('parseDbml edge cases', () => {
  it('quoted strings with escapes and unterminated input', () => {
    const r = parseDbml(`Table t { a varchar [note: 'it\\'s fine'] }`);
    expect(findTable(r.schema, 't')).toBeTruthy();
    expect(() => parseDbml(`Table t { a varchar [note: 'unterminated`)).not.toThrow();
    expect(() => parseDbml('Table')).not.toThrow();
    expect(() => parseDbml('')).not.toThrow();
  });
  it('inline refs (schema qualified), column settings and nested brackets', () => {
    const r = parseDbml(`
      Table s.users { id int [pk, increment] }
      Table posts {
        id int [pk]
        user_id int [ref: > s.users.id, not null, default: \`now()\`, note: 'x']
        tag varchar(10) [unique, default: 'a#b']
        arr int[] [note: 'array']
        dotted public.mytype
        ref_inline int [ref: - s.users.id]
        indexes {
          (user_id, tag) [unique, name: 'ux']
          user_id [name: 'ix']
          \`lower(tag)\`
          id
        }
      }`);
    const posts = findTable(r.schema, 'posts')!;
    expect(posts.columns.length).toBeGreaterThanOrEqual(5);
    expect(posts.indexes.length).toBeGreaterThanOrEqual(1);
  });
  it('top-level Ref forms: short, long block, with actions, composite, unknown tables, other operators', () => {
    const r = parseDbml(`
      Table a { id int [pk] id2 int }
      Table b { a_id int a_id2 int c_id int }
      Table c { id int [pk] }
      Ref: b.a_id > a.id [delete: cascade, update: set null]
      Ref named: b.c_id < c.id
      Ref { b.a_id2 - a.id2 }
      Ref: (b.a_id, b.a_id2) > (a.id, a.id2)
      Ref: ghost.x > a.id
      Ref: b.a_id <> a.id
      Ref: b.a_id >
      Ref: > a.id
    `);
    expect(r.warnings.some((w) => w.includes('unknown table'))).toBe(true);
    expect(findTable(r.schema, 'b')!.columns.some((c) => c.fk)).toBe(true);
  });
  it('enums, notes, TableGroup, Project and Table aliases / headers with settings', () => {
    const r = parseDbml(`
      Project demo { database_type: 'PostgreSQL' Note: 'proj' }
      enum status { active [note: 'ok'] "in active" }
      Enum other { x }
      Table t as T [headercolor: #3498db, note: 'tbl'] {
        id int
        s status
        Note: 'table note'
      }
      TableGroup g { t }
      Note stray { 'x' }
    `);
    expect(r.schema.enums.length).toBeGreaterThanOrEqual(1);
    expect(findTable(r.schema, 't')).toBeTruthy();
  });
  it('round trip through renderDbml keeps tables', () => {
    const src = parseDbml(`Table a { id int [pk] } Table b { id int [pk] a_id int [ref: > a.id] }`);
    const out = renderDbml(src.schema);
    expect(parseDbml(out).schema.tables.map((t) => t.name).sort()).toEqual(['a', 'b']);
  });
});
