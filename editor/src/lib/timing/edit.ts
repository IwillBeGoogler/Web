import { changesOf, niceStep, snapT } from './layout';
import { BINARY_STATES, LIFELINE_KINDS, roundT, type LifelineKind, type TimingData, type TimingLifeline } from './types';

type D = TimingData;
const uniqueId = (taken: Set<string>, base: string): string => {
  let id = base, k = 1;
  while (taken.has(id)) id = `${base}${++k}`;
  return id;
};
const sameT = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const clampT = (d: D, t: number) => Math.max(0, Math.min(d.end, roundT(t)));

/** a lifeline of the given kind, named after its kind ("Robust 1") */
export function addLifeline(d: D, kind: LifelineKind = 'robust', name?: string): D {
  const n = d.lifelines.filter((l) => l.kind === kind).length + 1;
  const base = name ?? `${kind[0].toUpperCase()}${kind.slice(1)} ${n}`;
  const id = uniqueId(new Set(d.lifelines.map((l) => l.id)), `l${d.lifelines.length + 1}`);
  const life: TimingLifeline = { id, name: base, kind, states: kind === 'binary' ? [...BINARY_STATES] : [], ...(kind === 'clock' ? { period: Math.max(1, roundT(d.end / 8)) } : {}) };
  const init = kind === 'robust' || kind === 'concise' ? [] : kind === 'binary' ? [{ id: uniqueId(new Set(d.changes.map((c) => c.id)), `c${d.changes.length + 1}`), life: id, t: 0, state: 'low' }] : [];
  return { ...d, lifelines: [...d.lifelines, life], changes: [...d.changes, ...init] };
}
export function removeLifeline(d: D, id: string): D {
  return {
    ...d,
    lifelines: d.lifelines.filter((l) => l.id !== id),
    changes: d.changes.filter((c) => c.life !== id),
    messages: d.messages.filter((m) => m.from !== id && m.to !== id),
    durations: d.durations.filter((c) => c.life !== id),
  };
}
export const renameLifeline = (d: D, id: string, name: string): D => ({ ...d, lifelines: d.lifelines.map((l) => (l.id === id ? { ...l, name } : l)) });
export const moveLifeline = (d: D, id: string, to: number): D => {
  const from = d.lifelines.findIndex((l) => l.id === id);
  if (from < 0) return d;
  const list = [...d.lifelines];
  const [x] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, x);
  return { ...d, lifelines: list };
};
export const setClockPeriod = (d: D, id: string, period: number): D => ({ ...d, lifelines: d.lifelines.map((l) => (l.id === id && l.kind === 'clock' && period > 0 ? { ...l, period: roundT(period) } : l)) });
/** change the kind of a lifeline; a binary one keeps only high / low states */
export function setLifelineKind(d: D, id: string, kind: LifelineKind): D {
  if (!LIFELINE_KINDS.includes(kind)) return d;
  const l = d.lifelines.find((x) => x.id === id);
  if (!l || l.kind === kind) return d;
  const used = [...new Set(changesOf(d, id).map((c) => c.state))];
  const states = kind === 'binary' ? [...BINARY_STATES] : l.states.length ? l.states : used;
  const { period: _p, ...bare } = { ...l, kind, states };
  void _p;
  const next: TimingLifeline = kind === 'clock' ? { ...bare, period: l.period ?? Math.max(1, roundT(d.end / 8)) } : bare;
  const changes = kind === 'binary' ? d.changes.map((c) => (c.life === id && !BINARY_STATES.includes(c.state) ? { ...c, state: 'low' } : c)) : kind === 'clock' ? d.changes.filter((c) => c.life !== id) : d.changes;
  return { ...d, lifelines: d.lifelines.map((x) => (x.id === id ? next : x)), changes };
}

