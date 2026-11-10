import { describe, expect, it } from 'vitest';
import * as E from './edit';
import { layoutTiming, rowAt, rowHeight, snapStep, statesOf, tOf, xOf, yAt, niceStep, changesOf, TM } from './layout';
import type { DiagramNode } from '../../types';
import { blankTiming, isTimingNode, timingModelToDiagram, timingOf, withTimingSize } from './node';
import { looksLikeTimingPlantuml, parseTimingPlantuml, renderTimingPlantuml } from './plantuml';
import { emptyTiming, timingId, timingIds, type TimingData, type TimingModel } from './types';
import { validateTiming } from './validate';

const base = (): TimingData => ({ ...emptyTiming(), label: 'T', accent: 'x', end: 400, unit: 'ms' });
const life = (id: string, kind: 'robust' | 'concise' | 'binary' | 'clock', states: string[] = [], period?: number) => ({ id, name: id, kind, states, ...(period ? { period } : {}) });

describe('types', () => {
  it('ids', () => {
    const n = timingIds();
    expect([n('a'), n('a'), n('b')]).toEqual(['a1', 'a2', 'b1']);
    expect(timingId('x')).not.toBe(timingId('x'));
  });
});

describe('layout', () => {
  it('row heights, states, steps', () => {
    expect(rowHeight({ kind: 'robust', states: [] })).toBe(2 * TM.stateH + TM.rowPad);
    expect(rowHeight({ kind: 'binary', states: [] })).toBe(TM.binaryH);
    expect(rowHeight({ kind: 'clock', states: [] })).toBe(TM.clockH);
    expect(rowHeight({ kind: 'concise', states: [] })).toBe(TM.conciseH);
    expect(statesOf({ kind: 'binary', states: [] })).toEqual(['high', 'low']);
    expect(statesOf({ kind: 'robust', states: ['a'] })).toEqual(['a']);
    expect([niceStep(8), niceStep(16), niceStep(40), niceStep(80), niceStep(0)]).toEqual([1, 2, 5, 10, 0.2]);
    expect(snapStep(1)).toBe(0.1);
    expect(snapStep(1000)).toBe(10);
  });
  it('lays out', () => {
    const d: TimingData = {
      ...base(),
      lifelines: [life('r', 'robust', ['a', 'b', 'c']), life('b', 'binary'), life('k', 'clock', [], 50), life('k2', 'clock'), life('c', 'concise', ['x'])],
      changes: [{ id: '1', life: 'r', t: 100, state: 'b' }, { id: '2', life: 'r', t: 0, state: 'a' }, { id: '3', life: 'r', t: 0, state: 'c' }],
      messages: [], durations: [],
    };
    const L = layoutTiming(d);
    expect(L.lifelines[0].segments.map((s) => s.state)).toEqual(['a', 'c', 'b']);
    expect(L.lifelines[0].segments[2].t1).toBe(400);
    expect(L.lifelines[2].period).toBe(50);
    expect(L.lifelines[3].period).toBe(50);
    expect(L.lifelines[1].rows).toHaveLength(2);
    expect(L.lifelines[4].rows).toEqual([]);
    expect(L.ticks.length).toBeGreaterThan(5);
    expect(tOf(L, xOf(L, 123))).toBeCloseTo(123);
    expect(rowAt(L.lifelines[0], L.lifelines[0].rows[2].y)).toBe('c');
    expect(rowAt(L.lifelines[4], 0)).toBeUndefined();
    expect(yAt(L, null, 'nope', 0)).toBe(0);
    expect(yAt(L, null, 'r', 150)).toBe(L.lifelines[0].rows[1].y);
    const mid = L.lifelines[4];
    expect(yAt(L, null, 'c', 0)).toBe(mid.y + mid.h / 2);
    const z = layoutTiming({ ...d, end: 0, lifelines: [life('k', 'clock', [], 0)] });
    expect(z.end).toBe(1);
    expect(z.lifelines[0].period).toBe(1);
    expect(changesOf(d, 'r').map((c) => c.id)).toEqual(['2', '3', '1']);
  });
});

describe('node', () => {
  it('node helpers', () => {
    const dg = timingModelToDiagram(emptyTiming(), 'N', { x: 1, y: 2 });
    const n = dg.nodes[0];
    expect(isTimingNode(n)).toBe(true);
    expect(isTimingNode(undefined)).toBe(false);
    expect(timingOf(n).label).toBe('N');
    expect(withTimingSize({ ...n, style: undefined }).height).toBe(n.height);
    expect(isTimingNode({ ...n, type: 'x' } as DiagramNode)).toBe(false);
  });
});

