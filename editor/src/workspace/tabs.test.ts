import { describe, expect, it } from 'vitest';
import { closeOthers, closeTab, cycleTab, emptyTabs, openTab, parseTabs, pruneTabs, reopenClosed, reorderTab } from './tabs';

const withTabs = (...ids: string[]) => ids.reduce((s, id) => openTab(s, id), emptyTabs());

describe('open', () => {
  it('opens at the end and activates; opening an open tab only activates', () => {
    const s = openTab(withTabs('a', 'b'), 'c');
    expect(s).toMatchObject({ open: ['a', 'b', 'c'], active: 'c' });
    expect(openTab(s, 'a')).toMatchObject({ open: ['a', 'b', 'c'], active: 'a' });
  });
  it('can open next to another tab or in the background', () => {
    expect(openTab(withTabs('a', 'b'), 'x', { after: 'a' }).open).toEqual(['a', 'x', 'b']);
    expect(openTab(withTabs('a'), 'x', { activate: false })).toMatchObject({ open: ['a', 'x'], active: 'a' });
  });
  it('re-opening removes it from the closed stack', () => {
    const s = openTab(closeTab(withTabs('a', 'b'), 'a'), 'a');
    expect(s.closed).toEqual([]);
  });
});

describe('close', () => {
  it('closing the active tab activates the right neighbour, else the left, else nothing', () => {
    let s = withTabs('a', 'b', 'c');
    s = openTab(s, 'b');
    s = closeTab(s, 'b');
    expect(s).toMatchObject({ open: ['a', 'c'], active: 'c' });
    s = closeTab(s, 'c');
    expect(s).toMatchObject({ open: ['a'], active: 'a' });
    s = closeTab(s, 'a');
    expect(s).toMatchObject({ open: [], active: null });
  });
  it('closing a background tab keeps the active one', () => {
    const s = closeTab(withTabs('a', 'b', 'c'), 'a');
    expect(s).toMatchObject({ open: ['b', 'c'], active: 'c' });
  });
  it('unknown ids change nothing; closed stack is most-recent-first', () => {
    const s = withTabs('a', 'b');
    expect(closeTab(s, 'zzz')).toBe(s);
    expect(closeTab(closeTab(s, 'a'), 'b').closed).toEqual(['b', 'a']);
  });
  it('close others', () => {
    const s = closeOthers(withTabs('a', 'b', 'c'), 'b');
    expect(s).toMatchObject({ open: ['b'], active: 'b' });
    expect(s.closed).toHaveLength(2);
  });
});

describe('reorder', () => {
  it('moves a tab to an index of the resulting list', () => {
    const s = withTabs('a', 'b', 'c', 'd');
    expect(reorderTab(s, 'd', 0).open).toEqual(['d', 'a', 'b', 'c']);
    expect(reorderTab(s, 'a', 2).open).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderTab(s, 'a', 99).open).toEqual(['b', 'c', 'd', 'a']);
    expect(reorderTab(s, 'a', 0)).toBe(s);
    expect(reorderTab(s, 'ghost', 1)).toBe(s);
  });
  it('keeps the active tab', () => expect(reorderTab(withTabs('a', 'b'), 'b', 0).active).toBe('b'));
});

describe('reopen closed (⌘⇧T)', () => {
  it('brings back the latest closed tab, repeatedly', () => {
    let s = closeTab(closeTab(withTabs('a', 'b', 'c'), 'c'), 'b');
    const r1 = reopenClosed(s, () => true);
    expect(r1.id).toBe('b');
    expect(r1.state).toMatchObject({ open: ['a', 'b'], active: 'b' });
    s = r1.state;
    expect(reopenClosed(s, () => true).id).toBe('c');
  });
  it('skips files that no longer exist and returns null when nothing is left', () => {
    const s = closeTab(closeTab(withTabs('a', 'b', 'c'), 'c'), 'b');
    expect(reopenClosed(s, (id) => id !== 'b').id).toBe('c');
    const r = reopenClosed(withTabs('a'), () => true);
    expect(r.id).toBeNull();
  });
});

describe('prune / cycle / parse', () => {
  it('prune drops deleted files and repairs the active tab', () => {
    const s = pruneTabs(withTabs('a', 'b', 'c'), (id) => id !== 'c');
    expect(s).toMatchObject({ open: ['a', 'b'], active: 'b' });
    expect(pruneTabs(withTabs('a'), () => false)).toMatchObject({ open: [], active: null });
  });
  it('cycle wraps around', () => {
    const s = openTab(withTabs('a', 'b', 'c'), 'c');
    expect(cycleTab(s, 1)).toBe('a');
    expect(cycleTab(s, -1)).toBe('b');
    expect(cycleTab(emptyTabs(), 1)).toBeNull();
  });
  it('parse is defensive', () => {
    expect(parseTabs(null)).toEqual(emptyTabs());
    expect(parseTabs({ open: ['a', 'a', 3, 'b'], active: 'zzz', closed: ['x'] })).toEqual({ open: ['a', 'b'], active: 'a', closed: ['x'] });
    expect(parseTabs({ open: ['a'], active: 'a' }).active).toBe('a');
  });
});