/** `lifeline` takes `state` from time `t` on; a change already at that time is replaced. Unknown states join the lifeline's rows. */
export function setStateAt(d: D, lifeId: string, t: number, state: string): D {
  const life = d.lifelines.find((l) => l.id === lifeId);
  if (!life || life.kind === 'clock' || !state.trim()) return d;
  const tt = clampT(d, t);
  const name = life.kind === 'binary' ? (BINARY_STATES.includes(state) ? state : 'low') : state.trim();
  const states = life.kind === 'binary' || life.states.includes(name) ? life.states : [...life.states, name];
  const same = d.changes.find((c) => c.life === lifeId && sameT(c.t, tt));
  const changes = same
    ? d.changes.map((c) => (c === same ? { ...c, state: name } : c))
    : [...d.changes, { id: uniqueId(new Set(d.changes.map((c) => c.id)), `c${d.changes.length + 1}`), life: lifeId, t: tt, state: name }];
  return { ...d, lifelines: d.lifelines.map((l) => (l.id === lifeId ? { ...l, states } : l)), changes };
}
/** click on a lifeline's track: robust and binary take the clicked row, a concise one a new state ("State n") */
export function addChangeAt(d: D, lifeId: string, t: number, row?: string): { data: D; changeId?: string } {
  const life = d.lifelines.find((l) => l.id === lifeId);
  if (!life || life.kind === 'clock') return { data: d };
  const tt = snapT(clampT(d, t), d.end);
  let state = row;
  if (!state) {
    const prev = [...changesOf(d, lifeId)].reverse().find((c) => c.t <= tt);
    state = life.kind === 'robust' ? (life.states.find((s) => s !== prev?.state) ?? `State ${life.states.length + 1}`) : `State ${new Set(d.changes.filter((c) => c.life === lifeId).map((c) => c.state)).size + 1}`;
  }
  const data = setStateAt(d, lifeId, tt, state);
  const ch = data.changes.find((c) => c.life === lifeId && sameT(c.t, tt));
  return { data, changeId: ch?.id };
}
/** drag a change: new time (snapped, order kept in the data by time) and, for robust / binary lifelines, optionally a new state row */
export function moveChange(d: D, id: string, t: number, state?: string): D {
  const ch = d.changes.find((c) => c.id === id);
  if (!ch) return d;
  const tt = snapT(clampT(d, t), d.end);
  const taken = d.changes.find((c) => c.id !== id && c.life === ch.life && sameT(c.t, tt));
  const moved: D = { ...d, changes: d.changes.filter((c) => c !== taken).map((c) => (c.id === id ? { ...c, t: tt } : c)) };
  return state && state !== ch.state ? setStateAt(moved, ch.life, tt, state) : moved;
}
export const removeChange = (d: D, id: string): D => ({ ...d, changes: d.changes.filter((c) => c.id !== id) });
/** rename a state everywhere it is used on one lifeline */
export function renameState(d: D, lifeId: string, from: string, to: string): D {
  const name = to.trim();
  const life = d.lifelines.find((l) => l.id === lifeId);
  if (!life || !name || life.kind === 'binary' || life.kind === 'clock' || from === name) return d;
  const states = life.states.includes(name) ? life.states.filter((s) => s !== from) : life.states.map((s) => (s === from ? name : s));
  return { ...d, lifelines: d.lifelines.map((l) => (l.id === lifeId ? { ...l, states } : l)), changes: d.changes.map((c) => (c.life === lifeId && c.state === from ? { ...c, state: name } : c)) };
}

