import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from './diagramStore';
import { monitoringMedium } from '../templates/monitoringMedium';
import { ALL_TEMPLATES } from '../templates';
import { lineStyleOverrides } from '../lib/settings';
import type { DiagramEdge } from '../types';

const s = () => useDiagramStore.getState();
beforeEach(() => {
  s().reset();
  s().loadDiagram(monitoringMedium());
});

describe('Apply line style to all edges', () => {
  it('sets EVERY edge on the page (junction + manual ones included) and clears waypoints for curved', () => {
    const before = s().edges;
    expect(before.some((e) => e.data?.manual)).toBe(true); // the template has hand-routed edges
    const n = s().applyLineStyleToAll('curved', 'page');
    expect(n).toBe(before.length);
    for (const e of s().edges) {
      expect(e.data?.lineType, e.id).toBe('curved');
      expect(e.data?.manual, e.id).toBeUndefined();
      expect(e.data?.waypoints, e.id).toBeUndefined();
    }
    const isJ = (id: string) => s().nodes.find((x) => x.id === id)?.type === 'junction';
    expect(s().edges.filter((e) => isJ(e.source) || isJ(e.target)).length).toBeGreaterThan(30);
  });
  it('straight clears waypoints too; orthogonal keeps manual routes', () => {
    s().applyLineStyleToAll('orthogonal', 'page');
    expect(s().edges.some((e) => e.data?.manual)).toBe(true);
    s().applyLineStyleToAll('straight', 'page');
    expect(s().edges.every((e) => !e.data?.manual && !e.data?.waypoints)).toBe(true);
  });
  it('is one undo step', () => {
    s().applyLineStyleToAll('curved', 'page');
    s().undo();
    expect(s().edges.some((e) => e.data?.lineType === 'curved')).toBe(false);
  });
});

describe('lineStyleOverrides (the "12 edges use a custom style" hint)', () => {
  const e = (id: string, data: DiagramEdge['data'] = {}): DiagramEdge => ({ id, source: 'a', target: 'b', data });
  it('counts edges with an own line type that differs from the default, and hand-routed ones', () => {
    const r = lineStyleOverrides([e('1'), e('2', { lineType: 'straight' }), e('3', { lineType: 'curved' }), e('4', { manual: true, waypoints: [{ x: 1, y: 1 }] })], 'curved');
    expect(r).toEqual({ custom: 1, manual: 1, total: 2 });
  });
  it('is empty when everything follows the default', () => {
    expect(lineStyleOverrides([e('1'), e('2')], 'curved')).toEqual({ custom: 0, manual: 0, total: 0 });
  });
});

describe('templates do not hardcode a line type', () => {
  it('no built-in template edge carries lineType (they follow the default)', () => {
    for (const t of ALL_TEMPLATES) for (const ed of t.build().edges) expect(ed.data?.lineType, `${t.id}/${ed.id}`).toBeUndefined();
  });
});
