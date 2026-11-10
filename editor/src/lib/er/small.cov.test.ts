import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { anchorY, isTableRelation, relationSides, selfLoopPoints } from './anchor';
import { cardinalityOf, flipCardinality, isErMarker, isOptionalFk, relationEnds } from './cardinality';
import { ER, footerLines, nextColumnId, rowCenterY, tableHeight, tableSize, tableWidth, visibleColumns, withTableSize } from './geometry';
import { searchTables } from './search';
import { emptySchema, findTable, newColumn, newTable, schemaCounts } from './types';
import { isRelationEdge, isTableNode, relationOf, tableOf } from './tableData';
import { blankTable, relationEdge } from './relations';
import { groupByPrefix, tablePrefix } from './group';
import { layoutTables, parentChild } from './layout';

const tbl = (id: string, label: string, x = 0, y = 0) => blankTable(id, { x, y }, label);
const edge = (id: string, s: string, t: string, card: '1:1' | '1:N' | 'N:1' | 'N:M' = '1:N'): DiagramEdge =>
  relationEdge(id, s, t, { cardinality: card, identifying: false, optional: false });

describe('anchor', () => {
  it('relationSides picks facing sides or both right when overlapping', () => {
    const r = (x: number) => ({ x, y: 0, width: 100, height: 50 });
    expect(relationSides(r(0), r(200))).toEqual(['right', 'left']);
    expect(relationSides(r(200), r(0))).toEqual(['left', 'right']);
    expect(relationSides(r(0), r(50))).toEqual(['right', 'right']);
  });
  it('isTableRelation needs a relation edge between two table nodes', () => {
    const a = tbl('a', 'a'), b = tbl('b', 'b');
    const m = new Map([['a', a], ['b', b], ['g', { ...a, id: 'g', type: 'group' } as DiagramNode]]);
    expect(isTableRelation(m, edge('e', 'a', 'b'))).toBe(true);
    expect(isTableRelation(m, edge('e', 'a', 'g'))).toBe(false);
    expect(isTableRelation(m, { id: 'x', source: 'a', target: 'b' } as DiagramEdge)).toBe(false);
  });
  it('anchorY is the row centre offset by rect.y; self loops widen with distance and keep min 14 gap', () => {
    const a = tbl('a', 'a');
    const rect = { x: 10, y: 100, width: 200, height: 100 };
    const [c0, c1] = tableOf(a).columns;
    expect(anchorY(rect, a, c0.id)).toBe(100 + rowCenterY(tableOf(a), c0.id));
    const same = selfLoopPoints(rect, a, c0.id, c0.id);
    expect(same.points[3].y - same.points[0].y).toBe(14);
    expect(same.points[0].x).toBe(213);
    expect(same.src.side).toBe('right');
    const far = selfLoopPoints(rect, a, c0.id, c1.id, 0);
    expect(far.points[0].x).toBe(210);
    expect(far.points[1].x - far.points[0].x).toBeGreaterThanOrEqual(26);
    expect(far.points[1].x - far.points[0].x).toBeLessThanOrEqual(64);
    // a hugely tall table caps the loop at 64
    const big = tableOf(a);
    const tall = { ...a, data: { ...big, columns: Array.from({ length: 40 }, (_, i) => ({ ...big.columns[0], id: `k${i}` })) } } as unknown as DiagramNode;
    const l = selfLoopPoints(rect, tall, 'k0', 'k39');
    expect(l.points[1].x - l.points[0].x).toBe(64);
  });
});