describe('validate', () => {
  const ok = (): Record<string, unknown> => ({
    lifelines: [{ id: 'a', name: 'A', kind: 'robust', states: ['x'] }], changes: [{ id: 'c1', life: 'a', t: 0, state: 'x' }],
    messages: [{ id: 'm1', from: 'a', to: 'a', t: 1, text: 't', t2: 2 }], durations: [{ id: 'k1', life: 'a', t1: 0, t2: 1, text: 't' }], end: 10, unit: 'ms',
  });
  const bad = (f: (d: Record<string, any>) => void) => { const d = ok() as Record<string, any>; f(d); return validateTiming(d); };
  it('accepts valid', () => expect(validateTiming(ok())).toBeUndefined());
  it('rejects', () => {
    expect(bad((d) => { d.changes = 1; })).toBe('changes must be an array');
    expect(bad((d) => { d.end = 0; })).toMatch(/end/);
    expect(bad((d) => { d.unit = 1; })).toMatch(/unit/);
    expect(bad((d) => { d.lifelines[0] = null; })).toMatch(/needs id/);
    expect(bad((d) => { d.lifelines[0].id = ''; })).toMatch(/needs id/);
    expect(bad((d) => { d.lifelines[0].kind = 'q'; })).toMatch(/kind/);
    expect(bad((d) => { d.lifelines[0].states = [1]; })).toMatch(/states/);
    expect(bad((d) => { d.lifelines[0].states = 'x'; })).toMatch(/states/);
    expect(bad((d) => { d.lifelines[0].period = -1; })).toMatch(/period/);
    expect(bad((d) => { d.lifelines[0].period = 5; })).toBeUndefined();
    expect(bad((d) => { d.lifelines.push({ ...d.lifelines[0] }); })).toMatch(/duplicate lifeline/);
    expect(bad((d) => { d.changes[0].id = ''; })).toMatch(/needs an id/);
    expect(bad((d) => { d.changes[0] = null; })).toMatch(/needs an id/);
    expect(bad((d) => { d.messages[0].id = 'c1'; })).toMatch(/duplicate id/);
    expect(bad((d) => { d.changes[0].life = 'zz'; })).toMatch(/changes\[0\]/);
    expect(bad((d) => { d.changes[0].t = 'x'; })).toMatch(/changes\[0\]/);
    expect(bad((d) => { d.changes[0].state = 1; })).toMatch(/changes\[0\]/);
    expect(bad((d) => { d.messages[0].from = 'zz'; })).toMatch(/messages\[0\]/);
    expect(bad((d) => { d.messages[0].to = 1; })).toMatch(/messages\[0\]/);
    expect(bad((d) => { d.messages[0].t = NaN; })).toMatch(/messages\[0\]/);
    expect(bad((d) => { d.messages[0].text = 1; })).toMatch(/messages\[0\]/);
    expect(bad((d) => { d.messages[0].t2 = 'x'; })).toMatch(/t2/);
    expect(bad((d) => { delete d.messages[0].t2; })).toBeUndefined();
    expect(bad((d) => { d.durations[0].id = ''; })).toMatch(/needs an id/);
    expect(bad((d) => { d.durations[0].life = 'zz'; })).toMatch(/durations\[0\]/);
    expect(bad((d) => { d.durations[0].t1 = 'a'; })).toMatch(/durations\[0\]/);
    expect(bad((d) => { d.durations[0].t2 = 'a'; })).toMatch(/durations\[0\]/);
    expect(bad((d) => { d.durations[0].text = 1; })).toMatch(/durations\[0\]/);
  });
});

