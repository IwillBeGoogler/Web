import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { applySchema, mergeSchemaIntoPage } from './apply';
import { schemaToDiagram } from './convert';
import { groupByPrefix, tablePrefix } from './group';
import { nodeSize } from '../graph';
import { combineFiles } from './io';
import { parseSql } from './sqlParse';
import { relationOf, tableOf } from './tableData';

const s = () => useDiagramStore.getState();
const labels = () => s().nodes.filter((n) => n.type === 'table').map((n) => tableOf(n).label).sort();
const BASE = 'CREATE TABLE users (id int PRIMARY KEY, email text);\nCREATE TABLE orders (id int PRIMARY KEY, user_id int REFERENCES users(id));';

describe('combineFiles', () => {
  it('does not let a rollback section swallow the next file', () => {
    expect(combineFiles([{ name: '1.sql', text: '-- +goose Up\nA;\n-- +goose Down\nB;' }, { name: '2.sql', text: 'C;' }])).not.toContain('B;');
    expect(parseSql(combineFiles([{ name: '1.sql', text: '-- +goose Up\nCREATE TABLE a (id int);\n-- +goose Down\nDROP TABLE a;' }, { name: '2.sql', text: 'CREATE TABLE b (id int);' }])).schema.tables.map((t) => t.name)).toEqual(['a', 'b']);
  });
  it('sorts by natural file name and joins with a newline', () => {
    expect(combineFiles([{ name: '00010.sql', text: 'c' }, { name: '00002.sql', text: 'a' }, { name: '00003.sql', text: 'b' }])).toBe('a\nb\nc');
  });
});

describe('mergeSchemaIntoPage', () => {
  beforeEach(() => s().reset());
  it('keeps position / accent, updates columns, adds new and counts', () => {
    s().loadDiagram(schemaToDiagram(parseSql(BASE).schema));
    const users = s().nodes.find((n) => tableOf(n).label === 'users')!;
    s().transform((ns, es) => ({ nodes: ns.map((n) => (n.id === users.id ? { ...n, position: { x: 900, y: 40 }, data: { ...n.data, accent: '#abcdef' } } : n)), edges: es }));
    const r = mergeSchemaIntoPage(parseSql('CREATE TABLE users (id int PRIMARY KEY, email text, age int);\nCREATE TABLE orders (id int PRIMARY KEY, user_id int REFERENCES users(id));\nCREATE TABLE tags (id int);').schema);
    expect(r).toEqual({ added: 1, updated: 2, removed: 0 });
    const u = s().nodes.find((n) => n.id === users.id)!;
    expect(u.position).toEqual({ x: 900, y: 40 });
    expect(tableOf(u).accent).toBe('#abcdef');
    expect(tableOf(u).columns.map((c) => c.name)).toEqual(['id', 'email', 'age']);
    expect(s().edges).toHaveLength(1);
    const rel = relationOf(s().edges[0])!;
    expect(tableOf(s().nodes.find((n) => n.id === s().edges[0].source)!).columns.some((c) => c.id === rel.fromCol)).toBe(true);
    const tags = s().nodes.find((n) => tableOf(n).label === 'tags')!;
    expect(tags.position.x).toBeGreaterThan(900);
  });
  it('removes missing tables only when asked', () => {
    s().loadDiagram(schemaToDiagram(parseSql(BASE).schema));
    expect(mergeSchemaIntoPage(parseSql('CREATE TABLE users (id int);').schema)).toEqual({ added: 0, updated: 1, removed: 0 });
    expect(labels()).toEqual(['orders', 'users']);
    expect(mergeSchemaIntoPage(parseSql('CREATE TABLE users (id int);').schema, { removeMissing: true })).toEqual({ added: 0, updated: 1, removed: 1 });
    expect(labels()).toEqual(['users']);
    expect(s().edges).toHaveLength(0);
  });
  it('applySchema routes the update target', () => {
    s().loadDiagram(schemaToDiagram(parseSql(BASE).schema));
    expect(applySchema(parseSql(BASE).schema, 'update')).toBe(2);
    expect(labels()).toEqual(['orders', 'users']);
  });
});

describe('groupByPrefix', () => {
  it('packs blocks into a screen-shaped area, related blocks side by side, without overlaps', () => {
    const t = (n: string, ref?: string) => `CREATE TABLE ${n} (id int PRIMARY KEY${ref ? `, r int REFERENCES ${ref}(id)` : ''});`;
    const sql = ['users', ...['a', 'b', 'c', 'd', 'e', 'f'].flatMap((p) => [t(`${p}_one`, 'users'), t(`${p}_two`, `${p}_one`), t(`${p}_three`, `${p}_one`)]), 'CREATE TABLE z_one (id int PRIMARY KEY);', t('z_two', 'z_one')].map((x) => (x === 'users' ? t('users') : x)).join('\n');
    const d = schemaToDiagram(parseSql(sql).schema);
    const nodes = groupByPrefix(d.nodes, '', d.edges);
    const roots = nodes.filter((n) => !n.parentId).map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, ...nodeSize(n) }));
    const w = Math.max(...roots.map((r) => r.x + r.width)) - Math.min(...roots.map((r) => r.x));
    const h = Math.max(...roots.map((r) => r.y + r.height)) - Math.min(...roots.map((r) => r.y));
    expect(w / h).toBeLessThan(3);
    expect(h / w).toBeLessThan(3);
    for (const a of roots) for (const b of roots) if (a.id < b.id) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    for (const g of nodes.filter((n) => n.type === 'group')) for (const k of nodes.filter((n) => n.parentId === g.id)) {
      expect(k.position.x + nodeSize(k).width).toBeLessThanOrEqual(g.width!);
      expect(k.position.y + nodeSize(k).height).toBeLessThanOrEqual(g.height!);
    }
  });
  it('groups prefixes with >= 2 members under a group node with a shared accent', () => {
    expect(tablePrefix('dg_a')).toBe('dg');
    expect(tablePrefix('_x')).toBe('');
    const d = schemaToDiagram(parseSql('CREATE TABLE dg_a (id int);\nCREATE TABLE dg_b (id int);\nCREATE TABLE solo_x (id int);\nCREATE TABLE plain (id int);').schema);
    const nodes = groupByPrefix(d.nodes);
    const g = nodes.find((n) => n.type === 'group')!;
    expect(g.data.label).toBe('dg');
    const kids = nodes.filter((n) => n.parentId === g.id);
    expect(kids.map((n) => tableOf(n).label).sort()).toEqual(['dg_a', 'dg_b']);
    expect(new Set(kids.map((n) => tableOf(n).accent)).size).toBe(1);
    expect(nodes.filter((n) => n.type === 'group')).toHaveLength(1);
    expect(nodes.indexOf(g)).toBeLessThan(nodes.indexOf(kids[0]));
  });
});