describe('cardinality', () => {
  const col = (name: string, extra = {}) => newColumn(name, 'int', extra);
  it('cardinalityOf: unique single col, whole pk, unique index (non-partial) => 1:1', () => {
    const t = newTable('t', [col('id', { pk: true }), col('a'), col('b')]);
    expect(cardinalityOf(t, col('x', { unique: true }))).toBe('1:1');
    expect(cardinalityOf(t, [col('x', { unique: true }), col('y')])).toBe('1:N');
    expect(cardinalityOf(t, col('id'))).toBe('1:1');
    expect(cardinalityOf(t, col('a'))).toBe('1:N');
    t.indexes.push({ columns: ['a', 'b'], unique: true });
    expect(cardinalityOf(t, [col('a'), col('b')])).toBe('1:1');
    t.indexes[0].where = 'x > 1';
    expect(cardinalityOf(t, [col('a'), col('b')])).toBe('1:N');
    t.indexes[0] = { columns: ['a'], unique: false };
    expect(cardinalityOf(t, col('a'))).toBe('1:N');
  });
  it('isOptionalFk: nullable non-pk', () => {
    expect(isOptionalFk(col('a'))).toBe(true);
    expect(isOptionalFk([col('a', { nullable: false }), col('b', { pk: true })])).toBe(false);
    expect(isOptionalFk([col('a', { nullable: false }), col('b')])).toBe(true);
  });
  it('relationEnds for each cardinality/flag combo', () => {
    expect(relationEnds({ cardinality: '1:1', optional: false })).toEqual({ start: 'one', end: 'zeroOrOne' });
    expect(relationEnds({ cardinality: '1:1', optional: true, manyRequired: true })).toEqual({ start: 'zeroOrOne', end: 'one' });
    expect(relationEnds({ cardinality: '1:N', optional: true, manyRequired: true })).toEqual({ start: 'zeroOrOne', end: 'oneOrMany' });
    expect(relationEnds({ cardinality: 'N:1', optional: false })).toEqual({ start: 'zeroOrMany', end: 'one' });
    expect(relationEnds({ cardinality: 'N:M', optional: false, manyRequired: true })).toEqual({ start: 'oneOrMany', end: 'oneOrMany' });
  });
  it('flipCardinality and isErMarker', () => {
    expect(flipCardinality('1:N')).toBe('N:1');
    expect(flipCardinality('N:1')).toBe('1:N');
    expect(flipCardinality('1:1')).toBe('1:1');
    expect(flipCardinality('N:M')).toBe('N:M');
    expect(isErMarker('many')).toBe(true);
    expect(isErMarker(undefined)).toBe(false);
    expect(isErMarker('arrow' as never)).toBe(false);
  });
});

describe('geometry', () => {
  const d = tableOf(tbl('a', 'a'));
  it('visibleColumns when collapsed keeps pk/fk only', () => {
    const cols = [{ ...d.columns[0], pk: true }, { ...d.columns[1], pk: false, fk: { table: 'x', column: 'id' } }, { ...d.columns[1], id: 'z', pk: false }];
    const c = { ...d, columns: cols, collapsed: true };
    expect(visibleColumns(c).map((x) => x.id)).toEqual([cols[0].id, cols[1].id]);
    expect(visibleColumns({ ...c, collapsed: false })).toHaveLength(3);
  });
  it('footerLines: 0 collapsed, n up to the max, then max+1', () => {
    const ix = (n: number) => Array.from({ length: n }, () => ({ columns: ['id'], unique: false }));
    expect(footerLines({ ...d, collapsed: true, indexes: ix(3) })).toBe(0);
    expect(footerLines({ ...d, indexes: ix(3), checks: [] })).toBe(3);
    expect(footerLines({ ...d, indexes: ix(5), checks: [] })).toBe(5);
    expect(footerLines({ ...d, indexes: ix(4), checks: [{ expr: 'a' }, { expr: 'b' }] })).toBe(ER.maxFooterLines + 1);
  });
  it('tableHeight grows with footer; width clamps and includes schema', () => {
    const base = tableHeight(d);
    expect(tableHeight({ ...d, indexes: [{ columns: ['id'], unique: false }] })).toBe(base + ER.footerPad + ER.footerLine);
    expect(tableWidth({ ...d, label: 'x', columns: [] })).toBe(ER.minW);
    expect(tableWidth({ ...d, label: 'x'.repeat(100) })).toBe(ER.maxW);
    expect(tableWidth({ ...d, schema: 'abcdef', label: 'x'.repeat(14), columns: [] })).toBeGreaterThan(ER.minW);
    const sz = tableSize(d);
    expect(sz).toEqual({ width: tableWidth(d), height: tableHeight(d) });
  });
  it('rowCenterY falls back to the header centre for unknown / undefined columns', () => {
    expect(rowCenterY(d, undefined)).toBe(rowCenterY(d, 'nope'));
    expect(rowCenterY(d, d.columns[1].id)).toBe(rowCenterY(d, d.columns[0].id) + ER.rowH);
  });
  it('withTableSize merges style; nextColumnId skips non-c ids', () => {
    const n = withTableSize({ ...tbl('a', 'a'), style: { color: 'red' } });
    expect(n.style).toMatchObject({ color: 'red', width: n.width, height: n.height });
    expect(withTableSize(tbl('b', 'b')).style).toMatchObject({ width: expect.any(Number) });
    const noStyle = tbl('c', 'c');
    delete (noStyle as { style?: unknown }).style;
    expect(withTableSize(noStyle).style).toEqual({ width: noStyle.width ?? expect.any(Number), height: expect.any(Number) });
    expect(nextColumnId({ columns: [] })).toBe('c0');
    expect(nextColumnId({ columns: [{ id: 'c4' }, { id: 'abc' }, { id: 'c2' }] as never })).toBe('c5');
  });
});