describe('edit', () => {
  it('addLifeline kinds', () => {
    let d = E.addLifeline(base(), 'robust');
    expect(d.lifelines[0].name).toBe('Robust 1');
    d = E.addLifeline(d, 'binary', 'Bin');
    expect(d.lifelines[1].name).toBe('Bin');
    expect(d.changes).toHaveLength(1);
    d = E.addLifeline(d, 'clock');
    expect(d.lifelines[2].period).toBe(50);
    d = E.addLifeline(d, 'concise');
    expect(d.lifelines).toHaveLength(4);
    expect(d.changes).toHaveLength(1);
    expect(E.addLifeline(base()).lifelines[0].kind).toBe('robust');
  });
  it('remove, rename, move, period', () => {
    let d: TimingData = { ...base(), lifelines: [life('a', 'robust', ['x']), life('b', 'clock', [], 10), life('c', 'concise')], changes: [{ id: 'c1', life: 'a', t: 0, state: 'x' }], messages: [{ id: 'm1', from: 'a', to: 'b', t: 1, text: '' }], durations: [{ id: 'k1', life: 'a', t1: 0, t2: 1, text: '' }] };
    const r = E.removeLifeline(d, 'a');
    expect([r.changes, r.messages, r.durations].map((x) => x.length)).toEqual([0, 0, 0]);
    expect(E.renameLifeline(d, 'a', 'Z').lifelines[0].name).toBe('Z');
    expect(E.renameLifeline(d, 'a', 'Z').lifelines[1].name).toBe('b');
    expect(E.moveLifeline(d, 'zz', 0)).toBe(d);
    expect(E.moveLifeline(d, 'a', 99).lifelines.map((l) => l.id)).toEqual(['b', 'c', 'a']);
    expect(E.moveLifeline(d, 'c', -5).lifelines[0].id).toBe('c');
    expect(E.setClockPeriod(d, 'b', 2.5).lifelines[1].period).toBe(2.5);
    expect(E.setClockPeriod(d, 'b', 0).lifelines[1].period).toBe(10);
    expect(E.setClockPeriod(d, 'a', 5).lifelines[0].period).toBeUndefined();
    d = E.setEnd(d, 50); expect(d.end).toBe(50);
    expect(E.setEnd(d, -1).end).toBe(50);
    expect(E.setUnit(d, ' s ').unit).toBe('s');
  });
  it('setLifelineKind', () => {
    const d: TimingData = { ...base(), lifelines: [life('a', 'robust', ['x', 'y']), life('e', 'concise', []), life('c', 'clock', [], 7)], changes: [{ id: 'c1', life: 'a', t: 0, state: 'x' }, { id: 'c2', life: 'a', t: 1, state: 'high' }, { id: 'c3', life: 'c', t: 0, state: 'q' }] };
    expect(E.setLifelineKind(d, 'a', 'zzz' as never)).toBe(d);
    expect(E.setLifelineKind(d, 'nope', 'binary')).toBe(d);
    expect(E.setLifelineKind(d, 'a', 'robust')).toBe(d);
    const b = E.setLifelineKind(d, 'a', 'binary');
    expect(b.lifelines[0].states).toEqual(['high', 'low']);
    expect(b.changes.map((c) => c.state)).toEqual(['low', 'high', 'q']);
    const k = E.setLifelineKind(d, 'a', 'clock');
    expect(k.lifelines[0].period).toBe(50);
    expect(k.changes.filter((c) => c.life === 'a')).toHaveLength(0);
    expect(E.setLifelineKind(d, 'c', 'concise').lifelines[2].period).toBeUndefined();
    expect(E.setLifelineKind(d, 'c', 'concise').lifelines[2].states).toEqual(['q']);
    expect(E.setLifelineKind(d, 'c', 'binary').changes.find((c) => c.id === 'c3')?.state).toBe('low');
    expect(E.setLifelineKind(d, 'e', 'clock').lifelines[1].period).toBe(50);
    expect(E.setLifelineKind({ ...d, lifelines: [life('k', 'robust', ['x'], 9)] }, 'k', 'clock').lifelines[0].period).toBe(9);
  });
  it('setStateAt', () => {
    const d: TimingData = { ...base(), lifelines: [life('a', 'robust', ['x']), life('b', 'binary'), life('c', 'clock')] };
    expect(E.setStateAt(d, 'zz', 0, 'x')).toBe(d);
    expect(E.setStateAt(d, 'c', 0, 'x')).toBe(d);
    expect(E.setStateAt(d, 'a', 0, ' ')).toBe(d);
    let r = E.setStateAt(d, 'a', 10.0004, ' new ');
    expect(r.lifelines[0].states).toEqual(['x', 'new']);
    r = E.setStateAt(r, 'a', 10, 'x');
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].state).toBe('x');
    r = E.setStateAt(r, 'a', 9999, 'x');
    expect(r.changes[1].t).toBe(400);
    expect(E.setStateAt(d, 'b', 5, 'weird').changes[0].state).toBe('low');
    expect(E.setStateAt(d, 'b', 5, 'high').lifelines[1].states).toEqual([]);
  });
  it('addChangeAt', () => {
    const d: TimingData = { ...base(), lifelines: [life('a', 'robust', ['x', 'y']), life('e', 'concise'), life('c', 'clock')], changes: [{ id: 'c1', life: 'a', t: 0, state: 'x' }] };
    expect(E.addChangeAt(d, 'zz', 5).changeId).toBeUndefined();
    expect(E.addChangeAt(d, 'c', 5).data).toBe(d);
    const r = E.addChangeAt(d, 'a', 100);
    expect(r.data.changes.find((c) => c.id === r.changeId)?.state).toBe('y');
    const r2 = E.addChangeAt(d, 'a', 100, 'x');
    expect(r2.data.changes.find((c) => c.id === r2.changeId)?.state).toBe('x');
    const full = E.addChangeAt({ ...d, lifelines: [life('a', 'robust', ['x'])] }, 'a', 50);
    expect(full.data.changes.find((c) => c.id === full.changeId)?.state).toBe('State 2');
    const noPrev = E.addChangeAt({ ...d, changes: [] }, 'a', 50);
    expect(noPrev.data.changes[0].state).toBe('x');
    const con = E.addChangeAt(d, 'e', 20);
    expect(con.data.changes.find((c) => c.id === con.changeId)?.state).toBe('State 1');
  });
  it('moveChange', () => {
    const d: TimingData = { ...base(), lifelines: [life('a', 'robust', ['x', 'y'])], changes: [{ id: 'c1', life: 'a', t: 0, state: 'x' }, { id: 'c2', life: 'a', t: 100, state: 'y' }] };
    expect(E.moveChange(d, 'zz', 5)).toBe(d);
    const m = E.moveChange(d, 'c2', 0);
    expect(m.changes.map((c) => c.id)).toEqual(['c2']);
    const s = E.moveChange(d, 'c2', 200, 'x');
    expect(s.changes.find((c) => c.id === 'c2')).toMatchObject({ t: 200, state: 'x' });
    expect(E.moveChange(d, 'c2', 200, 'y').changes.find((c) => c.id === 'c2')?.t).toBe(200);
    expect(E.removeChange(d, 'c1').changes).toHaveLength(1);
  });
  it('renameState', () => {
    const d: TimingData = { ...base(), lifelines: [life('a', 'robust', ['x', 'y']), life('b', 'binary'), life('k', 'clock')], changes: [{ id: 'c1', life: 'a', t: 0, state: 'x' }] };
    expect(E.renameState(d, 'a', 'x', ' ')).toBe(d);
    expect(E.renameState(d, 'zz', 'x', 'q')).toBe(d);
    expect(E.renameState(d, 'b', 'x', 'q')).toBe(d);
    expect(E.renameState(d, 'k', 'x', 'q')).toBe(d);
    expect(E.renameState(d, 'a', 'x', 'x')).toBe(d);
    const r = E.renameState(d, 'a', 'x', 'q');
    expect(r.lifelines[0].states).toEqual(['q', 'y']);
    expect(r.changes[0].state).toBe('q');
    expect(E.renameState(d, 'a', 'x', 'y').lifelines[0].states).toEqual(['y']);
  });
  it('messages', () => {
    const d: TimingData = { ...base(), lifelines: [life('a', 'robust'), life('b', 'robust')] };
    expect(E.addMessage(base()).id).toBeUndefined();
    const one: TimingData = { ...base(), lifelines: [life('a', 'robust')] };
    expect(E.addMessage(one).data.messages[0]).toMatchObject({ from: 'a', to: 'a', t: 200, text: 'message' });
    const r = E.addMessage(d, 'a', 'b', 50, 'hi');
    expect(r.data.messages[0]).toMatchObject({ to: 'b', t: 50, text: 'hi' });
    const u = E.updateMessage(r.data, r.id!, { text: 'yo' });
    expect(u.messages[0].text).toBe('yo');
    expect(E.updateMessage(r.data, 'x', { text: 'yo' }).messages[0].text).toBe('hi');
    expect(E.removeMessage(u, r.id!).messages).toHaveLength(0);
    expect(E.moveMessage(u, 'zz', 5)).toBe(u);
    expect(E.moveMessage(u, r.id!, 80).messages[0]).toMatchObject({ t: 80 });
    const withT2 = { ...u, messages: [{ ...u.messages[0], t2: 60 }] };
    const mv = E.moveMessage(withT2, r.id!, 100).messages[0];
    expect(mv).toMatchObject({ t: 100, t2: 110 });
  });
  it('constraints', () => {
    const d: TimingData = { ...base(), lifelines: [life('a', 'robust')] };
    expect(E.addConstraint(base()).id).toBeUndefined();
    const r = E.addConstraint(d);
    expect(r.data.durations[0]).toMatchObject({ t1: 100, t2: 200, text: '{duration}' });
    expect(E.addConstraint(d, 'a', 300, 100, 'x').data.durations[0]).toMatchObject({ t1: 100, t2: 300 });
    const u = E.updateConstraint(r.data, r.id!, { text: 'n' });
    expect(u.durations[0].text).toBe('n');
    expect(E.updateConstraint(r.data, 'x', { text: 'n' }).durations[0].text).toBe('{duration}');
    expect(E.removeConstraint(u, r.id!).durations).toHaveLength(0);
  });
  it('tidy', () => {
    const d: TimingData = {
      ...base(), end: 10,
      lifelines: [life('a', 'robust', ['unused']), life('e', 'concise', ['unused2']), life('b', 'binary')],
      changes: [{ id: 'c1', life: 'a', t: 3, state: 'x' }, { id: 'c2', life: 'a', t: 3, state: 'y' }, { id: 'c3', life: 'zz', t: 0, state: 'q' }, { id: 'c4', life: 'e', t: 95, state: 'w' }, { id: 'c5', life: 'a', t: -4, state: 'x' }],
      messages: [{ id: 'm1', from: 'a', to: 'zz', t: 1, text: '' }, { id: 'm2', from: 'a', to: 'e', t: 1, t2: 120, text: '' }],
      durations: [{ id: 'k1', life: 'a', t1: 1, t2: 2, text: '' }, { id: 'k2', life: 'zz', t1: 1, t2: 2, text: '' }],
    };
    const { data, fixes } = E.tidyTiming(d);
    expect(fixes).toContain('removed 3 dangling items');
    expect(fixes.some((f) => f.startsWith('axis extended'))).toBe(true);
    expect(fixes).toContain('merged changes at the same time');
    expect(data.end).toBeGreaterThanOrEqual(120);
    expect(data.lifelines[0].states).toEqual(['unused', 'x']);
    expect(data.lifelines[1].states).toEqual(['w']);
    expect(data.lifelines[2]).toBe(d.lifelines[2]);
    expect(data.messages[0].t2).toBeDefined();
    expect(fixes.some((f) => f.includes('rows follow'))).toBe(true);
    const clean = E.tidyTiming({ ...base(), lifelines: [life('a', 'robust', ['x'])], changes: [{ id: 'c', life: 'a', t: 0, state: 'x' }], messages: [{ id: 'm', from: 'a', to: 'a', t: 1, text: '' }] });
    expect(clean.fixes).toEqual([]);
    const one = E.tidyTiming({ ...base(), lifelines: [life('a', 'robust')], changes: [{ id: 'c', life: 'zz', t: 0, state: 'x' }] });
    expect(one.fixes).toContain('removed 1 dangling item');
  });
});

