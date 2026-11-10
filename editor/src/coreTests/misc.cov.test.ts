import { describe, expect, it } from 'vitest';
import { printPage } from '@core/dsl';

describe('printPage minimal', () => {
  it('empty page prints header only', () => {
    expect(printPage({ id: 'p', name: 'P', nodes: [], edges: [] })).toBe('#!sdd 1\ndiagram "P"\n');
  });
});
