import { describe, expect, it } from 'vitest';
import { collapseAll, effectiveOpen, expandAll, initialAccordion, loadAccordion, saveAccordion, setMulti, toggleSection } from './accordion';

const IDS = ['A', 'B', 'C'];

describe('accordion state', () => {
  it('starts fully collapsed, single mode', () => {
    expect(initialAccordion(IDS)).toEqual({ open: [], multi: false });
  });
  it('single mode: opening closes others; toggling open one closes it', () => {
    let s = toggleSection(initialAccordion(IDS), 'A');
    expect(s.open).toEqual(['A']);
    s = toggleSection(s, 'B');
    expect(s.open).toEqual(['B']);
    s = toggleSection(s, 'B');
    expect(s.open).toEqual([]);
  });
  it('multi mode keeps others open', () => {
    let s = setMulti(toggleSection(initialAccordion(IDS), 'A'), true);
    s = toggleSection(s, 'B');
    expect(s.open).toEqual(['A', 'B']);
    s = toggleSection(s, 'A');
    expect(s.open).toEqual(['B']);
  });
  it('switching multi -> single keeps only first open', () => {
    const s = setMulti({ open: ['A', 'B', 'C'], multi: true }, false);
    expect(s).toEqual({ open: ['A'], multi: false });
  });
  it('expand all / collapse all', () => {
    expect(expandAll(initialAccordion(IDS), IDS)).toEqual({ open: IDS, multi: true });
    expect(collapseAll({ open: ['A'], multi: false }).open).toEqual([]);
  });
});

describe('search auto-expand and restore', () => {
  const s = { open: ['A'], multi: false };
  it('with query: exactly matching sections are open; state untouched', () => {
    expect(effectiveOpen(s, ['B', 'C'])).toEqual(['B', 'C']);
    expect(s.open).toEqual(['A']);
  });
  it('no query (null): restores previous open state', () => {
    expect(effectiveOpen(s, null)).toEqual(['A']);
  });
});

describe('persistence', () => {
  const key = 'k';
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('round-trips', () => {
    const st = store();
    saveAccordion(st, key, { open: ['B'], multi: true });
    expect(loadAccordion(st, key, IDS)).toEqual({ open: ['B'], multi: true });
  });
  it('drops unknown ids, falls back on corrupt / throwing storage', () => {
    const st = store();
    st.setItem(key, JSON.stringify({ open: ['B', 'ZZ'], multi: true }));
    expect(loadAccordion(st, key, IDS).open).toEqual(['B']);
    st.setItem(key, '{bad');
    expect(loadAccordion(st, key, IDS)).toEqual(initialAccordion(IDS));
    const boom = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadAccordion(boom, key, IDS)).toEqual(initialAccordion(IDS));
    expect(() => saveAccordion(boom, key, initialAccordion(IDS))).not.toThrow();
  });
});
