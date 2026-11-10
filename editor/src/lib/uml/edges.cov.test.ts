import { describe, expect, it } from 'vitest';
import type { DiagramEdge } from '../../types';
import { isUmlEdge, STEREO_LABEL, umlEdge, umlEnds, umlOf, withUml } from './edges';
import { UML_ALL_KINDS, type UmlRelKind } from './types';

describe('umlEnds', () => {
  const cases: [UmlRelKind, string, string, boolean][] = [
    ['inheritance', 'none', 'hollowTriangle', false], ['realization', 'none', 'hollowTriangle', true],
    ['composition', 'none', 'filledDiamond', false], ['aggregation', 'none', 'hollowDiamond', false],
    ['dependency', 'none', 'open', true], ['note', 'none', 'none', true], ['transition', 'none', 'arrow', false],
    ['include', 'none', 'open', true], ['extend', 'none', 'open', true], ['generalization', 'none', 'hollowTriangle', false],
    ['assembly', 'none', 'none', false], ['communication', 'none', 'none', false], ['link', 'none', 'none', false],
    ['deploy', 'none', 'open', true], ['manifest', 'none', 'open', true], ['import', 'none', 'open', true],
    ['access', 'none', 'open', true], ['merge', 'none', 'open', true],
  ];
  it.each(cases)('%s', (kind, start, end, dashed) => {
    expect(umlEnds({ kind })).toEqual({ start, end, dashed });
  });
  it('association: arrow only when directed', () => {
    expect(umlEnds({ kind: 'association' }).end).toBe('none');
    expect(umlEnds({ kind: 'association', directed: true }).end).toBe('open');
  });
  it('covers every kind without throwing', () => {
    for (const k of UML_ALL_KINDS) expect(umlEnds({ kind: k })).toHaveProperty('dashed');
  });
});

describe('umlEdge / withUml', () => {
  it('stereotype label default for include; explicit label wins', () => {
    expect(umlEdge('e', 'a', 'b', { kind: 'include' }).label).toBe(STEREO_LABEL.include);
    expect(umlEdge('e', 'a', 'b', { kind: 'include' }, { label: 'mine' }).label).toBe('mine');
    expect(umlEdge('e', 'a', 'b', { kind: 'inheritance' }).label).toBeUndefined();
  });
  it('sets dash + markers', () => {
    const e = umlEdge('e', 'a', 'b', { kind: 'realization' });
    expect(e.data).toMatchObject({ dashed: true, strokeStyle: 'dashed', endMarker: 'hollowTriangle' });
    expect(isUmlEdge(e)).toBe(true);
    expect(umlOf(e)?.kind).toBe('realization');
  });
  it('withUml on plain edge defaults to association', () => {
    const plain = { id: 'x', source: 'a', target: 'b' } as DiagramEdge;
    expect(isUmlEdge(plain)).toBe(false);
    expect(umlOf(plain)).toBeUndefined();
    const e = withUml(plain, { sourceMult: '1' });
    expect(umlOf(e)).toEqual({ kind: 'association', sourceMult: '1' });
    expect(e.label).toBeUndefined();
  });
  it('kind change swaps stereotype label when label empty or stereotype', () => {
    const inc = umlEdge('e', 'a', 'b', { kind: 'include' });
    expect(withUml(inc, { kind: 'extend' }).label).toBe(STEREO_LABEL.extend);
    expect(withUml(inc, { kind: 'association' }).label).toBeUndefined();
    const assoc = umlEdge('e', 'a', 'b', { kind: 'association' });
    expect(withUml(assoc, { kind: 'include' }).label).toBe(STEREO_LABEL.include);
  });
  it('kind change keeps user label', () => {
    const e = umlEdge('e', 'a', 'b', { kind: 'include' }, { label: 'custom' });
    expect(withUml(e, { kind: 'extend' }).label).toBe('custom');
  });
  it('non-kind patch keeps label', () => {
    const e = umlEdge('e', 'a', 'b', { kind: 'include' });
    expect(withUml(e, { targetMult: '*' }).label).toBe(STEREO_LABEL.include);
    expect(withUml(e, { kind: 'include' }).label).toBe(STEREO_LABEL.include);
  });
});
