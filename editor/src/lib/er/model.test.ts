import { describe, expect, it } from 'vitest';
import { parseSql } from './sqlParse';
import { cardinalityOf, relationEnds } from './cardinality';
import { diagramToSchema, schemaToDiagram } from './convert';
import { layoutTables } from './layout';
import { createJunction, createRelation, blankTable, reverseRelation, pruneFks, setCardinality } from './relations';
import { nodeSize } from '../graph';
import { relationOf, tableOf } from './tableData';
import { rowCenterY, tableHeight } from './geometry';
import { newColumn, newTable } from './types';
import demo from './fixtures/demo_large.sql?raw';

describe('cardinality matrix', () => {
  const t = (cols: ReturnType<typeof newColumn>[], indexes: { columns: string[]; unique: boolean }[] = []) => newTable('t', cols, { indexes });
  it('plain FK is 1:N', () => {
    const c = newColumn('uid', 'int');
    expect(cardinalityOf(t([newColumn('id', 'int', { pk: true }), c]), c)).toBe('1:N');
  });
  it('unique FK is 1:1', () => {
    const c = newColumn('uid', 'int', { unique: true });
    expect(cardinalityOf(t([c]), c)).toBe('1:1');
  });
  it('sole primary key FK is 1:1', () => {
    const c = newColumn('uid', 'int', { pk: true });
    expect(cardinalityOf(t([c]), c)).toBe('1:1');
  });
  it('FK inside a composite PK is 1:N', () => {
    const a = newColumn('a', 'int', { pk: true });
    expect(cardinalityOf(t([a, newColumn('b', 'int', { pk: true })]), a)).toBe('1:N');
  });
  it('unique index on the column is 1:1', () => {
    const c = newColumn('uid', 'int');
    expect(cardinalityOf(t([c], [{ columns: ['uid'], unique: true }]), c)).toBe('1:1');
  });
  it('markers per cardinality', () => {
    expect(relationEnds({ cardinality: '1:N', optional: false })).toEqual({ start: 'one', end: 'zeroOrMany' });
    expect(relationEnds({ cardinality: '1:N', optional: true, manyRequired: true })).toEqual({ start: 'zeroOrOne', end: 'oneOrMany' });
    expect(relationEnds({ cardinality: 'N:1', optional: false })).toEqual({ start: 'zeroOrMany', end: 'one' });
    expect(relationEnds({ cardinality: '1:1', optional: false })).toEqual({ start: 'one', end: 'zeroOrOne' });
    expect(relationEnds({ cardinality: 'N:M', optional: false })).toEqual({ start: 'zeroOrMany', end: 'zeroOrMany' });
  });
});

describe('schema <-> diagram', () => {
  const { schema } = parseSql(demo);
  const d = schemaToDiagram(schema);
  it('creates a node per table and an edge per FK, with parent as source', () => {
    expect(d.nodes.length).toBe(23);
    const rel = d.edges.find((e) => relationOf(e)?.cardinality === '1:1');
    expect(rel).toBeTruthy();
    const self = d.edges.find((e) => e.source === e.target);
    expect(self).toBeTruthy();
  });
  it('edge endpoints reference real columns and row centres are computable', () => {
    for (const e of d.edges) {
      const r = relationOf(e)!;
      const p = tableOf(d.nodes.find((n) => n.id === e.source)!);
      const c = tableOf(d.nodes.find((n) => n.id === e.target)!);
      expect(p.columns.some((x) => x.id === r.fromCol)).toBe(true);
      expect(c.columns.some((x) => x.id === r.toCol)).toBe(true);
      expect(rowCenterY(c, r.toCol)).toBeGreaterThan(40);
      expect(rowCenterY(c, r.toCol)).toBeLessThan(tableHeight(c));
    }
  });
  it('round-trips through the diagram', () => {
    const back = diagramToSchema(d.nodes, d.edges);
    expect(back.tables.map((t) => t.name)).toEqual(schema.tables.map((t) => t.name));
    const fks = (s: typeof schema) => s.tables.flatMap((t) => t.columns.filter((c) => c.fk).map((c) => `${t.name}.${c.name}>${c.fk!.table}.${c.fk!.column}`)).sort();
    expect(fks(back)).toEqual(fks(schema));
  });
});

