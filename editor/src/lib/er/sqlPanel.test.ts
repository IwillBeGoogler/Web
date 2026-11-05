import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { replaceTablesFromSql } from './apply';
import { relationOf, tableOf } from './tableData';

describe('SQL panel apply', () => {
  beforeEach(() => useDiagramStore.setState({ nodes: [], edges: [] }));

  it('replaces tables, keeps positions of tables that keep their name, rebuilds relations', () => {
    replaceTablesFromSql('CREATE TABLE users (id integer PRIMARY KEY);');
    const u = useDiagramStore.getState().nodes[0];
    useDiagramStore.setState({ nodes: [{ ...u, position: { x: 500, y: 300 } }] });
    replaceTablesFromSql('CREATE TABLE users (id integer PRIMARY KEY, email text NOT NULL);\nCREATE TABLE posts (id integer PRIMARY KEY, user_id integer REFERENCES users(id));');
    const { nodes, edges } = useDiagramStore.getState();
    expect(nodes.map((n) => tableOf(n).label).sort()).toEqual(['posts', 'users']);
    const users = nodes.find((n) => tableOf(n).label === 'users')!;
    expect(users.position).toEqual({ x: 500, y: 300 });
    expect(tableOf(users).columns.map((c) => c.name)).toEqual(['id', 'email']);
    expect(edges.filter((e) => relationOf(e))).toHaveLength(1);
  });

  it('keeps bends of relations that survive', () => {
    const sql = 'CREATE TABLE users (id integer PRIMARY KEY);\nCREATE TABLE posts (id integer PRIMARY KEY, user_id integer REFERENCES users(id));';
    replaceTablesFromSql(sql);
    const e = useDiagramStore.getState().edges[0];
    useDiagramStore.setState({ edges: [{ ...e, data: { ...e.data, waypoints: [{ x: 10, y: 20 }], manual: true } }] });
    replaceTablesFromSql(sql + '\nCREATE TABLE tags (id integer PRIMARY KEY);');
    const after = useDiagramStore.getState().edges.find((x) => relationOf(x))!;
    expect(after.data?.waypoints).toEqual([{ x: 10, y: 20 }]);
    expect(after.data?.manual).toBe(true);
  });

  it('returns null for text with no tables', () => {
    expect(replaceTablesFromSql('-- nothing')).toBeNull();
  });
});