describe('tableData predicates', () => {
  it('isTableNode / isRelationEdge', () => {
    expect(isTableNode(tbl('a', 'a'))).toBe(true);
    expect(isTableNode(undefined)).toBe(false);
    expect(isTableNode({ ...tbl('a', 'a'), type: 'group' })).toBe(false);
    expect(isRelationEdge(edge('e', 'a', 'b'))).toBe(true);
    expect(isRelationEdge({ id: 'e', source: 'a', target: 'b' } as DiagramEdge)).toBe(false);
    expect(relationOf({ id: 'e', source: 'a', target: 'b' } as DiagramEdge)).toBeUndefined();
  });
});

describe('searchTables', () => {
  const a = tbl('a', 'orders');
  const b = { ...tbl('b', 'users'), data: { ...tableOf(tbl('b', 'users')), schema: 'app', columns: [{ ...tableOf(tbl('b', 'x')).columns[0], name: 'user_id', type: '' }] } } as unknown as DiagramNode;
  const g = { ...tbl('g', 'orders'), type: 'group' } as DiagramNode;
  it('needs >= 2 chars and ignores non-tables', () => {
    expect(searchTables([a, b, g], ' o ')).toEqual([]);
    expect(searchTables([a, g], 'orders').every((h) => h.nodeId === 'a')).toBe(true);
  });
  it('finds tables (with schema detail) and columns, best first, honours limit', () => {
    const hits = searchTables([a, b], 'users');
    expect(hits[0]).toMatchObject({ kind: 'table', title: 'users', detail: '1 columns · app' });
    const col = searchTables([a, b], 'user_id').find((h) => h.kind === 'column')!;
    expect(col).toMatchObject({ title: 'users.user_id', detail: 'value' });
    expect(searchTables([a, b], 'users.user')[0].kind).toBe('column');
    expect(searchTables([a, b], 'ord', 1)).toHaveLength(1);
    expect(searchTables([a, b], 'zzzzqq')).toEqual([]);
  });
  it('ties break alphabetically', () => {
    const hits = searchTables([tbl('1', 'zz1'), tbl('2', 'aa1')], 'aa1').filter((h) => h.kind === 'table');
    const same = searchTables([tbl('1', 'abx'), tbl('2', 'aby')], 'ab').filter((h) => h.kind === 'table');
    expect(same.map((h) => h.title)).toEqual(['abx', 'aby']);
    expect(hits[0].title).toBe('aa1');
  });
});

describe('types helpers', () => {
  it('schemaCounts counts tables/views/columns/relations (composite groups once)/loose/enums/indexes', () => {
    const s = emptySchema();
    s.tables.push(
      newTable('a', [newColumn('id'), newColumn('p', 'int', { fk: { table: 'b', column: 'id', group: 'g' } }), newColumn('q', 'int', { fk: { table: 'b', column: 'id2', group: 'g' } }), newColumn('r', 'int', { fk: { table: 'c', column: 'id' } })], { indexes: [{ columns: ['id'], unique: true }] }),
      newTable('v', [newColumn('x')], { kind: 'view' }),
    );
    s.loose.push({ from: 'a', to: 'b', cardinality: 'N:M', identifying: false });
    s.enums.push({ name: 'e', values: [] });
    expect(schemaCounts(s)).toEqual({ tables: 1, views: 1, columns: 5, relations: 3, enums: 1, indexes: 1 });
  });
  it('findTable is case-insensitive as a fallback', () => {
    const s = emptySchema();
    s.tables.push(newTable('Users'), newTable('users'));
    expect(findTable(s, 'users')!.name).toBe('users');
    expect(findTable(s, 'USERS')!.name).toBe('Users');
    expect(findTable(s, 'zip')).toBeUndefined();
  });
});