describe('layout', () => {
  const { schema } = parseSql(demo);
  const d = schemaToDiagram(schema);
  const rects = d.nodes.map((n) => ({ id: n.id, ...n.position, ...nodeSize(n) }));
  it('has no overlapping tables', () => {
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const hit = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(hit, `${a.id} overlaps ${b.id}`).toBe(false);
      }
  });
  it('puts parents left of children (acyclic edges)', () => {
    const by = new Map(rects.map((r) => [r.id, r]));
    for (const e of d.edges) {
      if (e.source === e.target) continue;
      const p = by.get(e.source)!, c = by.get(e.target)!;
      expect(p.x + p.width, `${e.source}->${e.target}`).toBeLessThanOrEqual(c.x);
    }
  });
  it('is deterministic', () => {
    const a = layoutTables(d.nodes, d.edges);
    const b = layoutTables(d.nodes, d.edges);
    expect([...a]).toEqual([...b]);
  });
  it('copes with cycles', () => {
    const s = parseSql('create table a (id int primary key, b_id int references b(id)); create table b (id int primary key, a_id int references a(id));').schema;
    const g = schemaToDiagram(s);
    expect(g.nodes.every((n) => Number.isFinite(n.position.x))).toBe(true);
  });
});

describe('relation editing', () => {
  const a = blankTable('a', { x: 0, y: 0 }, 'users');
  const b = blankTable('b', { x: 400, y: 0 }, 'orders');
  it('dragging a column onto a table creates the FK column and a relation', () => {
    const r = createRelation([a, b], [], { childId: 'b', parentId: 'a' }, (p) => `${p}1`)!;
    const child = tableOf(r.nodes.find((n) => n.id === 'b')!);
    const fk = child.columns.find((c) => c.id === r.fkColumnId)!;
    expect(fk).toMatchObject({ name: 'user_id', type: 'integer', fk: { table: 'users', column: 'id' } });
    expect(r.created).toBe(true);
    const rel = relationOf(r.edges[0])!;
    expect(r.edges[0]).toMatchObject({ source: 'a', target: 'b' });
    expect(rel).toMatchObject({ cardinality: '1:N', fromCol: 'c0', toCol: r.fkColumnId, optional: true });
    expect(r.edges[0].data).toMatchObject({ startMarker: 'zeroOrOne', endMarker: 'zeroOrMany' });
  });
  it('is idempotent for the same column pair', () => {
    const r1 = createRelation([a, b], [], { childId: 'b', parentId: 'a' })!;
    const r2 = createRelation(r1.nodes, r1.edges, { childId: 'b', childCol: r1.fkColumnId, parentId: 'a' })!;
    expect(r2.edges.length).toBe(1);
  });
  it('supports self references', () => {
    const r = createRelation([a], [], { childId: 'a', parentId: 'a' })!;
    expect(r.edges[0].source).toBe(r.edges[0].target);
    expect(tableOf(r.nodes[0]).columns.at(-1)!.name).toBe('parent_id');
  });
  it('N:M -> junction table', () => {
    const m = [a, b];
    const e = { ...createRelation(m, [], { childId: 'b', parentId: 'a' })!.edges[0] };
    const nm = setCardinality(e, 'N:M');
    const j = createJunction(m, [nm], nm.id, (p) => `${p}x`)!;
    const jt = tableOf(j.nodes.find((n) => n.id === j.junctionId)!);
    expect(jt.label).toBe('users_orders');
    expect(jt.columns.map((c) => [c.name, c.pk])).toEqual([['user_id', true], ['order_id', true]]);
    expect(j.edges.length).toBe(2);
    expect(j.edges.every((x) => x.target === j.junctionId && relationOf(x)!.cardinality === '1:N')).toBe(true);
  });
  it('reverse flips cardinality and ends', () => {
    const e = createRelation([a, b], [], { childId: 'b', parentId: 'a' })!.edges[0];
    const r = reverseRelation(e);
    expect(r).toMatchObject({ source: 'b', target: 'a' });
    expect(relationOf(r)!.cardinality).toBe('N:1');
    expect(r.data).toMatchObject({ startMarker: 'zeroOrMany', endMarker: 'zeroOrOne' });
  });
  it('pruneFks clears hints when the edge is gone', () => {
    const r = createRelation([a, b], [], { childId: 'b', parentId: 'a' })!;
    const out = pruneFks(r.nodes, []);
    expect(tableOf(out.find((n) => n.id === 'b')!).columns.some((c) => c.fk)).toBe(false);
  });
});
