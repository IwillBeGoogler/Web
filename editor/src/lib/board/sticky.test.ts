import { describe, expect, it } from 'vitest';
import { STICKY_COLORS, createSticky, fitFontSize, nextSticky, wrapLineCount, STICKY_SIZE } from './sticky';
import type { DiagramNode } from '../../types';

describe('sticky colours', () => {
  it('has 8 distinct colours with fill and stroke', () => {
    expect(STICKY_COLORS).toHaveLength(8);
    expect(new Set(STICKY_COLORS.map((c) => c.fill)).size).toBe(8);
    for (const c of STICKY_COLORS) expect(c.fill).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('wrapLineCount', () => {
  it('counts wrapped lines and honours newlines', () => {
    expect(wrapLineCount('', 10)).toBe(1);
    expect(wrapLineCount('hello world', 20)).toBe(1);
    expect(wrapLineCount('hello world', 6)).toBe(2);
    expect(wrapLineCount('a\nb\nc', 20)).toBe(3);
  });
  it('breaks a word longer than the line', () => {
    expect(wrapLineCount('abcdefghij', 4)).toBe(3);
  });
});

describe('fitFontSize', () => {
  it('shrinks with more text and stays within bounds', () => {
    const short = fitFontSize('Hi', 160, 140);
    const long = fitFontSize('word '.repeat(60), 160, 140);
    expect(short).toBeGreaterThan(long);
    expect(short).toBeLessThanOrEqual(28);
    expect(long).toBeGreaterThanOrEqual(10);
  });
  it('is larger in a larger sticky', () => {
    const t = 'Some medium length note for the board';
    expect(fitFontSize(t, 300, 260)).toBeGreaterThanOrEqual(fitFontSize(t, 160, 140));
  });
  it('prefers a size that keeps every word whole over a bigger size that breaks words', () => {
    const size = fitFontSize('Implement the feature', 160, 140);
    // "Implement" (9 characters) must fit one line at that size: 9 * size * 0.56 <= 160 - 24
    expect(9 * size * 0.56).toBeLessThanOrEqual(160 - 24);
  });
  it('breaks a long word only when even the smallest size cannot hold it', () => {
    const size = fitFontSize('Supercalifragilisticexpialidocious', 100, 80);
    expect(size).toBeLessThanOrEqual(12); // it had to break the word, so it shrank
    expect(size).toBeGreaterThanOrEqual(10);
  });
  it('never returns below the minimum, even for huge text', () => {
    expect(fitFontSize('x'.repeat(5000), 100, 80)).toBe(10);
  });
});

describe('createSticky', () => {
  it('centres on the click point and uses the default size and colour', () => {
    const n = createSticky('s1', { x: 400, y: 300 });
    expect(n.type).toBe('sticky');
    expect(n.width).toBe(STICKY_SIZE.width);
    expect(n.position).toEqual({ x: 400 - STICKY_SIZE.width / 2, y: 300 - STICKY_SIZE.height / 2 });
    expect(n.data.fill).toBe(STICKY_COLORS[0].fill);
    expect(n.data.autoFont).toBe(true);
  });
  it('takes a colour id, author and private flag', () => {
    const n = createSticky('s2', { x: 0, y: 0 }, { color: 'pink', author: 'Ann', authorId: 'u1', private: true });
    expect(n.data.fill).toBe(STICKY_COLORS.find((c) => c.id === 'pink')!.fill);
    expect(n.data.author).toBe('Ann');
    expect(n.data.authorId).toBe('u1');
    expect(n.data.private).toBe(true);
  });
  it('omits optional fields when not given', () => {
    const n = createSticky('s3', { x: 0, y: 0 });
    expect('author' in n.data).toBe(false);
    expect('private' in n.data).toBe(false);
  });
});

describe('nextSticky (Tab flow)', () => {
  const s = (id: string, x: number, y: number): DiagramNode => ({ ...createSticky(id, { x: 0, y: 0 }), position: { x, y } });
  it('Tab puts the next sticky to the right with the same size and colour', () => {
    const a = createSticky('a', { x: 100, y: 100 }, { color: 'blue' });
    const b = nextSticky(a, [a], 'right', 'b');
    expect(b.position.x).toBeGreaterThan(a.position.x + (a.width ?? 0));
    expect(b.position.y).toBe(a.position.y);
    expect(b.data.fill).toBe(a.data.fill);
    expect(b.width).toBe(a.width);
    expect(b.data.label).toBe('');
  });
  it('Shift+Enter puts it below', () => {
    const a = createSticky('a', { x: 100, y: 100 });
    const b = nextSticky(a, [a], 'below', 'b');
    expect(b.position.x).toBe(a.position.x);
    expect(b.position.y).toBeGreaterThan(a.position.y + (a.height ?? 0));
  });
  it('skips over occupied slots', () => {
    const a = s('a', 0, 0);
    const blocker = s('x', 184, 0); // the slot to the right of a
    const b = nextSticky(a, [a, blocker], 'right', 'b');
    expect(b.position.x).toBeGreaterThan(184 + STICKY_SIZE.width);
  });
  it('does not copy author or private flags from a different author', () => {
    const a = createSticky('a', { x: 0, y: 0 }, { author: 'Ann' });
    const b = nextSticky(a, [a], 'right', 'b', { author: 'Bob', authorId: 'u2' });
    expect(b.data.author).toBe('Bob');
  });
});
