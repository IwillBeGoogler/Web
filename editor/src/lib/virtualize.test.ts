import { describe, expect, it } from 'vitest';
import { shouldVirtualize, VIRTUALIZE_AT } from './virtualize';

describe('shouldVirtualize', () => {
  it('renders everything on normal pages and only the visible part on very large ones', () => {
    expect(shouldVirtualize(0)).toBe(false);
    expect(shouldVirtualize(300)).toBe(false);
    expect(shouldVirtualize(VIRTUALIZE_AT)).toBe(false);
    expect(shouldVirtualize(VIRTUALIZE_AT + 1)).toBe(true);
    expect(shouldVirtualize(10000)).toBe(true);
  });
  it('the threshold sits well below the 5k-node target', () => {
    expect(VIRTUALIZE_AT).toBeLessThanOrEqual(1500);
  });
});