export function addMessage(d: D, from?: string, to?: string, t?: number, text = 'message'): { data: D; id?: string } {
  const a = from ?? d.lifelines[0]?.id, b = to ?? d.lifelines[1]?.id ?? a;
  if (!a || !b) return { data: d };
  const id = uniqueId(new Set(d.messages.map((m) => m.id)), `m${d.messages.length + 1}`);
  const at = clampT(d, t ?? d.end / 2);
  return { data: { ...d, messages: [...d.messages, { id, from: a, to: b, t: at, text }] }, id };
}
export const updateMessage = (d: D, id: string, patch: Partial<D['messages'][number]>): D => ({ ...d, messages: d.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
export const removeMessage = (d: D, id: string): D => ({ ...d, messages: d.messages.filter((m) => m.id !== id) });
export function moveMessage(d: D, id: string, t: number): D {
  const m = d.messages.find((x) => x.id === id);
  if (!m) return d;
  const tt = snapT(clampT(d, t), d.end);
  const dt = m.t2 !== undefined ? m.t2 - m.t : 0;
  return updateMessage(d, id, { t: tt, ...(m.t2 !== undefined ? { t2: clampT(d, tt + dt) } : {}) });
}

export function addConstraint(d: D, life?: string, t1?: number, t2?: number, text = '{duration}'): { data: D; id?: string } {
  const l = life ?? d.lifelines[0]?.id;
  if (!l) return { data: d };
  const id = uniqueId(new Set(d.durations.map((c) => c.id)), `k${d.durations.length + 1}`);
  const a = clampT(d, t1 ?? d.end * 0.25), b = clampT(d, t2 ?? d.end * 0.5);
  return { data: { ...d, durations: [...d.durations, { id, life: l, t1: Math.min(a, b), t2: Math.max(a, b), text }] }, id };
}
export const updateConstraint = (d: D, id: string, patch: Partial<D['durations'][number]>): D => ({ ...d, durations: d.durations.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
export const removeConstraint = (d: D, id: string): D => ({ ...d, durations: d.durations.filter((c) => c.id !== id) });

export const setEnd = (d: D, end: number): D => (end > 0 ? { ...d, end: roundT(end) } : d);
export const setUnit = (d: D, unit: string): D => ({ ...d, unit: unit.trim() });

/** Tidy: drop dangling references, order and de-duplicate changes, snap times, fit the axis to the content, give each lifeline its rows. Returns a note per fix. */
export function tidyTiming(d: TimingData): { data: TimingData; fixes: string[] } {
  const fixes: string[] = [];
  const ids = new Set(d.lifelines.map((l) => l.id));
  let changes = d.changes.filter((c) => ids.has(c.life));
  let messages = d.messages.filter((m) => ids.has(m.from) && ids.has(m.to));
  let durations = d.durations.filter((c) => ids.has(c.life));
  const dropped = d.changes.length - changes.length + d.messages.length - messages.length + d.durations.length - durations.length;
  if (dropped) fixes.push(`removed ${dropped} dangling item${dropped === 1 ? '' : 's'}`);
  const maxT = Math.max(0, ...changes.map((c) => c.t), ...messages.map((m) => m.t2 ?? m.t), ...durations.map((c) => c.t2));
  const end = maxT > d.end ? roundT(Math.ceil(maxT / niceStep(maxT)) * niceStep(maxT)) : d.end;
  if (end !== d.end) fixes.push(`axis extended to ${end}`);
  const snap = (t: number) => snapT(Math.max(0, Math.min(end, t)), end);
  const seen = new Set<string>();
  const before = changes.length;
  changes = changes.map((c) => ({ ...c, t: snap(c.t) })).sort((a, b) => a.t - b.t).filter((c) => { const k = `${c.life}@${c.t}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (changes.length !== before) fixes.push('merged changes at the same time');
  messages = messages.map((m) => ({ ...m, t: snap(m.t), ...(m.t2 !== undefined ? { t2: snap(m.t2) } : {}) }));
  durations = durations.map((c) => ({ ...c, t1: snap(c.t1), t2: snap(c.t2) }));
  const lifelines = d.lifelines.map((l) => {
    if (l.kind !== 'robust' && l.kind !== 'concise') return l;
    const used = [...new Set(changes.filter((c) => c.life === l.id).map((c) => c.state))];
    const states = [...l.states.filter((s) => used.includes(s) || l.kind === 'robust'), ...used.filter((s) => !l.states.includes(s))];
    if (states.length !== l.states.length) fixes.push(`${l.name}: rows follow the states used`);
    return { ...l, states };
  });
  return { data: { ...d, lifelines, changes, messages, durations, end }, fixes };
}
