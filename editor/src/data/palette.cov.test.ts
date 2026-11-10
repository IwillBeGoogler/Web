import { describe, expect, it } from 'vitest';
import type { CatalogItem } from './catalog';
import { createNodeFromPaletteItem, createNodesFromPaletteItem, filterPalette, getItem, PALETTE } from './palette';
import { useBoardStore } from '../store/boardStore';

const item = (id: string, kind: CatalogItem['kind'], over: Partial<CatalogItem> = {}): CatalogItem => ({ id, label: id, kind, aliases: [], tags: [], keywords: [], ...over });
const at = { x: 3, y: 4 };
const mk = (i: CatalogItem) => createNodeFromPaletteItem(i, at, 'n1');

describe('createNodeFromPaletteItem', () => {
  it('group / cluster / card use the preset size or defaults', () => {
    expect(mk(item('g', 'group'))).toMatchObject({ type: 'group', width: 320, height: 220, style: { width: 320, height: 220 }, data: { label: 'Group' } });
    expect(mk(item('g', 'group', { preset: { width: 10, height: 20, data: { label: 'X' } } }))).toMatchObject({ width: 10, height: 20, data: { label: 'X' } });
    expect(mk(item('c', 'cluster'))).toMatchObject({ type: 'cluster', width: 420, height: 260, data: { label: 'Cluster' } });
    expect(mk(item('c', 'cluster', { iconId: 'redis', profileId: 'redis', preset: { width: 5, height: 6, data: {} } }))).toMatchObject({ width: 5, data: { iconId: 'redis' } });
    expect(mk(item('c', 'cluster', { iconId: 'redis' })).data).not.toHaveProperty('iconId');
    expect(mk(item('k', 'card'))).toMatchObject({ type: 'card', width: 200, height: 120, data: { layout: 'vertical', tags: [] } });
    expect(mk(item('k', 'card', { preset: { width: 1, height: 2, data: { layout: 'horizontal' } } }))).toMatchObject({ width: 1, data: { layout: 'horizontal' } });
  });
  it('text, sticky, shape, junction, stamp, frame, mindmap', () => {
    expect(mk(item('t', 'text'))).toMatchObject({ type: 'text', data: { label: 'Title', fontSize: 20, bold: true } });
    expect(mk(item('t', 'text'))).not.toHaveProperty('width');
    expect(mk(item('t', 'text', { preset: { width: 9, height: 8, data: { label: 'Hi' } } }))).toMatchObject({ width: 9, height: 8, data: { label: 'Hi' } });
    expect(mk(item('s', 'sticky'))).toMatchObject({ type: 'sticky', width: 160, height: 140, data: { label: 'Note' } });
    expect(mk(item('s', 'sticky', { preset: { width: 1, height: 1, data: { fill: '#000' } } })).data.fill).toBe('#000');
    expect(mk(item('sh', 'shape'))).toMatchObject({ type: 'shape', width: 140, height: 90, data: { shape: 'rect' } });
    expect(mk(item('sh', 'shape', { shape: 'circle' as never })).data.shape).toBe('circle');
    expect(mk(item('j', 'junction'))).toMatchObject({ type: 'junction', width: 10, height: 10 });
    expect(mk(item('f', 'frame'))).toMatchObject({ type: 'frame', data: { label: 'Frame' } });
    expect(mk(item('f', 'frame', { preset: { width: 11, height: 12, data: {} } }))).toMatchObject({ width: 11, height: 12 });
    expect(mk(item('m', 'mindmap')).position).toEqual(at);
  });
  it('stamp uses the preset emoji or the board stamp', () => {
    useBoardStore.setState({ stampEmoji: '🔥' } as never);
    expect(mk(item('st', 'stamp')).data.emoji).toBe('🔥');
    expect(mk(item('st', 'stamp', { preset: { width: 1, height: 1, data: { emoji: '👍' } } })).data.emoji).toBe('👍');
  });
  it('ER tables: view, enum, plain, junction', () => {
    expect(mk(item('er-table', 'table')).type).toBe('table');
    expect(JSON.stringify(mk(item('er-view', 'table')))).toContain('view_name');
    expect(JSON.stringify(mk(item('er-enum', 'table')))).toContain('enum_name');
    expect(JSON.stringify(mk(item('er-table', 'table')))).toContain('table_name');
    expect(mk(item('er-junction', 'table')).id).toBe('n1');
    expect(mk(item('er-junction', 'table'))).not.toEqual(mk(item('er-table', 'table')));
  });
  it('UML kinds pick their variant from the item id and fall back to a default', () => {
    const type = (i: CatalogItem) => mk(i).type;
    for (const id of ['uml-class', 'uml-interface', 'uml-abstract', 'uml-enum']) expect(type(item(id, 'class'))).toBe('class');
    expect(type(item('uml-lifeline', 'sequence'))).toBe(type(item('uml-seq', 'sequence')));
    expect(mk(item('uml-lifeline', 'sequence'))).not.toEqual(mk(item('uml-seq', 'sequence')));
    for (const id of ['uml-initial', 'uml-final', 'uml-choice', 'uml-fork', 'uml-join', 'uml-history', 'uml-deep-history', 'uml-entry-point', 'uml-exit-point', 'uml-state']) expect(mk(item(id, 'state')).id).toBe('n1');
    expect(mk(item('uml-initial', 'state')).data.label).toBe('');
    expect(mk(item('uml-state', 'state')).data.label).toBe('State');
    for (const id of ['uml-act-initial', 'uml-act-final', 'uml-act-flow-final', 'uml-act-decision', 'uml-act-fork', 'uml-act-object', 'uml-act-send', 'uml-act-accept', 'uml-act-note', 'uml-action']) expect(mk(item(id, 'activity')).id).toBe('n1');
    expect(mk(item('uml-actor', 'usecase'))).not.toEqual(mk(item('uml-uc', 'usecase')));
    for (const id of ['uml-node', 'uml-artifact', 'uml-provided', 'uml-required', 'uml-component']) expect(mk(item(id, 'component')).id).toBe('n1');
    for (const id of ['uml-dep-device', 'uml-dep-env', 'uml-dep-artifact', 'uml-dep-component', 'uml-dep-node']) expect(mk(item(id, 'deployment')).id).toBe('n1');
    expect(mk(item('uml-comm-object', 'object'))).not.toEqual(mk(item('uml-obj', 'object')));
    expect(mk(item('uml-timing-lifeline', 'timing'))).not.toEqual(mk(item('uml-timing', 'timing')));
  });
  it('icons carry subtitle and the producer / consumer client kind; unknown kinds fall through', () => {
    expect(mk(item('x', 'icon', { iconId: 'redis', subtitle: 'cache' }))).toMatchObject({ type: 'icon', data: { label: 'x', iconId: 'redis', subtitle: 'cache' } });
    expect(mk(item('x', 'icon', { iconId: 'redis' })).data).not.toHaveProperty('subtitle');
    expect(mk(item('producer', 'icon')).data.clientKind).toBe('producer');
    expect(mk(item('consumer', 'icon')).data.clientKind).toBe('consumer');
    expect(mk(item('x', 'tool')).type).toBe('icon');
  });
  it('a consumer group is a dashed group holding three consumers, other items are single nodes', () => {
    let n = 0;
    const gen = (p: string) => `${p}${++n}`;
    const nodes = createNodesFromPaletteItem(item('consumer-group', 'group'), at, gen);
    expect(nodes).toHaveLength(4);
    expect(nodes.slice(1).every((c) => c.parentId === nodes[0].id && c.data.clientKind === 'consumer')).toBe(true);
    expect(createNodesFromPaletteItem(item('x', 'icon'), at, gen)).toHaveLength(1);
  });
});

describe('palette lookups', () => {
  it('getItem resolves ids and returns undefined for unknown', () => {
    const first = PALETTE[0];
    expect(getItem(first.id)).toBe(first);
    expect(getItem('definitely-not-an-item')).toBeUndefined();
  });
  it('filterPalette returns everything for a blank query and only members of the list otherwise', () => {
    const subset = PALETTE.slice(0, 5);
    expect(filterPalette(subset, '  ')).toBe(subset);
    const q = subset[0].label;
    const res = filterPalette(subset, q);
    expect(res.every((i) => subset.includes(i))).toBe(true);
    expect(res).toContain(subset[0]);
    expect(filterPalette(subset, 'zzzzqqqq-no-match')).toEqual([]);
  });
});
