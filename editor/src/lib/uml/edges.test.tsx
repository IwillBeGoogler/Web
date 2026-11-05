import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { umlEnds, umlEdge, withUml, UML_REL_LABEL, UML_PRESETS } from './edges';
import { UML_REL_KINDS } from './types';
import { EdgeMarker } from '../../components/edges/markers';
import { markerBox, arrowMetrics } from '../arrow';

describe('UML relation edges', () => {
  it('each relation kind maps to its own marker and line style', () => {
    expect(umlEnds({ kind: 'inheritance' })).toEqual({ start: 'none', end: 'hollowTriangle', dashed: false });
    expect(umlEnds({ kind: 'realization' })).toEqual({ start: 'none', end: 'hollowTriangle', dashed: true });
    expect(umlEnds({ kind: 'composition' })).toEqual({ start: 'none', end: 'filledDiamond', dashed: false });
    expect(umlEnds({ kind: 'aggregation' })).toEqual({ start: 'none', end: 'hollowDiamond', dashed: false });
    expect(umlEnds({ kind: 'association' })).toEqual({ start: 'none', end: 'none', dashed: false });
    expect(umlEnds({ kind: 'association', directed: true })).toEqual({ start: 'none', end: 'open', dashed: false });
    expect(umlEnds({ kind: 'dependency' })).toEqual({ start: 'none', end: 'open', dashed: true });
    expect(umlEnds({ kind: 'note' })).toEqual({ start: 'none', end: 'none', dashed: true });
  });
  it('umlEdge sets markers, dash and keeps the uml data', () => {
    const e = umlEdge('e', 'sub', 'base', { kind: 'realization', sourceMult: '1' });
    expect(e.source).toBe('sub');
    expect(e.target).toBe('base');
    expect(e.data).toMatchObject({ uml: { kind: 'realization', sourceMult: '1' }, endMarker: 'hollowTriangle', startMarker: 'none', strokeStyle: 'dashed', arrows: 'none' });
    expect(umlEdge('e', 'a', 'b', { kind: 'inheritance' }).data).toMatchObject({ strokeStyle: 'solid' });
  });
  it('withUml re-derives markers when the kind changes', () => {
    const e = withUml(umlEdge('e', 'a', 'b', { kind: 'inheritance' }), { kind: 'composition' });
    expect(e.data).toMatchObject({ endMarker: 'filledDiamond', strokeStyle: 'solid', uml: { kind: 'composition' } });
  });
  it('labels and palette presets cover every kind', () => {
    for (const k of UML_REL_KINDS) expect(UML_REL_LABEL[k]).toBeTruthy();
    expect(UML_PRESETS.map((p) => p.kind).sort()).toEqual([...UML_REL_KINDS].sort());
  });
  it('UML markers have their own boxes (a diamond is longer than an arrow)', () => {
    const am = arrowMetrics(1.5);
    expect(markerBox('hollowTriangle', am).length).toBeGreaterThan(am.length);
    expect(markerBox('filledDiamond', am).length).toBeGreaterThan(am.length);
    expect(markerBox('hollowDiamond', am).length).toBe(markerBox('filledDiamond', am).length);
  });
  for (const [kind, expected] of [['hollowTriangle', { fill: 'bg' }], ['filledDiamond', { fill: 'color' }], ['hollowDiamond', { fill: 'bg' }]] as const) {
    it(`renders the ${kind} marker with a ${expected.fill === 'bg' ? 'hollow' : 'filled'} body`, () => {
      const am = arrowMetrics(1.5);
      const box = markerBox(kind, am);
      const { container } = render(<svg><EdgeMarker id="m" kind={kind} color="#123456" bg="#fefefe" length={box.length} width={box.width} /></svg>);
      const path = container.querySelector('marker path')!;
      expect(path).toBeTruthy();
      expect(path.getAttribute('fill')).toBe(expected.fill === 'bg' ? '#fefefe' : '#123456');
      expect(path.getAttribute('stroke')).toBe('#123456');
      expect(container.querySelector('marker')!.getAttribute('refX')).toBe('0');
    });
  }
  it('the triangle is a closed three-point shape and the diamond has four points', () => {
    const am = arrowMetrics(1.5);
    const tri = render(<svg><EdgeMarker id="t" kind="hollowTriangle" color="#000" length={12} width={10} /></svg>).container.querySelector('path')!.getAttribute('d')!;
    expect((tri.match(/[ML]/g) ?? []).length).toBe(3);
    expect(tri.trim().endsWith('z')).toBe(true);
    const dia = render(<svg><EdgeMarker id="d" kind="filledDiamond" color="#000" length={16} width={9} /></svg>).container.querySelector('path')!.getAttribute('d')!;
    expect((dia.match(/[ML]/g) ?? []).length).toBe(4);
    void am;
  });
});
