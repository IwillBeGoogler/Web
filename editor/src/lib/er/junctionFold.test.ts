import { describe, expect, it } from 'vitest';
import { schemaToDiagram } from './convert';
import { parseSql } from './sqlParse';
import { foldJunctions } from './junction';
import { BLOG_SQL } from '../../templates/erTemplates';

describe('foldJunctions (import option "show junction tables as N:M")', () => {
  it('folds the blog post_tags table', () => {
    const d = schemaToDiagram(parseSql(BLOG_SQL).schema);
    const r = foldJunctions(d.nodes, d.edges);
    expect(r.folded).toBe(1);
    expect(r.nodes.filter((n) => n.hidden)).toHaveLength(1);
    expect(r.edges.filter((e) => !e.hidden && (e.data?.relation as { cardinality: string }).cardinality === 'N:M')).toHaveLength(1);
  });
  it('leaves a table with payload columns alone', () => {
    const d = schemaToDiagram(parseSql('create table a(id int primary key); create table b(id int primary key); create table ab(a_id int references a(id), b_id int references b(id), qty int, primary key(a_id,b_id));').schema);
    expect(foldJunctions(d.nodes, d.edges).folded).toBe(0);
  });
});
