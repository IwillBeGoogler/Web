import { describe, expect, it } from 'vitest';
import { labelPlacement, onVerticalSegment } from './labelSide';

const vert = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }];
describe('label side', () => {
  it('detects vertical segments', () => {
    expect(onVerticalSegment(vert, { x: 100, y: 100 })).toBe(true);
    expect(onVerticalSegment(vert, { x: 50, y: 0 })).toBe(false);
  });
  it('auto centres it on the line (background knock-out), vertical or horizontal', () => {
    expect(labelPlacement(vert, { x: 100, y: 100 }).anchor).toBe('center');
    expect(labelPlacement(vert, { x: 50, y: 0 }).anchor).toBe('center');
  });
  it('explicit sides', () => {
    expect(labelPlacement(vert, { x: 100, y: 100 }, 'left').anchor).toBe('left');
    expect(labelPlacement(vert, { x: 100, y: 100 }, 'right').anchor).toBe('right');
    expect(labelPlacement(vert, { x: 100, y: 100 }, 'on').anchor).toBe('center');
  });
});
