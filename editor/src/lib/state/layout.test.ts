import { describe, expect, it } from 'vitest';
import { layoutStates } from './layout';
import type { StateModel } from './types';

const chain: StateModel = {
  states: [
    { id: 'i', name: '', kind: 'initial' },
    { id: 'a', name: 'Idle', kind: 'state' },
    { id: 'b', name: 'Running', kind: 'state' },
    { id: 'f', name: '', kind: 'final' },
  ],
  transitions: [{ from: 'i', to: 'a', label: '' }, { from: 'a', to: 'b', label: 'start' }, { from: 'b', to: 'a', label: 'stop' }, { from: 'b', to: 'f', label: 'quit' }],
};
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('state layout', () => {
  it('lays a chain out in layers top to bottom even with a back edge', () => {
    const l = layoutStates(chain);
    expect(l.get('i')!.y).toBeLessThan(l.get('a')!.y);
    expect(l.get('a')!.y).toBeLessThan(l.get('b')!.y);
    expect(l.get('b')!.y).toBeLessThan(l.get('f')!.y);
  });
  it('left to right puts layers on the x axis', () => {
    const l = layoutStates({ ...chain, direction: 'LR' });
    expect(l.get('a')!.x).toBeLessThan(l.get('b')!.x);
  });
  it('siblings never overlap', () => {
    const m: StateModel = {
      states: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id, kind: 'state' as const })),
      transitions: [{ from: 'a', to: 'b', label: '' }, { from: 'a', to: 'c', label: '' }, { from: 'a', to: 'd', label: '' }, { from: 'b', to: 'e', label: '' }, { from: 'c', to: 'e', label: '' }],
    };
    const l = [...layoutStates(m).values()];
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) expect(overlap(l[i], l[j])).toBe(false);
  });
  it('a composite state wraps its children (positions are relative to the parent)', () => {
    const m: StateModel = {
      states: [
        { id: 'c', name: 'Active', kind: 'state', composite: true },
        { id: 'ci', name: '', kind: 'initial', parent: 'c' },
        { id: 'x', name: 'X', kind: 'state', parent: 'c' },
        { id: 'y', name: 'Y', kind: 'state', parent: 'c' },
        { id: 'o', name: 'Other', kind: 'state' },
      ],
      transitions: [{ from: 'ci', to: 'x', label: '' }, { from: 'x', to: 'y', label: 'go' }, { from: 'c', to: 'o', label: 'leave' }],
    };
    const l = layoutStates(m);
    const c = l.get('c')!;
    for (const id of ['ci', 'x', 'y']) {
      const k = l.get(id)!;
      expect(k.x).toBeGreaterThanOrEqual(0);
      expect(k.y).toBeGreaterThanOrEqual(30); // under the title
      expect(k.x + k.w).toBeLessThanOrEqual(c.w);
      expect(k.y + k.h).toBeLessThanOrEqual(c.h);
    }
    expect(l.get('o')!.y).toBeGreaterThan(c.y); // edge from the composite counts
  });
  it('is deterministic and handles an empty model', () => {
    expect([...layoutStates(chain)]).toEqual([...layoutStates(chain)]);
    expect(layoutStates({ states: [], transitions: [] }).size).toBe(0);
  });
});

describe('layout: regions and long labels', () => {
  it('places concurrent regions of a composite side by side without overlap', () => {
    const model: StateModel = {
      states: [
        { id: 'C', name: 'C', kind: 'state', composite: true },
        { id: 'a', name: 'a', kind: 'state', parent: 'C' },
        { id: 'b', name: 'b', kind: 'state', parent: 'C', region: 1 },
      ],
      transitions: [],
    };
    const boxes = layoutStates(model);
    const a = boxes.get('a')!, b = boxes.get('b')!;
    expect(a.x + a.w).toBeLessThanOrEqual(b.x);
    expect(boxes.get('C')!.w).toBeGreaterThanOrEqual(b.x + b.w);
  });
  it('widens the layer gap for a long label in LR', () => {
    const mk = (label: string, direction: 'LR' | 'TB'): StateModel => ({ direction, states: [{ id: 'a', name: 'a', kind: 'state' }, { id: 'b', name: 'b', kind: 'state' }], transitions: [{ from: 'a', to: 'b', label }] });
    const gap = (m: StateModel) => { const o = layoutStates(m); return o.get('b')!.x - (o.get('a')!.x + o.get('a')!.w); };
    expect(gap(mk('a very long transition label [guard] / action()', 'LR'))).toBeGreaterThan(gap(mk('go', 'LR')));
    expect(gap(mk('go', 'LR'))).toBe(70);
  });
});
