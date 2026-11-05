import { describe, expect, it } from 'vitest';
import { endLabels } from './labels';

const horiz = [{ x: 0, y: 100 }, { x: 200, y: 100 }];
const vert = [{ x: 50, y: 0 }, { x: 50, y: 300 }];
const bent = [{ x: 0, y: 0 }, { x: 0, y: 80 }, { x: 200, y: 80 }];

describe('multiplicity / role label placement', () => {
  it('puts the multiplicity near its own end, clear of the line and of the marker', () => {
    const ls = endLabels(horiz, { kind: 'association', sourceMult: '1', targetMult: '0..*' }, { startCut: 0, endCut: 0 });
    const s = ls.find((l) => l.text === '1')!;
    const t = ls.find((l) => l.text === '0..*')!;
    expect(s.end).toBe('source');
    expect(t.end).toBe('target');
    expect(s.x).toBeGreaterThan(5);
    expect(s.x).toBeLessThan(45);
    expect(t.x).toBeGreaterThan(155);
    expect(t.x).toBeLessThan(195);
    expect(Math.abs(s.y - 100)).toBeGreaterThanOrEqual(8); // not on the line
    expect(Math.abs(t.y - 100)).toBeGreaterThanOrEqual(8);
  });
  it('moves the label past the arrowhead / diamond of that end', () => {
    const plain = endLabels(horiz, { kind: 'association', targetMult: '*' }, { startCut: 0, endCut: 0 })[0];
    const diamond = endLabels(horiz, { kind: 'composition', targetMult: '*' }, { startCut: 0, endCut: 16 })[0];
    expect(200 - diamond.x).toBeGreaterThan(200 - plain.x);
  });
  it('multiplicity and role name sit on opposite sides of the line', () => {
    const ls = endLabels(horiz, { kind: 'association', targetMult: '1', targetRole: 'owner' }, { startCut: 0, endCut: 0 });
    const m = ls.find((l) => l.text === '1')!;
    const r = ls.find((l) => l.text === 'owner')!;
    expect(Math.sign(m.y - 100)).toBe(-Math.sign(r.y - 100));
  });
  it('works along vertical segments and uses the end segment of a bent route', () => {
    const v = endLabels(vert, { kind: 'association', sourceMult: '1', targetMult: '*' }, { startCut: 0, endCut: 0 });
    const vs = v.find((l) => l.text === '1')!;
    expect(vs.y).toBeGreaterThan(5);
    expect(vs.y).toBeLessThan(45);
    expect(Math.abs(vs.x - 50)).toBeGreaterThanOrEqual(8);
    const b = endLabels(bent, { kind: 'association', sourceMult: 'a', targetMult: 'b' }, { startCut: 0, endCut: 0 });
    expect(b.find((l) => l.text === 'a')!.y).toBeLessThan(45); // first (vertical) leg
    expect(b.find((l) => l.text === 'b')!.y).toBeGreaterThan(60); // last (horizontal) leg at y=80
    expect(b.find((l) => l.text === 'b')!.x).toBeGreaterThan(150);
  });
  it('skips empty texts and short routes still produce a label', () => {
    expect(endLabels(horiz, { kind: 'association', sourceMult: ' ', sourceRole: '' }, { startCut: 0, endCut: 0 })).toEqual([]);
    const tiny = endLabels([{ x: 0, y: 0 }, { x: 20, y: 0 }], { kind: 'association', sourceMult: '1' }, { startCut: 0, endCut: 0 });
    expect(tiny).toHaveLength(1);
    expect(tiny[0].x).toBeLessThanOrEqual(20);
  });
});
