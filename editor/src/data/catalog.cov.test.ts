import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, scoreItem } from './catalog';
import { TOP_TAGS } from './topTags';

describe('catalog scoring', () => {
  const item = ALL_ITEMS.find((i) => i.kind === 'icon')!;
  it('a blank query matches everything with the neutral score', () => {
    expect(scoreItem(item, '')).toBe(1);
    expect(scoreItem(item, '   ')).toBe(1);
  });
  it('a query for the item label scores above a nonsense one', () => {
    expect(scoreItem(item, item.label)).toBeGreaterThan(0);
    expect(scoreItem(item, 'zzzzqqqqxx')).toBe(0);
  });
  it('top tags are unique non-empty strings', () => {
    expect(TOP_TAGS.length).toBeGreaterThan(3);
    expect(new Set(TOP_TAGS).size).toBe(TOP_TAGS.length);
    expect(TOP_TAGS.every((t) => /^[a-z0-9-]+$/.test(t))).toBe(true);
  });
});
