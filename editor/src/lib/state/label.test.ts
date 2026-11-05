import { describe, expect, it } from 'vitest';
import { formatTransition, parseTransition } from './label';

describe('transition labels', () => {
  it('parses event [guard] / action', () => {
    expect(parseTransition('submit [valid] / save()')).toEqual({ event: 'submit', guard: 'valid', action: 'save()' });
    expect(parseTransition('timeout')).toEqual({ event: 'timeout', guard: '', action: '' });
    expect(parseTransition('[x > 1]')).toEqual({ event: '', guard: 'x > 1', action: '' });
    expect(parseTransition('/ log')).toEqual({ event: '', guard: '', action: 'log' });
    expect(parseTransition('')).toEqual({ event: '', guard: '', action: '' });
  });
  it('formats and round trips', () => {
    for (const l of ['a [b] / c', 'a', '[b]', '/ c', 'a / c', 'a [b]', '']) expect(formatTransition(parseTransition(l))).toBe(l);
  });
});
