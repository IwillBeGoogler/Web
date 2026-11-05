import { BINARY_STATES, roundT, type TimingData, type TimingLifeline, type TimingModel } from './types';

/** Metrics shared by the layout engine, the renderer and the DSL size mirror (core/dsl/build2.ts `timingSizeOf`). */
export const TM = {
  pad: 16,
  title: 28,
  labelW: 120,
  axisW: 560,
  rowGap: 8,
  axisH: 36,
  tail: 12,
  rightPad: 32,
  stateH: 20,
  rowPad: 12,
  binaryH: 56,
  conciseH: 40,
  clockH: 40,
} as const;

export const timingWidth = (): number => TM.pad + TM.labelW + TM.axisW + TM.rightPad;
export function rowHeight(l: Pick<TimingLifeline, 'kind' | 'states'>): number {
  switch (l.kind) {
    case 'robust': return Math.max(2, l.states.length) * TM.stateH + TM.rowPad;
    case 'binary': return TM.binaryH;
    case 'clock': return TM.clockH;
    default: return TM.conciseH;
  }
}
export function timingSize(d: Pick<TimingModel, 'lifelines'>): { width: number; height: number } {
  const rows = d.lifelines.reduce((n, l) => n + rowHeight(l) + TM.rowGap, 0);
  return { width: timingWidth(), height: TM.pad + TM.title + rows + TM.axisH + TM.tail };
}

export interface Segment { t0: number; t1: number; state: string; changeId?: string }
export interface LaidLifeline {
  id: string;
  name: string;
  kind: TimingLifeline['kind'];
  y: number;
  h: number;
  /** y of each state row (robust / binary) */
  rows: { state: string; y: number }[];
  segments: Segment[];
  /** clock edges */
  period?: number;
}
export interface Tick { t: number; x: number }
export interface TimingLayout {
  width: number;
  height: number;
  lifelines: LaidLifeline[];
  ticks: Tick[];
  axisY: number;
  x0: number;
  x1: number;
  end: number;
}

/** 1, 2, 5 x 10^n step giving about 8 ticks */
export function niceStep(end: number): number {
  const raw = Math.max(end, 1) / 8;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return roundT((f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p);
}
/** the grid a time snaps to when you click or drag */
export function snapStep(end: number): number {
  return roundT(Math.max(0.1, 10 ** Math.floor(Math.log10(Math.max(end, 1) / 100))));
}
export const snapT = (t: number, end: number): number => roundT(Math.round(t / snapStep(end)) * snapStep(end));

/** the states a lifeline shows, top to bottom */
export const statesOf = (l: Pick<TimingLifeline, 'kind' | 'states'>): string[] => (l.kind === 'binary' ? BINARY_STATES : l.states);

/** changes of one lifeline in time order (a later entry at the same time wins) */
export function changesOf(d: Pick<TimingModel, 'changes'>, lifeId: string) {
  return d.changes.filter((c) => c.life === lifeId).map((c, i) => ({ c, i })).sort((a, b) => a.c.t - b.c.t || a.i - b.i).map((x) => x.c);
}

export function layoutTiming(d: TimingData | TimingModel): TimingLayout {
  const size = timingSize(d);
  const x0 = TM.pad + TM.labelW;
  const x1 = x0 + TM.axisW;
  const end = d.end > 0 ? d.end : 1;
  let y = TM.pad + TM.title;
  const lifelines: LaidLifeline[] = d.lifelines.map((l) => {
    const h = rowHeight(l);
    const states = statesOf(l);
    const rows = l.kind === 'robust' || l.kind === 'binary'
      ? states.map((state, i) => ({ state, y: l.kind === 'binary' ? y + 14 + i * (h - 28) : y + TM.rowPad / 2 + TM.stateH * (i + 0.5) + (Math.max(2, states.length) - states.length) * TM.stateH / 2 }))
      : [];
    const ch = changesOf(d, l.id);
    const segments: Segment[] = ch.map((c, i) => ({ t0: c.t, t1: Math.min(end, ch[i + 1]?.t ?? end), state: c.state, changeId: c.id }));
    const laid: LaidLifeline = { id: l.id, name: l.name, kind: l.kind, y, h, rows, segments, ...(l.kind === 'clock' ? { period: l.period && l.period > 0 ? l.period : Math.max(end / 8, 1) } : {}) };
    y += h + TM.rowGap;
    return laid;
  });
  const step = niceStep(end);
  const ticks: Tick[] = [];
  for (let t = 0; t <= end + 1e-9; t = roundT(t + step)) ticks.push({ t, x: x0 + (t / end) * TM.axisW });
  return { ...size, lifelines, ticks, axisY: y, x0, x1, end };
}

export const xOf = (L: Pick<TimingLayout, 'x0' | 'end'>, t: number): number => L.x0 + (t / L.end) * TM.axisW;
export const tOf = (L: Pick<TimingLayout, 'x0' | 'end'>, x: number): number => ((x - L.x0) / TM.axisW) * L.end;
/** the state row whose centre is closest to `y` */
export function rowAt(l: LaidLifeline, y: number): string | undefined {
  let best: { state: string; d: number } | undefined;
  for (const r of l.rows) if (!best || Math.abs(r.y - y) < best.d) best = { state: r.state, d: Math.abs(r.y - y) };
  return best?.state;
}
/** y of a lifeline's line at time t (message ends): the row of its state, else the middle */
export function yAt(L: TimingLayout, _d: unknown, lifeId: string, t: number): number {
  const l = L.lifelines.find((x) => x.id === lifeId);
  if (!l) return 0;
  const seg = [...l.segments].reverse().find((s) => s.t0 <= t);
  const row = seg && l.rows.find((r) => r.state === seg.state);
  return row ? row.y : l.y + l.h / 2;
}
