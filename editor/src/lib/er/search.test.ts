import { describe, expect, it } from 'vitest';
import { parseSql } from './sqlParse';
import { schemaToDiagram } from './convert';
import { searchTables } from './search';
import demo from './fixtures/demo_large.sql?raw';

const nodes = schemaToDiagram(parseSql(demo).schema).nodes;

describe('table / column search', () => {
  it('finds a table by name, ranked above its columns', () => {
    const h = searchTables(nodes, 'orders');
    expect(h[0]).toMatchObject({ kind: 'table', title: 'orders' });
  });
  it('finds columns by name across tables', () => {
    const h = searchTables(nodes, 'user_id', 30);
    expect(h.filter((x) => x.kind === 'column').map((x) => x.title)).toEqual(expect.arrayContaining(['orders.user_id', 'carts.user_id', 'reviews.user_id']));
  });
  it('supports table.column queries', () => {
    expect(searchTables(nodes, 'orders.status')[0]).toMatchObject({ kind: 'column', title: 'orders.status' });
  });
  it('ignores one-letter queries and non-table nodes', () => {
    expect(searchTables(nodes, 'o')).toEqual([]);
    expect(searchTables([{ id: 'x', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'orders' } }], 'orders')).toEqual([]);
  });
});
