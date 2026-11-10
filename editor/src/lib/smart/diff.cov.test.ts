import { describe, expect, it } from 'vitest';
import { alignIds, diffReport, propChanges } from '@core/diff';
import type { CPage } from '@core/types';

const node = (id: string, label: string, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({ id, type: 'shape', position: { x: 0, y: 0 }, data: { label, ...data }, ...extra });
const page = (nodes: any[], edges: any[] = []): CPage => ({ id: 'p', name: 'P', nodes, edges });
const paths = (a: any, b: any) => propChanges(a, b).map((c) => c.path);

describe('propChanges', () => {
  it('node position counts (rounded) but sizes and transient keys do not', () => {
    expect(paths(node('a', 'A'), node('a', 'A', { position: { x: 0.4, y: 0.2 } }))).toEqual([]);
    const c = propChanges(node('a', 'A'), node('a', 'A', { position: { x: 10, y: 20 }, selected: true, width: 9 }));
    expect(c).toHaveLength(1);
    expect(c[0].text).toBe('moved {"x":0,"y":0} → {"x":10,"y":20}');
    expect(paths({ id: 'a', data: {} }, { id: 'a', data: {}, position: { x: 1, y: 1 } })).toEqual(['position']);
  });
  it('top-level keys: added, removed, changed with describe() wording', () => {
    const c = propChanges(node('a', 'A', { type: 'x' }), node('a', 'A', { type: 'y', parentId: 'g' }));
    expect(c.map((x) => x.text)).toEqual(['type: “x” → “y”', 'parentId: added “g”']);
    expect(propChanges(node('a', 'A', { parentId: 'g' }), node('a', 'A'))[0].text).toBe('parentId: removed (was “g”)');
    expect(propChanges(node('a', 'A', { n: 1 }), node('a', 'A', { n: { k: 1 } }))[0].text).toBe('n: 1 → {"k":1}');
  });
  it('data fields strip the data. prefix; non-object data treated as empty', () => {
    const c = propChanges(node('a', 'A', {}, { icon: 'x' }), node('a', 'B', {}, { icon: 'x', size: 3 }));
    expect(c.map((x) => x.text)).toEqual(['label: “A” → “B”', 'size: added 3']);
    expect(paths({ id: 'a', data: null }, { id: 'a', data: undefined })).toEqual([]);
    expect(paths({ id: 'a', data: [1] }, { id: 'a', data: { x: 1 } })).toEqual(['data.x']);
  });
  it('columns: removed, added, field changes, id ignored, missing type', () => {
    const before = node('t', 'T', {}, { columns: [{ name: 'a', type: 'int', id: '1' }, { name: 'b' }, { name: 'c', type: 'text' }] });
    const after = node('t', 'T', {}, { columns: [{ name: 'a', type: 'bigint', id: '2' }, { name: 'c', type: 'text' }, { name: 'd', type: 'date' }, { name: 'e' }] });
    const t = propChanges(before, after).map((x) => x.text);
    expect(t).toContain('column removed: b');
    expect(t).toContain('column added: d date');
    expect(t).toContain('column added: e');
    expect(t).toContain('column a.type: “int” → “bigint”');
    expect(t.some((x) => x.includes('a.id'))).toBe(false);
    expect(paths(node('t', 'T', {}, { columns: [{ name: 'a' }] }), node('t', 'T'))).toEqual(['columns.a']);
    expect(paths(node('t', 'T'), node('t', 'T', {}, { columns: [{ name: 'a' }] }))).toEqual(['columns.a']);
  });
  it('non-array columns fall through to a plain data change', () => {
    expect(paths(node('t', 'T', {}, { columns: 'x' }), node('t', 'T', {}, { columns: 'y' }))).toEqual(['data.columns']);
  });
  it('edges: render styling ignored, position ignored, relation diffed per field, markers listed', () => {
    const e = (extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({ id: 'e', source: 'a', target: 'b', data, ...extra });
    expect(paths(e({ type: 'smooth', animated: true }), e({ type: 'step', animated: false }))).toEqual([]);
    expect(paths(e({ position: { x: 1, y: 1 } }), e({ position: { x: 9, y: 9 } }))).toEqual([]);
    expect(paths(e({ label: 'x' }), e({ label: 'y' }))).toEqual(['label']);
    expect(paths(e({}, { relation: { from: '1', to: 'n' } }), e({}, { relation: { from: '1', to: '1', extra: 1 } }))).toEqual(['relation.to', 'relation.extra']);
    expect(paths(e({}, { relation: { a: 1 } }), e({}, { relation: 'x' }))).toEqual([]);
    expect(paths(e({}, { type: 'a' }), e({}, { type: 'b' }))).toEqual([]);
    expect(paths(e({}, { startMarker: 'a' }), e({}, { startMarker: 'b', dashed: true }))).toEqual(['data.startMarker', 'data.dashed']);
    expect(paths(e({}, { other: 1 }), e({}, { other: 2 }))).toEqual(['data.other']);
    expect(paths({ id: 'e', data: { relation: 1 } }, { id: 'e', source: 'a', data: { relation: 2 } })).toEqual(['source']);
  });
  it('non-edge relation changes are plain data changes', () => {
    expect(paths(node('n', 'N', {}, { relation: 1 }), node('n', 'N', {}, { relation: 2 }))).toEqual(['data.relation']);
  });
});

describe('alignIds', () => {
  it('re-keys unique type+label matches, keeps same ids, rewrites edges and parents', () => {
    const base = page([node('b1', 'API'), node('b2', 'DB'), node('b3', 'Cache')], [{ id: 'be', source: 'b1', target: 'b2', label: 'sql' }]);
    const other = page([node('x1', ' api '), node('x2', 'db'), node('b3', 'Cache'), node('x4', 'Child', { parentId: 'x1' })], [{ id: 'xe', source: 'x1', target: 'x2', label: 'sql' }, { id: 'new', source: 'x2', target: 'x1' }]);
    const out = alignIds(base, other);
    expect(out.nodes.map((n) => n.id)).toEqual(['b1', 'b2', 'b3', 'x4']);
    expect(out.nodes[3].parentId).toBe('b1');
    expect(out.edges.map((e) => e.id)).toEqual(['be', 'new']);
    expect(out.edges[1]).toMatchObject({ source: 'b2', target: 'b1' });
    expect(other.nodes[0].id).toBe('x1');
  });
  it('ambiguous labels, taken ids and colliding edges are not matched', () => {
    const base = page([node('b1', 'Dup'), node('b2', 'Dup'), node('b3', 'One')], [{ id: 'be', source: 'b1', target: 'b3' }]);
    const other = page([node('x1', 'Dup'), node('x2', 'One'), node('x3', 'One')], [{ id: 'e1', source: 'b1', target: 'b3' }, { id: 'e2', source: 'b1', target: 'b3' }]);
    const out = alignIds(base, other);
    expect(out.nodes.map((n) => n.id)).toEqual(['x1', 'x2', 'x3']);
    expect(out.edges.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
  it('base node already present in other under its own id blocks the match; null labels', () => {
    const base = page([node('b1', 'A'), { id: 'b2', type: 'shape', position: { x: 0, y: 0 }, data: {} }], [{ id: 'be', source: 'b1', target: 'b2' }]);
    const other = page([node('b1', 'Z'), node('x1', 'A'), { id: 'x2', type: 'shape', position: { x: 0, y: 0 }, data: {} }], [{ id: 'be', source: 'b1', target: 'x2' }, { id: 'n', source: 'b1', target: 'b2' }]);
    const out = alignIds(base, other);
    expect(out.nodes.map((n) => n.id)).toEqual(['b1', 'x1', 'b2']);
    expect(out.edges.map((e) => e.id)).toEqual(['be', 'n']);
  });
  it('an edge matching a base edge that another edge already kept is not re-keyed', () => {
    const base = page([node('a', 'A'), node('b', 'B')], [{ id: 'be', source: 'a', target: 'b' }]);
    const other = page([node('a', 'A'), node('b', 'B')], [{ id: 'be', source: 'a', target: 'b' }, { id: 'dup', source: 'a', target: 'b' }]);
    expect(alignIds(base, other).edges.map((e) => e.id)).toEqual(['be', 'dup']);
  });
});

describe('diffReport', () => {
  const empty = { nodes: { added: [], removed: [], changed: [] }, edges: { added: [], removed: [], changed: [] } };
  const o = { title: 'T|x', from: 'v1', to: 'v2' };
  it('no differences', () => {
    expect(diffReport(empty, o)).toBe('# Change report: T\\|x\n\nComparing **v1** → **v2**\n\nNo differences.\n');
  });
  it('renamed only', () => {
    const r = diffReport({ ...empty, nameChanged: { from: 'a', to: 'b' } }, o);
    expect(r).toContain('Summary: renamed only');
    expect(r).toContain('Renamed “a” → “b”');
  });
  it('full report: added/removed/changed nodes, edges, comments, icons, escaping', () => {
    const before = node('c', 'Old', {}, { v: 'a\nb' });
    const after = node('c', 'New', {}, { v: 'a|b', obj: { k: 1 }, gone: undefined });
    const diff = {
      nameChanged: null,
      nodes: {
        added: [node('n1', 'Add|ed', {}, { iconId: 'db' }), node('n2', '', {}, { groupIcon: 'g' }), { id: 'n3', data: undefined }],
        removed: [node('r1', 'Rem')],
        changed: [{ id: 'c', before, after, fields: [] }],
      },
      edges: {
        added: [{ id: 'e1', source: 'n1', target: 'r1', label: 'lbl' }],
        removed: [{ id: 'e2', source: 'zz', target: 'c' }],
        changed: [{ id: 'e3', before: { id: 'e3', source: 'n1', target: 'c', label: 'a' }, after: { id: 'e3', source: 'n1', target: 'c', label: 'b\nc' }, fields: [] }],
      },
    };
    const r = diffReport(diff as any, { ...o, nodes: [node('zz', 'Zed')], comments: [{ nodeId: 'c', author: 'me', body: ' hi\n there ' }, { author: 'you', body: 'plain' }] });
    expect(r).toContain('Summary: 4 added, 2 removed, 2 changed');
    expect(r).toContain('- **Add\\|ed** (`n1`, db)');
    expect(r).toContain('- **n2** (`n2`, g)');
    expect(r).toContain('- **n3** (`n3`)');
    expect(r).toContain('## Removed');
    expect(r).toContain('### New (`c`)');
    expect(r).toContain('| label | Old | New |');
    expect(r).toContain('| v | a b | a\\|b |');
    expect(r).toContain('| obj |  | {"k":1} |');
    expect(r).toContain('- Added: **Add\\|ed** → **Rem** “lbl”');
    expect(r).toContain('- Removed: **Zed** → **Old**');
    expect(r).toContain('- Changed: **Add\\|ed** → **Old** “b c” (label: “a” → “b\nc”'.replace('\n', ' '));
    expect(r).toContain('- **me** on *Old*: hi there');
    expect(r).toContain('- **you**: plain');
  });
  it('summary lists only non-zero counts', () => {
    const r = diffReport({ ...empty, nodes: { ...empty.nodes, removed: [node('r', 'R')] } } as any, o);
    expect(r).toContain('Summary: 1 removed');
  });
});