describe('plantuml', () => {
  const m: TimingModel = {
    end: 100, unit: '',
    lifelines: [life('l1', 'robust', ['Idle', 'Busy now']), life('l2', 'clock', [], 25), life('l3', 'binary', ['high', 'low']), life('l4', 'concise'), { id: 'l5', name: '1 "x"', kind: 'concise', states: [] }, { id: 'l6', name: '!!', kind: 'clock', states: [] }],
    changes: [{ id: 'c1', life: 'l1', t: 0, state: 'Idle' }, { id: 'c2', life: 'l1', t: 10, state: 'Busy now' }, { id: 'c3', life: 'l3', t: 10, state: 'high' }, { id: 'c4', life: 'gone', t: 10, state: 'x' }],
    messages: [{ id: 'm1', from: 'l1', to: 'l4', t: 10, t2: 20, text: 'req' }, { id: 'm2', from: 'l1', to: 'l4', t: 30, t2: 30, text: '' }, { id: 'm3', from: 'gone', to: 'l4', t: 30, text: '' }],
    durations: [{ id: 'k1', life: 'l1', t1: 0, t2: 10, text: '{5 ms}' }, { id: 'k2', life: 'l1', t1: 0, t2: 10, text: '5' }, { id: 'k3', life: 'l1', t1: 0, t2: 10, text: '' }, { id: 'k4', life: 'gone', t1: 0, t2: 1, text: '' }],
  };
  it('renders', () => {
    const t = renderTimingPlantuml(m);
    expect(t).toContain('robust "Idle'.slice(0, 0) + 'robust "l1" as l1');
    expect(t).toContain('l1 has Idle,Busy now');
    expect(t).toContain('clock "l2" as l2 with period 25');
    expect(t).toContain('clock "!!" as L with period 1');
    expect(t).toContain('as L1x');
    expect(t).toContain('l1 is "Busy now"');
    expect(t).toContain('l1 -> l4@20 : req');
    expect(t).toContain('l1 -> l4\n');
    expect(t).toContain('l1@0 <-> @10 : {5 ms}');
    expect(t).toContain('{5}');
    expect(t).toContain('l1@0 <-> @10\n');
  });
  it('detects', () => {
    expect(looksLikeTimingPlantuml('@startuml\nrobust "A" as A\n@enduml')).toBe(true);
    expect(looksLikeTimingPlantuml('@startuml\nrobust "A" as A\nclass X')).toBe(false);
    expect(looksLikeTimingPlantuml('robust "A"')).toBe(false);
  });
  it('round trips', () => {
    const r = parseTimingPlantuml(renderTimingPlantuml({ ...m, lifelines: m.lifelines.slice(0, 4), durations: m.durations.slice(0, 1) }));
    expect(r.model.lifelines.map((l) => l.kind)).toEqual(['robust', 'clock', 'binary', 'concise']);
    expect(r.model.lifelines[1].period).toBe(25);
    expect(r.model.messages[0]).toMatchObject({ t: 10, t2: 20, text: 'req' });
    expect(r.model.durations[0]).toMatchObject({ t1: 0, t2: 10, text: '{5 ms}' });
    expect(r.model.end).toBeGreaterThan(30);
  });
  it('parse edge cases', () => {
    const src = `@startuml
/' block
comment '/
' line
title T
robust "R" as R
binary B
concise "C" as C
clock K with period 10
clock K2
R has Idle, "Busy", 
B has nope
Z has foo
@0
R is Idle
B is 1
B is low
@+50
R is Run : note
R is Run
C is X
@bad
@+zz
R@10 -> C@+5 : go
R -> C
R@q -> C
R -> C@oops : x
K@0 <-> @+20 : {w}
K@x <-> @5
Z@0 <-> @5
Q -> R
what is this
@enduml`;
    const { model, warnings } = parseTimingPlantuml(src);
    expect(model.lifelines.map((l) => l.name)).toEqual(['R', 'B', 'C', 'K', 'K2']);
    expect(model.lifelines[3].period).toBe(10);
    expect(model.lifelines[4].period).toBeUndefined();
    expect(model.lifelines[0].states).toEqual(['Idle', 'Busy', 'Run']);
    expect(model.changes.filter((c) => c.life === 'l2').map((c) => c.state)).toEqual(['low']);
    expect(model.messages[0]).toMatchObject({ t: 10, t2: 55, text: 'go' });
    expect(model.messages[1].t).toBe(50);
    expect(model.messages[2].t2).toBeUndefined();
    expect(model.durations).toHaveLength(1);
    expect(model.durations[0]).toMatchObject({ t1: 0, t2: 70, text: '{w}' });
    expect(warnings).toEqual(expect.arrayContaining(['Skipped time mark: @bad', 'Skipped time mark: @+zz', 'Skipped: R@q -> C', 'Skipped: K@x <-> @5', 'Skipped: Z@0 <-> @5', 'Skipped: Q -> R', 'Skipped: what is this']));
    const e = parseTimingPlantuml('@startuml\n@enduml');
    expect(e.model.end).toBe(100);
  });
});

describe('extra branches', () => {
  it('blankTiming, rowAt nearest, has dup, durations none', () => {
    const b = timingOf(blankTiming('x', { x: 0, y: 0 }));
    expect(b.lifelines.map((l) => l.name)).toEqual(['User', 'Server']);
    expect(validateTiming(b)).toBeUndefined();
    const L = layoutTiming(b);
    expect(rowAt(L.lifelines[1], L.lifelines[1].rows[0].y)).toBe('Idle');
    const r = parseTimingPlantuml('@startuml\nrobust R\nR has A\nR has A,B\nR has\nR is A\nR@0 <-> @5\n@enduml');
    expect(r.model.lifelines[0].states).toEqual(['A', 'B']);
    expect(r.model.durations[0].text).toBe('');
    expect(renderTimingPlantuml({ ...emptyTiming(), lifelines: [life('a', 'robust')] })).not.toContain('<->');
  });
});

