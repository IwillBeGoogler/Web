import { describe, expect, it } from 'vitest';
import { parseArrow, parseRelationLine, relationLine } from './arrows';

describe('parseArrow heads', () => {
  it('rejects garbage', () => expect(parseArrow('~~', 'A', 'B')).toBeNull());
  it('triangle on left/right, solid vs dotted', () => {
    expect(parseArrow('<|--', 'A', 'B', '1', '2')).toEqual({ from: 'B', to: 'A', kind: 'inheritance', fromMult: '2', toMult: '1' });
    expect(parseArrow('--|>', 'A', 'B')).toEqual({ from: 'A', to: 'B', kind: 'inheritance' });
    expect(parseArrow('<|..', 'A', 'B')).toMatchObject({ from: 'B', to: 'A', kind: 'realization' });
    expect(parseArrow('..|>', 'A', 'B')).toMatchObject({ from: 'A', to: 'B', kind: 'realization' });
  });
  it('diamonds on either side', () => {
    expect(parseArrow('*--', 'A', 'B')).toMatchObject({ from: 'B', to: 'A', kind: 'composition' });
    expect(parseArrow('--*', 'A', 'B', '"x"', '"y"')).toMatchObject({ from: 'A', to: 'B', kind: 'composition', fromMult: 'x', toMult: 'y' });
    expect(parseArrow('o--', 'A', 'B')).toMatchObject({ from: 'B', to: 'A', kind: 'aggregation' });
    expect(parseArrow('--o', 'A', 'B')).toMatchObject({ from: 'A', to: 'B', kind: 'aggregation' });
  });
  it('open arrows: solid association directed, dotted dependency', () => {
    expect(parseArrow('<--', 'A', 'B')).toEqual({ from: 'B', to: 'A', kind: 'association', directed: true });
    expect(parseArrow('-->', 'A', 'B')).toEqual({ from: 'A', to: 'B', kind: 'association', directed: true });
    expect(parseArrow('<..', 'A', 'B')).toEqual({ from: 'B', to: 'A', kind: 'dependency' });
    expect(parseArrow('..>', 'A', 'B')).toEqual({ from: 'A', to: 'B', kind: 'dependency' });
  });
  it('plain lines and direction hints/styles are normalized', () => {
    expect(parseArrow('--', 'A', 'B')).toEqual({ from: 'A', to: 'B', kind: 'association' });
    expect(parseArrow('..', 'A', 'B')).toEqual({ from: 'A', to: 'B', kind: 'dependency' });
    expect(parseArrow('-up->', 'A', 'B')).toMatchObject({ kind: 'association', directed: true });
    expect(parseArrow('-[#red]->', 'A', 'B')).toMatchObject({ kind: 'association', directed: true });
  });
});

describe('parseRelationLine / relationLine', () => {
  it('returns null for non relation text', () => expect(parseRelationLine('hello world')).toBeNull());
  it('reads multiplicities and label', () => {
    expect(parseRelationLine('Order "1" *-- "many" Line : has')).toEqual({ from: 'Line', to: 'Order', kind: 'composition', fromMult: 'many', toMult: '1', label: 'has' });
    expect(parseRelationLine('A --> B :   ')).toEqual({ from: 'A', to: 'B', kind: 'association', directed: true });
  });
  it('renders every kind', () => {
    const r = (kind: string, extra = {}) => relationLine({ from: 'A', to: 'B', kind, ...extra } as never);
    expect(r('inheritance', { fromMult: '1', toMult: '2', label: 'x' })).toBe('B "2" <|-- "1" A : x');
    expect(r('realization')).toBe('B <|.. A');
    expect(r('composition')).toBe('B *-- A');
    expect(r('aggregation')).toBe('B o-- A');
    expect(r('dependency', { fromMult: '1' })).toBe('A "1" ..> B');
    expect(r('association')).toBe('A -- B');
    expect(r('association', { directed: true, toMult: '*' })).toBe('A --> "*" B');
  });
  it('round trips', () => {
    for (const kind of ['inheritance', 'realization', 'composition', 'aggregation', 'dependency']) {
      const rel = { from: 'A', to: 'B', kind } as never;
      expect(parseRelationLine(relationLine(rel))).toMatchObject(rel);
    }
  });
});
