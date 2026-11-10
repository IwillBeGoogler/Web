import { describe, expect, it } from 'vitest';
import { endLabels } from './labels';

const cuts = { startCut: 0, endCut: 0 };
describe('endLabels branches', () => {
  it('needs two points', () => expect(endLabels([{ x: 0, y: 0 }], { kind: 'association', sourceMult: '1' }, cuts)).toEqual([]));
  it('blank texts are ignored', () => {
    expect(endLabels([{ x: 0, y: 0 }, { x: 100, y: 0 }], { kind: 'association', sourceMult: '  ', targetRole: '' }, cuts)).toEqual([]);
  });
  it('lone role goes on the mult side; both split sides', () => {
    const p = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const lone = endLabels(p, { kind: 'association', sourceRole: ' r ' }, cuts)[0];
    expect(lone).toMatchObject({ text: 'r', kind: 'role', side: 'above' });
    const both = endLabels(p, { kind: 'association', sourceMult: '1', sourceRole: 'r' }, cuts);
    expect(both.map((l) => l.side)).toEqual(['above', 'below']);
    expect(both[0].y).toBeLessThan(0);
    expect(both[1].y).toBeGreaterThan(0);
  });
  it('target end of a leftward-reading leg anchors at end', () => {
    const l = endLabels([{ x: 0, y: 0 }, { x: 100, y: 0 }], { kind: 'association', targetMult: '*' }, cuts)[0];
    expect(l.anchor).toBe('end');
    expect(l.x).toBeLessThan(100);
  });
  it('vertical legs put mult right and anchor start; role anchors end', () => {
    const v = [{ x: 5, y: 0 }, { x: 5, y: 100 }];
    const ls = endLabels(v, { kind: 'association', sourceMult: '1', sourceRole: 'r' }, cuts);
    expect(ls[0]).toMatchObject({ anchor: 'start' });
    expect(ls[0].x).toBeGreaterThan(5);
    expect(ls[1]).toMatchObject({ anchor: 'end' });
    expect(ls[1].x).toBeLessThan(5);
  });
  it('zero length leg does not blow up', () => {
    const ls = endLabels([{ x: 3, y: 3 }, { x: 3, y: 3 }], { kind: 'association', sourceMult: '1' }, cuts);
    expect(Number.isFinite(ls[0].x)).toBe(true);
  });
  it('markers push label further along a long leg', () => {
    const p = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const a = endLabels(p, { kind: 'association', sourceMult: '1' }, cuts)[0];
    const b = endLabels(p, { kind: 'association', sourceMult: '1' }, { startCut: 20, endCut: 0 })[0];
    expect(b.x).toBeGreaterThan(a.x);
  });
});
