import { describe, expect, it } from 'vitest';
import { diagramToSchema, schemaToDiagram } from './convert';
import { parseSql } from './sqlParse';
import { renderSql } from './renderSql';
import { parseMermaid, renderMermaid } from './mermaid';
import { relationOf, tableOf } from './tableData';
import { findJunctions, expandManyToMany, showAsManyToMany } from './junction';
import { relationEnds } from './cardinality';

const COMPOSITE = `
CREATE TABLE regions (country char(2), code char(3), name text, PRIMARY KEY (country, code));
CREATE TABLE stores (
  id serial PRIMARY KEY,
  country char(2) NOT NULL,
  region_code char(3) NOT NULL,
  FOREIGN KEY (country, region_code) REFERENCES regions (country, code)
);`;

describe('composite foreign keys: one edge per column pair', () => {
  const d = schemaToDiagram(parseSql(COMPOSITE).schema);
  it('draws one relation edge per pair, all in one group', () => {
    expect(d.edges).toHaveLength(2);
    const [a, b] = d.edges.map((e) => relationOf(e)!);
    expect(a.group).toBeTruthy();
    expect(a.group).toBe(b.group);
    expect(a.toCol).not.toBe(b.toCol);
    expect(a.fromCol).not.toBe(b.fromCol);
    expect(a.pairs).toBeUndefined();
  });
  it('round-trips back to one composite FOREIGN KEY', () => {
    const sql = renderSql(diagramToSchema(d.nodes, d.edges), 'postgres');
    expect(sql).toMatch(/FOREIGN KEY \("?country"?, "?region_code"?\) REFERENCES "?regions"? \("?country"?, "?code"?\)/);
  });
  it('a legacy edge with `pairs` still exports as one composite key', () => {
    const [e0, e1] = d.edges;
    const r0 = relationOf(e0)!;
    const r1 = relationOf(e1)!;
    const legacy = { ...e0, data: { ...e0.data, relation: { ...r0, group: undefined, pairs: [{ fromCol: r1.fromCol!, toCol: r1.toCol! }] } } };
    const sql = renderSql(diagramToSchema(d.nodes, [legacy]), 'postgres');
    expect(sql).toMatch(/FOREIGN KEY/);
    expect(sql).toMatch(/region_code/);
  });
});

describe('Mermaid ||--|| round trip', () => {
  it('keeps exactly-one on both ends', () => {
    const s = parseMermaid('erDiagram\n  USER ||--|| PROFILE : has\n').schema;
    expect(renderMermaid(s)).toContain('USER ||--|| PROFILE');
    const e = schemaToDiagram(s).edges[0];
    expect(relationEnds(relationOf(e)!)).toEqual({ start: 'one', end: 'one' });
  });
  it('||--o| and |o--o| stay as they are', () => {
    for (const line of ['A ||--o| B : x', 'A |o--o| B : x', 'A ||--o{ B : x', 'A ||--|{ B : x']) {
      const out = renderMermaid(parseMermaid(`erDiagram\n  ${line}\n`).schema);
      expect(out, line).toContain(line.split(' : ')[0].replace(/\s+/g, ' '));
    }
  });
});

const JUNCTION = `
CREATE TABLE posts (id serial PRIMARY KEY, title text);
CREATE TABLE tags (id serial PRIMARY KEY, name text);
CREATE TABLE post_tags (post_id int REFERENCES posts(id), tag_id int REFERENCES tags(id), PRIMARY KEY (post_id, tag_id));
CREATE TABLE comments (id serial PRIMARY KEY, post_id int REFERENCES posts(id), body text);`;

describe('junction tables as N:M', () => {
  const d = schemaToDiagram(parseSql(JUNCTION).schema);
  it('finds a table whose composite primary key is its two foreign keys', () => {
    const j = findJunctions(d.nodes, d.edges);
    expect(j).toHaveLength(1);
    expect(tableOf(d.nodes.find((n) => n.id === j[0].tableId)!).label).toBe('post_tags');
    expect(j[0].pure).toBe(true);
  });
  it('shows it as one N:M edge and hides the junction', () => {
    const j = findJunctions(d.nodes, d.edges)[0];
    const r = showAsManyToMany(d.nodes, d.edges, j.tableId)!;
    expect(r.nodes.find((n) => n.id === j.tableId)!.hidden).toBe(true);
    const visible = r.edges.filter((e) => !e.hidden);
    const nm = visible.filter((e) => relationOf(e)?.cardinality === 'N:M');
    expect(nm).toHaveLength(1);
    expect(relationOf(nm[0])!.via).toBe(j.tableId);
    expect(visible).toHaveLength(2); // N:M + comments -> posts
    // the schema is unchanged: the junction table is still exported, the N:M edge is not
    const schema = diagramToSchema(r.nodes, r.edges);
    expect(schema.tables.map((t) => t.name)).toContain('post_tags');
    expect(schema.loose).toHaveLength(0);
    expect(schema.tables.find((t) => t.name === 'post_tags')!.columns.every((c) => c.fk)).toBe(true);
  });
  it('can be expanded again', () => {
    const j = findJunctions(d.nodes, d.edges)[0];
    const r = showAsManyToMany(d.nodes, d.edges, j.tableId)!;
    const nm = r.edges.find((e) => relationOf(e)?.via)!;
    const back = expandManyToMany(r.nodes, r.edges, nm.id)!;
    expect(back.nodes.every((n) => !n.hidden)).toBe(true);
    expect(back.edges.every((e) => !e.hidden && !relationOf(e)?.via)).toBe(true);
    expect(back.edges).toHaveLength(d.edges.length);
  });
});
