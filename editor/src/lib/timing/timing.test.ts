import { describe, expect, it } from 'vitest';
import { applyDsl, pageToDsl } from '@core/dsl';
import type { DiagramNode } from '../../types';
import { validateDiagram } from '../serialization';
import { addChangeAt, addConstraint, addLifeline, addMessage, moveChange, moveMessage, removeLifeline, renameState, setLifelineKind, setStateAt, tidyTiming } from './edit';
import { changesOf, layoutTiming, niceStep, rowAt, snapStep, snapT, tOf, timingSize, xOf, TM } from './layout';
import { blankTiming, timingModelToDiagram, timingOf, withTimingSize } from './node';
import { emptyTiming, type TimingData } from './types';
import { validateTiming } from './validate';

const start = (): TimingData => ({ ...emptyTiming(), label: 'T', accent: '#c2410c', end: 400, unit: 'ms' });
const blank = (): TimingData => timingOf(blankTiming('t', { x: 0, y: 0 }));

describe('timing layout', () => {
  it('owns the size: width fixed, height follows the lifeline rows', () => {
    const d = blank();
    const s = timingSize(d);
    expect(s.width).toBe(TM.pad + TM.labelW + TM.axisW + TM.rightPad);
    const bigger = addLifeline(d, 'binary');
    expect(timingSize(bigger).height).toBe(s.height + TM.binaryH + TM.rowGap);
    const node = withTimingSize({ id: 't', type: 'timing', position: { x: 0, y: 0 }, data: bigger as never });
    expect([node.width, node.height]).toEqual([s.width, s.height + TM.binaryH + TM.rowGap]);
  });

  it('maps time to x and back, picks ticks and snaps to a grid that follows the axis length', () => {
    const L = layoutTiming(blank());
    expect(xOf(L, 0)).toBe(L.x0);
    expect(xOf(L, 400)).toBe(L.x1);
    expect(tOf(L, xOf(L, 123))).toBeCloseTo(123);
    expect(L.ticks.map((t) => t.t)).toEqual([0, 50, 100, 150, 200, 250, 300, 350, 400]);
    expect(niceStep(1000)).toBe(200);
    expect([snapStep(100), snapStep(400), snapStep(5000), snapStep(10)]).toEqual([1, 1, 10, 0.1]);
    expect(snapT(123.4, 400)).toBe(123);
    expect(snapT(1234, 5000)).toBe(1230);
  });

  it('builds segments from the changes in time order and rows for robust / binary lifelines', () => {
    const d = blank();
    const L = layoutTiming(d);
    const web = L.lifelines.find((l) => l.id === 'l2')!;
    expect(web.rows.map((r) => r.state)).toEqual(['Idle', 'Busy']);
    expect(web.segments.map((s) => [s.t0, s.t1, s.state])).toEqual([[0, 150, 'Idle'], [150, 250, 'Busy'], [250, 400, 'Idle']]);
    expect(rowAt(web, web.rows[1].y + 3)).toBe('Busy');
    expect(changesOf({ changes: [{ id: 'b', life: 'x', t: 5, state: 's' }, { id: 'a', life: 'x', t: 1, state: 's' }] }, 'x').map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('timing editing', () => {
  it('adds lifelines of every kind with sensible defaults', () => {
    let d = start();
    for (const k of ['robust', 'concise', 'binary', 'clock'] as const) d = addLifeline(d, k);
    expect(d.lifelines.map((l) => [l.name, l.kind])).toEqual([['Robust 1', 'robust'], ['Concise 1', 'concise'], ['Binary 1', 'binary'], ['Clock 1', 'clock']]);
    expect(d.lifelines[3].period).toBe(50);
    expect(d.changes).toEqual([expect.objectContaining({ life: 'l3', t: 0, state: 'low' })]);
    expect(validateTiming(d)).toBeUndefined();
  });

  it('click on a track adds a change: the clicked row for robust, a new named state for concise; same time replaces', () => {
    let d = addLifeline(addLifeline(start(), 'robust'), 'concise');
    d = setStateAt(setStateAt(d, 'l1', 0, 'Idle'), 'l1', 10, 'Busy');
    const r = addChangeAt(d, 'l1', 203.7, 'Busy');
    expect(r.data.changes.find((c) => c.id === r.changeId)).toMatchObject({ life: 'l1', t: 204, state: 'Busy' });
    const c = addChangeAt(r.data, 'l2', 100);
    expect(c.data.lifelines[1].states).toEqual(['State 1']);
    const again = addChangeAt(c.data, 'l2', 100, undefined);
    expect(again.data.changes.filter((x) => x.life === 'l2' && x.t === 100)).toHaveLength(1);
    expect(addChangeAt(d, 'nope', 5).data).toBe(d);
  });

  it('dragging retimes (snapped, clamped), merges with a change at the target time and can re-state', () => {
    let d = setStateAt(setStateAt(setStateAt(addLifeline(start(), 'robust'), 'l1', 0, 'A'), 'l1', 100, 'B'), 'l1', 200, 'C');
    const ch = (t: number) => d.changes.find((c) => c.t === t)!.id;
    d = moveChange(d, ch(100), 150.4);
    expect(changesOf(d, 'l1').map((c) => [c.t, c.state])).toEqual([[0, 'A'], [150, 'B'], [200, 'C']]);
    d = moveChange(d, ch(150), 999);
    expect(changesOf(d, 'l1').map((c) => c.t)).toEqual([0, 200, 400]);
    const id = ch(0);
    d = moveChange(d, id, 200, 'A');
    expect(changesOf(d, 'l1').map((c) => [c.t, c.state])).toEqual([[200, 'A'], [400, 'B']]);
  });

  it('keeps state lists, renames states and survives a kind switch', () => {
    let d = setStateAt(setStateAt(addLifeline(start(), 'robust'), 'l1', 0, 'x'), 'l1', 50, 'y');
    d = renameState(d, 'l1', 'x', 'idle');
    expect(d.lifelines[0].states).toEqual(['idle', 'y']);
    expect(d.changes.map((c) => c.state)).toEqual(['idle', 'y']);
    d = setLifelineKind(d, 'l1', 'binary');
    expect(d.lifelines[0].states).toEqual(['high', 'low']);
    expect(d.changes.map((c) => c.state)).toEqual(['low', 'low']);
    d = setLifelineKind(d, 'l1', 'clock');
    expect(d.changes).toEqual([]);
    expect(d.lifelines[0].period).toBeGreaterThan(0);
  });

  it('messages and durations reference lifelines; removing a lifeline takes them along', () => {
    let d = addLifeline(addLifeline(start(), 'robust'), 'concise');
    const m = addMessage(d);
    d = moveMessage(m.data, m.id!, 123.6);
    expect(d.messages[0]).toMatchObject({ from: 'l1', to: 'l2', t: 124 });
    d = addConstraint(d, 'l1', 300, 100).data;
    expect(d.durations[0]).toMatchObject({ t1: 100, t2: 300 });
    expect(validateTiming(d)).toBeUndefined();
    d = removeLifeline(d, 'l2');
    expect(d.messages).toEqual([]);
    expect(d.durations).toHaveLength(1);
    expect(addMessage(start()).data.messages).toEqual([]);
  });

  it('tidy drops dangling items, merges same-time changes and fits the axis', () => {
    const d = blank();
    const messy: TimingData = {
      ...d, end: 100,
      changes: [...d.changes, { id: 'z', life: 'gone', t: 1, state: 'x' }, { id: 'dup', life: 'l1', t: 100.2, state: 'Idle' }],
      messages: [{ id: 'mx', from: 'l1', to: 'gone', t: 1, text: '' }],
    };
    const r = tidyTiming(messy);
    expect(r.data.changes.some((c) => c.life === 'gone')).toBe(false);
    expect(r.data.messages).toEqual([]);
    expect(r.data.end).toBeGreaterThanOrEqual(300);
    expect(r.fixes.join('|')).toMatch(/dangling/);
    expect(r.fixes.join('|')).toMatch(/axis/);
    expect(tidyTiming(r.data).fixes).toEqual([]);
  });
});

describe('timing validation and the file format', () => {
  it('validateDiagram accepts a timing frame and names the broken part', () => {
    const node = blankTiming('t', { x: 0, y: 0 });
    expect(validateDiagram({ version: 1, nodes: [node], edges: [] })).toMatchObject({ ok: true });
    const bad = { ...node, data: { ...node.data, changes: [{ id: 'c', life: 'nope', t: 0, state: 'x' }] } };
    expect(validateDiagram({ version: 1, nodes: [bad], edges: [] })).toMatchObject({ ok: false, error: expect.stringContaining('changes[0]') });
    expect(validateTiming({ ...timingOf(node), end: 0 })).toMatch(/end/);
    expect(validateTiming({ ...timingOf(node), lifelines: [{ id: 'a', name: 'A', kind: 'weird', states: [] }] })).toMatch(/kind/);
  });

  it('timingModelToDiagram wraps a model in a frame', () => {
    const d = timingModelToDiagram(emptyTiming(), 'X');
    expect(d.nodes[0]).toMatchObject({ type: 'timing', data: { label: 'X' } });
  });
});

describe('.sdd timing block', () => {
  const TEXT = `timing t1 "Web request" {
  unit ms
  end 400
  robust wb "Web browser" states Idle, Waiting, "Not found"
  concise wu "Web user"
  binary sw "Switch"
  clock ck "Clock" period=50
  wb @0 Idle
  wu @0 Idle
  sw @0 low
  wu @100 Waiting
  wb @100 Waiting
  sw @150 high
  wb @300 "Not found"
  wu -> wb @100..150 "URL"
  wb 100..300 "{200 ms}"
}
`;
  const build = (t: string, page?: Parameters<typeof applyDsl>[0]) => applyDsl(page, t, { layout: false });

  it('builds the node with exact data and size, then prints the same text back', () => {
    const r = build(TEXT);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const n = r.page.nodes[0];
    expect(n).toMatchObject({ id: 't1', type: 'timing', data: { label: 'Web request', unit: 'ms', end: 400 } });
    expect(n.data.lifelines.map((l: any) => [l.id, l.kind, l.states.length])).toEqual([['wb', 'robust', 3], ['wu', 'concise', 2], ['sw', 'binary', 2], ['ck', 'clock', 0]]);
    expect(n.data.lifelines[3].period).toBe(50);
    expect(n.data.messages[0]).toMatchObject({ from: 'wu', to: 'wb', t: 100, t2: 150, text: 'URL' });
    expect(n.data.durations[0]).toMatchObject({ life: 'wb', t1: 100, t2: 300 });
    expect([n.width, n.height]).toEqual([timingSize(n.data as never).width, timingSize(n.data as never).height]);
    expect(validateDiagram({ version: 1, nodes: r.page.nodes as unknown as DiagramNode[], edges: [] }).ok).toBe(true);
    const text = pageToDsl(r.page);
    expect(text).toContain('timing t1 "Web request" {');
    expect(text).toContain('robust wb "Web browser" states Idle, Waiting, "Not found"');
    expect(text).toContain('wu -> wb @100..150 "URL"');
    const again = build(text, r.page);
    expect(pageToDsl(again.page)).toBe(text);
    expect(again.added).toEqual([]);
    expect(again.removed).toEqual([]);
  });

  it('end defaults to the last time; editing the text updates the node in place; removing the block removes the node', () => {
    const r = build('timing x "X" {\n  robust a\n  a @0 s\n  a @80 t\n}\n');
    expect(r.page.nodes[0].data.end).toBe(80);
    const r2 = build(TEXT.replace('wb @300 "Not found"', 'wb @350 Idle'), build(TEXT).page);
    expect(r2.page.nodes).toHaveLength(1);
    expect(r2.page.nodes[0].data.changes.some((c: any) => c.t === 350)).toBe(true);
    expect(build('', r2.page).removed).toEqual(['t1']);
  });

  it('reports mistakes with a line each', () => {
    const r = build('timing x "X" {\n  robust a\n  a @0 s\n  b @5 s\n  a -> ghost @5\n  a @x s\n  clock c\n  c @1 s\n  binary d\n  d @1 maybe\n  frob 1\n  end -3\n  a 1..2..3\n}\n');
    const errs = r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
    expect(errs).toEqual(expect.arrayContaining(['unknown lifeline "b"', 'unknown lifeline "ghost"', 'expected a time like @100', 'a clock has no state changes', expect.stringContaining('unknown statement "frob"'), 'end is a positive number, e.g. end 400']));
    expect(r.diagnostics.some((d) => d.severity === 'warning' && /high or low/.test(d.message))).toBe(true);
  });

  it('a frame made in the editor prints a timing block that parses back to the same data', () => {
    const node = blankTiming('tmx', { x: 0, y: 0 });
    const text = pageToDsl({ id: 'p', name: 'P', nodes: [node] as never, edges: [] });
    const back = build(text).page.nodes[0];
    expect(back.data.changes).toHaveLength(6);
    expect(back.data.lifelines.map((l: any) => l.id)).toEqual(['l1', 'l2']);
    expect(back.data.durations[0].text).toBe('{100 ms}');
  });
});