describe('group / layout', () => {
  it('tablePrefix', () => {
    expect(tablePrefix('dg_users')).toBe('dg');
    expect(tablePrefix('_x')).toBe('');
    expect(tablePrefix('plain')).toBe('');
  });
  it('groupByPrefix: no groups returns same nodes; groups wrap members, order by links, keep ungrouped; skips nested', () => {
    const lone = [tbl('a', 'a_x'), tbl('b', 'b_y')];
    expect(groupByPrefix(lone)).toBe(lone);
    const ns = [tbl('1', 'dg_a', 0, 0), tbl('2', 'dg_b', 300, 0), tbl('3', 'us_a', 0, 300), tbl('4', 'us_b', 0, 600), tbl('5', 'solo', 5, 5), { ...tbl('6', 'dg_nested'), parentId: 'zz' }];
    const es = [edge('e1', '1', '2'), edge('e2', '2', '3'), edge('e3', '3', '4'), edge('e4', '1', '5'), edge('e5', '1', '1')];
    const out = groupByPrefix(ns, 'p_', es);
    const boxes = out.filter((n) => n.type === 'group');
    expect(boxes.map((b) => b.id).sort()).toEqual(['p_grp_dg', 'p_grp_us']);
    expect(out.indexOf(boxes[0])).toBeLessThan(out.findIndex((n) => n.id === '1'));
    expect(out.find((n) => n.id === '1')!.parentId).toBe('p_grp_dg');
    expect(out.find((n) => n.id === '6')!.parentId).toBe('zz');
    expect(out.find((n) => n.id === '5')!.parentId).toBeUndefined();
    expect(tableOf(out.find((n) => n.id === '1')!).accent).not.toBe(tableOf(out.find((n) => n.id === '3')!).accent);
    expect(out).toHaveLength(ns.length + 2);
  });
  it('groupByPrefix with only grouped tables and many groups wraps rows; accents cycle', () => {
    const ns: DiagramNode[] = [];
    for (let g = 0; g < 10; g++) for (let k = 0; k < 2; k++) ns.push(tbl(`${g}-${k}`, `g${g}_t${k}`));
    const out = groupByPrefix(ns);
    const boxes = out.filter((n) => n.type === 'group');
    expect(boxes).toHaveLength(10);
    expect(new Set(boxes.map((b) => b.position.y)).size).toBeGreaterThan(1);
  });
  it('parentChild flips for N:1', () => {
    expect(parentChild(edge('e', 'a', 'b', 'N:1'))).toEqual(['b', 'a']);
    expect(parentChild(edge('e', 'a', 'b', '1:N'))).toEqual(['a', 'b']);
    expect(parentChild({ id: 'e', source: 'a', target: 'b' } as DiagramEdge)).toEqual(['a', 'b']);
  });
  it('layoutTables: empty, isolates, cycles, chains, origin, relation weights', () => {
    expect(layoutTables([], []).size).toBe(0);
    const ns = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => tbl(id, id));
    const es = [edge('1', 'a', 'b'), edge('2', 'b', 'c'), edge('3', 'c', 'a'), edge('4', 'a', 'd'), edge('5', 'e', 'f', 'N:1'), edge('6', 'a', 'zzz')];
    const pos = layoutTables(ns, es, { origin: { x: 100, y: 50 } });
    expect(pos.size).toBe(8);
    expect(pos.get('a')!.x).toBeLessThan(pos.get('b')!.x);
    expect(pos.get('b')!.x).toBeLessThan(pos.get('c')!.x + 1);
    const xs = [...pos.values()].map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(100);
    const dup = new Set([...pos.values()].map((p) => `${p.x},${p.y}`));
    expect(dup.size).toBe(8);
  });
  it('layoutTables: tall layers wrap into lanes', () => {
    const ns = [tbl('root', 'root'), ...Array.from({ length: 30 }, (_, i) => tbl(`c${i}`, `c${i}`))];
    const es = ns.slice(1).map((n, i) => edge(`e${i}`, 'root', n.id));
    const pos = layoutTables(ns, es);
    expect(new Set([...pos.values()].map((p) => p.x)).size).toBeGreaterThan(2);
  });
});
