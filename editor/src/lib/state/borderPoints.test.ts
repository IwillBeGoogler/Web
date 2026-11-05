import { describe, expect, it } from 'vitest';
import { layoutStates } from './layout';
import { diagramToStateModel, routeViaBorderPoints, stateModelToDiagram } from './convert';
import { parseStateMermaid, renderStateMermaid } from './mermaid';
import { parsePlantUmlState, renderStatePlantUml } from './plantuml';
import { regionDividers } from './regions';
import type { StateModel } from './types';

const model: StateModel = {
  states: [
    { id: 'a', name: 'Outside', kind: 'state' },
    { id: 'c', name: 'Comp', kind: 'state', composite: true },
    { id: 'in', name: 'Entry', kind: 'entryPoint', parent: 'c' },
    { id: 'out', name: 'Exit', kind: 'exitPoint', parent: 'c' },
    { id: 'x', name: 'Inner', kind: 'state', parent: 'c' },
    { id: 'b', name: 'After', kind: 'state' },
  ],
  transitions: [{ from: 'a', to: 'x', label: 'go' }, { from: 'x', to: 'b', label: 'done' }],
};

describe('entry / exit points', () => {
  it('pins points to the composite border', () => {
    const l = layoutStates(model);
    const c = l.get('c')!;
    expect(l.get('in')!.y + 8).toBeCloseTo(0);
    expect(l.get('out')!.y + 8).toBeCloseTo(c.h);
    expect(l.get('x')!.y).toBeGreaterThan(0);
    expect(layoutStates({ ...model, direction: 'LR' }).get('in')!.x + 8).toBeCloseTo(0);
  });
  it('routes crossing transitions through the points, once', () => {
    const t = routeViaBorderPoints(model);
    expect(t).toEqual([
      { from: 'a', to: 'in', label: 'go' }, { from: 'in', to: 'x', label: '' },
      { from: 'x', to: 'out', label: 'done' }, { from: 'out', to: 'b', label: '' },
    ]);
    expect(routeViaBorderPoints({ ...model, transitions: t })).toEqual(t);
  });
  it('without points transitions stay', () => {
    const m = { ...model, states: model.states.filter((s) => s.kind === 'state') };
    expect(routeViaBorderPoints(m)).toEqual(m.transitions);
  });
  it('round trips through the diagram', () => {
    const d = stateModelToDiagram(model);
    expect(d.edges).toHaveLength(4);
    const back = diagramToStateModel(d.nodes, d.edges);
    expect(back.states.filter((s) => s.kind === 'entryPoint' || s.kind === 'exitPoint')).toHaveLength(2);
    expect(back.states.find((s) => s.kind === 'entryPoint')!.parent).toBeTruthy();
  });
  it('PlantUML uses stereotypes', () => {
    const src = renderStatePlantUml(model);
    expect(src).toContain('<<entryPoint>>');
    expect(src).toContain('<<exitPoint>>');
    expect(parsePlantUmlState(src).model.states.map((s) => s.kind).sort()).toEqual(model.states.map((s) => s.kind).sort());
  });
  it('Mermaid keeps them through a comment', () => {
    const src = renderStateMermaid(model);
    expect(src).toContain('%% sdd:entryPoint');
    const back = parseStateMermaid(src).model;
    expect(back.states.filter((s) => s.kind === 'exitPoint')).toHaveLength(1);
    expect(back.states.find((s) => s.id === back.states.find((x) => x.kind === 'entryPoint')!.parent)!.composite).toBe(true);
  });
});

describe('region dividers', () => {
  const reg: StateModel = {
    states: [
      { id: 'c', name: 'C', kind: 'state', composite: true },
      { id: 'p', name: 'P', kind: 'state', parent: 'c' },
      { id: 'q', name: 'Q', kind: 'state', parent: 'c', region: 1 },
    ],
    transitions: [],
  };
  it('one divider between two regions, between their bounds', () => {
    const d = stateModelToDiagram(reg);
    const kids = d.nodes.filter((n) => n.parentId);
    const dv = regionDividers(kids);
    expect(dv).toHaveLength(1);
    expect(dv[0].axis).toBe('x');
    const p = kids.find((n) => n.data.label === 'P')!, q = kids.find((n) => n.data.label === 'Q')!;
    expect(dv[0].pos).toBeGreaterThan(p.position.x + (p.width ?? 0) - 0.1);
    expect(dv[0].pos).toBeLessThan(q.position.x + 0.1);
  });
  it('LR stacks regions: horizontal divider', () => {
    const d = stateModelToDiagram({ ...reg, direction: 'LR' });
    expect(regionDividers(d.nodes.filter((n) => n.parentId))[0].axis).toBe('y');
  });
  it('none for a single region', () => {
    expect(regionDividers(stateModelToDiagram({ ...reg, states: reg.states.slice(0, 2) }).nodes.filter((n) => n.parentId))).toEqual([]);
  });
});
