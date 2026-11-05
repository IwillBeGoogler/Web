/** UML timing diagram. A `timing` node stores a TimingData in `node.data`; the layout engine (layout.ts) owns every coordinate. */
export type LifelineKind = 'robust' | 'concise' | 'binary' | 'clock';
export const LIFELINE_KINDS: LifelineKind[] = ['robust', 'concise', 'binary', 'clock'];
export const LIFELINE_LABEL: Record<LifelineKind, string> = { robust: 'Robust (state rows)', concise: 'Concise (state bands)', binary: 'Binary (high / low)', clock: 'Clock' };
/** the two levels of a binary lifeline, top to bottom */
export const BINARY_STATES = ['high', 'low'];
export const TIMING_ACCENT = '#c2410c';

export interface TimingLifeline {
  id: string;
  name: string;
  kind: LifelineKind;
  /** robust: the rows top to bottom (extended when a change names a new state); concise: the states seen so far; binary: always high / low; clock: unused */
  states: string[];
  /** clock only: length of one period in time units */
  period?: number;
}
/** from time `t` on, the lifeline is in `state` */
export interface TimingChange { id: string; life: string; t: number; state: string }
/** a message from one lifeline at time `t` to another at `t2` (default: the same time) */
export interface TimingMessage { id: string; from: string; to: string; t: number; t2?: number; text: string }
/** a duration constraint `{text}` drawn between two times under a lifeline */
export interface TimingConstraint { id: string; life: string; t1: number; t2: number; text: string }

export interface TimingModel {
  lifelines: TimingLifeline[];
  changes: TimingChange[];
  messages: TimingMessage[];
  durations: TimingConstraint[];
  /** end of the time axis (the axis starts at 0) */
  end: number;
  /** label of the time axis: `ms`, `s` ... (may be empty) */
  unit: string;
}
/** What a `timing` node stores in `node.data` (`label` is the diagram title). */
export interface TimingData extends TimingModel {
  label: string;
  accent: string;
}
export const emptyTiming = (): TimingModel => ({ lifelines: [], changes: [], messages: [], durations: [], end: 100, unit: '' });

/** ids for parsers (deterministic so tests can compare round trips) */
export function timingIds(): (prefix: string) => string {
  const n: Record<string, number> = {};
  return (p) => `${p}${(n[p] = (n[p] ?? 0) + 1)}`;
}
let counter = 0;
export const timingId = (prefix: string): string => `${prefix}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** round away float noise (0.1 + 0.2) */
export const roundT = (t: number): number => Math.round(t * 1000) / 1000;
