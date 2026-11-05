import { describe, expect, it } from 'vitest';
import { computeExportView, exportFileName } from './export';

describe('export helpers', () => {
  it('computes view with padding', () => {
    const v = computeExportView({ x: 100, y: 50, width: 400, height: 200 }, 20);
    expect(v).toEqual({ width: 440, height: 240, transform: 'translate(-80px, -30px) scale(1)' });
  });
  it('builds file name', () => {
    expect(exportFileName('My Diagram!', 'png')).toBe('my-diagram.png');
    expect(exportFileName('', 'json')).toBe('diagram.json');
  });
});
