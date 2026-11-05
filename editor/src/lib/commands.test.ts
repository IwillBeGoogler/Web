import { describe, expect, it } from 'vitest';
import { fuzzyScore, rankCommands, type Command } from './commands';

const c = (title: string, section = 'Actions', keywords: string[] = []): Command => ({ id: title, title, section, keywords, run: () => undefined });

describe('fuzzyScore', () => {
  it('needs every character in order', () => {
    expect(fuzzyScore('zf', 'Zoom to fit')).toBeGreaterThan(0);
    expect(fuzzyScore('fz', 'Zoom to fit')).toBe(-1);
    expect(fuzzyScore('xyz', 'Zoom to fit')).toBe(-1);
  });
  it('prefix beats substring beats scattered', () => {
    const p = fuzzyScore('zoom', 'Zoom to fit');
    const s = fuzzyScore('fit', 'Zoom to fit');
    const f = fuzzyScore('zft', 'Zoom to fit');
    expect(p).toBeGreaterThan(s);
    expect(s).toBeGreaterThan(f);
  });
  it('empty query matches everything', () => expect(fuzzyScore('', 'x')).toBe(0));
});

describe('rankCommands', () => {
  const list = [c('Toggle grid'), c('Toggle snap'), c('Zoom to fit'), c('Show failures'), c('Export PNG', 'Export', ['image', 'picture'])];
  it('keeps order for an empty query', () => expect(rankCommands(list, '').map((x) => x.title)).toEqual(list.map((x) => x.title)));
  it('ranks the best title match first and drops non-matches', () => {
    expect(rankCommands(list, 'zf')[0].title).toBe('Zoom to fit');
    expect(rankCommands(list, 'qqq')).toEqual([]);
  });
  it('searches keywords and sections but title matches win', () => {
    expect(rankCommands(list, 'picture')[0].title).toBe('Export PNG');
    expect(rankCommands(list, 'export')[0].title).toBe('Export PNG');
  });
  it('limits results', () => expect(rankCommands(list, 't', 2)).toHaveLength(2));
});
