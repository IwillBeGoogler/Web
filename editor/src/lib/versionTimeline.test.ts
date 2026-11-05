import { describe, expect, it } from 'vitest';
import type { VersionMeta } from '../api/types';
import type { Project } from '../types';
import { authorLabel, changeNote, groupByDay, pageOf, playNext, playStart, sortAscending, stepSelection } from './versionTimeline';

const meta = (version: number, createdAt = 1_700_000_000_000 + version * 60_000, extra: Partial<VersionMeta> = {}): VersionMeta => ({ version, name: 'P', label: null, createdBy: 'u1', createdAt, ...extra });
const doc = (labels: string[], pages = 1): Project =>
  ({ version: 2, id: 'f', name: 'F', createdAt: 1, updatedAt: 1, activePageId: 'p', pages: Array.from({ length: pages }, (_, k) => ({ id: k ? `p${k}` : 'p', name: 'P', nodes: k ? [] : labels.map((l) => ({ id: l, type: 'icon', position: { x: 0, y: 0 }, data: { label: l }, selected: true })), edges: [] })) }) as unknown as Project;

describe('stepSelection', () => {
  it('arrows walk oldest..newest then live; ← from live goes to the newest; bounded at both ends', () => {
    expect(stepSelection(null, -1, 3)).toBe(2);
    expect(stepSelection(2, 1, 3)).toBeNull();
    expect(stepSelection(null, 1, 3)).toBeNull();
    expect(stepSelection(1, -1, 3)).toBe(0);
    expect(stepSelection(0, -1, 3)).toBe(0);
    expect(stepSelection(null, -1, 0)).toBeNull();
  });
});

describe('play', () => {
  it('steps forward and ends (null) after the newest version', () => {
    expect(playNext(null, 3)).toBe(0);
    expect(playNext(0, 3)).toBe(1);
    expect(playNext(1, 3)).toBe(2);
    expect(playNext(2, 3)).toBeNull();
    expect(playNext(null, 0)).toBeNull();
  });
  it('starts from the selected version, or the oldest when on live / already at the end', () => {
    expect(playStart(1, 3)).toBe(1);
    expect(playStart(null, 3)).toBe(0);
    expect(playStart(2, 3)).toBe(0);
    expect(playStart(null, 0)).toBeNull();
  });
});

describe('history shape', () => {
  it('sorts oldest first without mutating', () => {
    const src = [meta(3), meta(1), meta(2)];
    expect(sortAscending(src).map((v) => v.version)).toEqual([1, 2, 3]);
    expect(src.map((v) => v.version)).toEqual([3, 1, 2]);
  });
  it('groups consecutive versions by calendar day (a long history gets day headings)', () => {
    const day = 86_400_000;
    const base = new Date(2025, 0, 10, 12).getTime();
    const g = groupByDay([meta(1, base), meta(2, base + 1000), meta(3, base + day), meta(4, base + 2 * day), meta(5, base + 2 * day + 5)]);
    expect(g.map((x) => [x.from, x.count])).toEqual([[0, 2], [2, 1], [3, 2]]);
    expect(groupByDay([])).toEqual([]);
  });
  it('a 2000-version history groups and sorts quickly', () => {
    const many = Array.from({ length: 2000 }, (_, i) => meta(2000 - i, 1_700_000_000_000 + i * 600_000));
    const t = performance.now();
    expect(groupByDay(sortAscending(many)).reduce((n, g) => n + g.count, 0)).toBe(2000);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('authorLabel', () => {
  it('gives the name when known; null for missing / system ids (the UI says "Unknown author")', () => {
    expect(authorLabel('u1', { u1: 'Ada' })).toBe('Ada');
    expect(authorLabel('u2', { u1: 'Ada' })).toBeNull();
    expect(authorLabel('0', { 0: 'x' })).toBeNull();
    expect(authorLabel('', {})).toBeNull();
    expect(authorLabel(undefined, {})).toBeNull();
  });
});

describe('pageOf / changeNote', () => {
  it('draws the open page (else the first) and drops selection state', () => {
    const d = doc(['a', 'b'], 2);
    expect(pageOf(d, 'p').nodes.map((n) => [n.id, n.selected])).toEqual([['a', false], ['b', false]]);
    expect(pageOf(d, 'p1').nodes).toEqual([]);
    expect(pageOf(d, 'gone').nodes).toHaveLength(2);
  });
  it('first version has nothing to compare; later ones say what changed', () => {
    expect(changeNote(null, doc(['a'])).summary).toBe('First version');
    const n = changeNote(doc(['a', 'b']), doc(['a', 'c']));
    expect(n.summary).toBe('1 added, 1 removed');
    expect(n.details).toEqual(['+ c', '− b']);
    expect(changeNote(doc(['a']), doc(['a'])).summary).toBe('No differences');
  });
});
