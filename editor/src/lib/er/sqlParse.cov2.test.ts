import { describe, expect, it } from 'vitest';
import { parseSql, tokenize } from './sqlParse';

const P = (sql: string) => parseSql(sql);
const T = (sql: string, name: string) => P(sql).schema.tables.find((t) => t.name === name)!;

describe('tokenizer edges', () => {
  it('# comment only at line start; # before > or - is an operator', () => {
    expect(tokenize('# note\na').map((t) => t.v)).toEqual(['a']);
    expect(tokenize('x #> y').map((t) => t.v)).toContain('#');
    expect(tokenize('x # y').map((t) => t.v)).toContain('#');
    expect(tokenize('#').map((t) => t.v)).toEqual([]);
  });
  it('brackets and numbers at end of input', () => {
    expect(tokenize('[').map((t) => t.v)).toEqual(['[']);
    expect(tokenize('[a]').map((t) => t.k)).toEqual(['qident']);
    expect(tokenize('.').map((t) => t.v)).toEqual(['.']);
    expect(tokenize('7').map((t) => t.v)).toEqual(['7']);
  });
});

describe('parseSql misc branches', () => {
  it('expression-only index item yields empty column', () => {
    const t = T('CREATE TABLE t (id int); CREATE INDEX ix ON t ((1+2));', 't');
    expect(t.indexes[0].columns).toEqual([]);
  });
  it('column without a name is ignored; unknown tokens skipped', () => {
    expect(T('CREATE TABLE t (id int, 5 int, b int);', 't').columns.map((c) => c.name)).toContain('b');
    expect(T('CREATE TABLE t (id int 1 2 NOT NULL);', 't').columns[0].nullable).toBe(false);
  });
  it('PRIMARY / UNIQUE without KEY; ON UPDATE variants; COMMENT without string; CHARACTER; COLLATE', () => {
    const t = T(`CREATE TABLE t (
      a int PRIMARY,
      b int UNIQUE,
      c timestamp ON UPDATE CURRENT_TIMESTAMP(3),
      d int ON,
      e int COMMENT,
      f varchar(3) CHARACTER SET utf8 COLLATE utf8_bin,
      g varchar(3) CHARACTER,
      h int GENERATED ALWAYS AS (a + 1) STORED,
      i int GENERATED ALWAYS AS,
      j int DEFAULT 1 ON DELETE
    );`, 't');
    const g = (n: string) => t.columns.find((c) => c.name === n)!;
    expect(g('a').pk).toBe(true);
    expect(g('b').unique).toBe(true);
    expect(g('c').type).toContain('timestamp');
    expect(g('e').comment).toBeUndefined();
    expect(t.columns).toHaveLength(10);
  });
  it('DEFERRABLE / INITIALLY tails on references, then unknown word breaks', () => {
    const t = T(`CREATE TABLE p (id int primary key); CREATE TABLE t (a int REFERENCES p(id) DEFERRABLE INITIALLY DEFERRED, b int REFERENCES p(id) NOT DEFERRABLE INITIALLY IMMEDIATE, c int REFERENCES p(id) MATCH FULL);`, 't');
    expect(t.columns[0].fk?.table).toBe('p');
    expect(t.columns[1].fk?.table).toBe('p');
  });
  it('named / USING index keys in table body, FOREIGN without KEY, composite fk with fewer targets', () => {
    const t = T(`CREATE TABLE p (x int, y int); CREATE TABLE t (a int, b int,
      INDEX USING btree (a),
      KEY k1 USING hash (b),
      FOREIGN (a, b) REFERENCES p (x),
      CONSTRAINT fk2 FOREIGN KEY (a) REFERENCES p);`, 't');
    expect(t.columns.map((c) => c.name)).toEqual(['a', 'b']);
    expect(t.indexes.map((i) => i.columns)).toEqual(expect.arrayContaining([['a'], ['b']]));
    expect(t.indexes.find((i) => i.name === 'k1')?.columns).toEqual(['b']);
    expect(t.columns[0].fk).toMatchObject({ table: 'p', column: '', name: 'fk2' });
    expect(t.columns[1].fk).toMatchObject({ column: 'x', group: 'fk1' });
  });
  it('INHERITS unknown table warns; LIKE unknown warns', () => {
    const r = P('CREATE TABLE t (a int) INHERITS (ghost); CREATE TABLE u (LIKE ghost2); CREATE TABLE w (a int) INHERITS (;');
    expect(r.warnings.some((w) => w.startsWith('INHERITS unknown table ghost'))).toBe(true);
    expect(r.warnings.some((w) => w.startsWith('LIKE unknown table ghost2'))).toBe(true);
    expect(P('CREATE TABLE u (LIKE);').warnings.join()).toContain('LIKE unknown table ?');
  });
  it('ALTER column lookup is case-insensitive; rename of missing column leaves others', () => {
    const t = T('CREATE TABLE t (Abc int); ALTER TABLE t ALTER COLUMN abc SET NOT NULL;', 't');
    expect(t.columns[0].nullable).toBe(false);
    const r = P('CREATE TABLE t (a int, b int); CREATE TABLE c (x int REFERENCES t(b)); ALTER TABLE t RENAME COLUMN zz TO y; ALTER TABLE ghost RENAME TO g2; ALTER TABLE t RENAME COLUMN b TO bb;');
    expect(r.schema.tables.find((x) => x.name === 'c')!.columns[0].fk?.column).toBe('bb');
  });
  it('DROP INDEX forms with missing parts', () => {
    expect(() => P('CREATE TABLE t (a int); DROP INDEX;')).not.toThrow();
    expect(() => P('CREATE TABLE t (a int); DROP INDEX IF EXISTS ix;')).not.toThrow();
  });
  it('CREATE INDEX variants: unnamed, ON first, missing table, USING, WHERE, unique single sets column unique', () => {
    const r = P(`CREATE TABLE t (a int, b int);
CREATE UNIQUE INDEX ON t (a);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ON t (b);
CREATE INDEX ix2 ON ghost (a);
CREATE INDEX ix3 ON t USING gin (b);
CREATE INDEX ix4 ON t (a) WHERE a > 1;
CREATE INDEX ix5 ON ONLY t;
CREATE INDEX ix6 ON;`);
    const t = r.schema.tables[0];
    expect(t.columns[0].unique).toBe(true);
    expect(t.indexes.find((i) => i.name === 'ix3')?.using).toBe('gin');
    expect(t.indexes.find((i) => i.name === 'ix4')?.where).toBe('a > 1');
  });
  it('CREATE TYPE ENUM ok; malformed ignored', () => {
    const r = P("CREATE TYPE; CREATE TYPE m AS (x int); CREATE TYPE e AS ENUM ('a','b'); CREATE TYPE e AS ENUM ('c');");
    expect(r.schema.enums).toEqual([{ name: 'e', values: ['c'] }]);
  });
  it('CREATE VIEW: select list item without ident and no FROM', () => {
    const r = P('CREATE VIEW v AS SELECT 1 + 2;');
    expect(r.schema.tables[0].columns).toEqual([]);
    const r2 = P('CREATE VIEW v2 AS SELECT a, b AS bb FROM t;');
    expect(r2.schema.tables[0].columns.map((c) => c.name)).toEqual(['a', 'bb']);
  });
});

describe('index access methods are not columns', () => {
  it('UNIQUE KEY k USING btree and a column named key keep working', () => {
    const t = T('CREATE TABLE t (a int, `key` varchar(10), UNIQUE KEY uk USING btree (a));', 't');
    expect(t.columns.map((c) => c.name)).toEqual(['a', 'key']);
    expect(t.indexes.find((i) => i.name === 'uk')).toMatchObject({ columns: ['a'], unique: true });
  });
});
