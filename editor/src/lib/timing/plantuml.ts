import { niceStep } from './layout';
import { roundT, timingIds, BINARY_STATES, emptyTiming, type LifelineKind, type TimingModel } from './types';

const q = (s: string) => s.replace(/"/g, "'").replace(/\n/g, ' ');
const num = (t: number) => String(roundT(t));
const alias = (name: string, used: Set<string>): string => {
  const base = name.replace(/[^A-Za-z0-9_]/g, '') || 'L';
  let a = /^\d/.test(base) ? `L${base}` : base, k = 1;
  while (used.has(a)) a = `${base}${++k}`;
  used.add(a);
  return a;
};

/** timing diagram as PlantUML: `robust "Name" as A`, `clock "C" as C with period 50`, then `@t` blocks with `A is State`, messages and `{duration}` durations */
export function renderTimingPlantuml(m: TimingModel): string {
  const used = new Set<string>();
  const al = new Map(m.lifelines.map((l) => [l.id, alias(l.name, used)]));
  const lines = ['@startuml'];
  for (const l of m.lifelines) {
    lines.push(`${l.kind} "${q(l.name)}" as ${al.get(l.id)}${l.kind === 'clock' ? ` with period ${num(l.period ?? 1)}` : ''}`);
    if (l.kind === 'robust' && l.states.length) lines.push(`${al.get(l.id)} has ${l.states.map(q).join(',')}`);
  }
  const times = [...new Set([...m.changes.map((c) => c.t), ...m.messages.map((x) => x.t)])].sort((a, b) => a - b);
  for (const t of times) {
    lines.push('', `@${num(t)}`);
    for (const c of m.changes.filter((x) => x.t === t)) if (al.has(c.life)) lines.push(`${al.get(c.life)} is ${/\s/.test(c.state) ? `"${q(c.state)}"` : c.state}`);
    for (const x of m.messages.filter((y) => y.t === t)) if (al.has(x.from) && al.has(x.to)) lines.push(`${al.get(x.from)} -> ${al.get(x.to)}${x.t2 !== undefined && x.t2 !== x.t ? `@${num(x.t2)}` : ''}${x.text ? ` : ${q(x.text)}` : ''}`);
  }
  if (m.durations.length) lines.push('');
  for (const c of m.durations) if (al.has(c.life)) lines.push(`${al.get(c.life)}@${num(c.t1)} <-> @${num(c.t2)}${c.text ? ` : ${/^\{.*\}$/.test(c.text) ? q(c.text) : `{${q(c.text)}}`}` : ''}`);
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

/** a lifeline declaration (`robust` / `concise` / `clock` / `binary`) and nothing that belongs to other diagram kinds */
export const looksLikeTimingPlantuml = (text: string): boolean => /@startuml/i.test(text) && /^\s*(robust|concise|clock|binary)\s+("|\w)/im.test(text) && !/^\s*(class|interface|enum|abstract|participant|actor|usecase|state|node|device|component|object)\b/im.test(text);

const DECL = /^(robust|concise|clock|binary)\s+(?:"([^"]+)"|(\w+))(?:\s+as\s+(\w+))?(?:\s+with\s+(.*))?$/i;
const IS = /^(\w+)\s+is\s+(.+)$/i;
const HAS = /^(\w+)\s+has\s+(.+)$/i;
const MSG = /^(\w+)(?:@(\S+))?\s*-+>\s*(\w+)(?:@(\S+))?\s*(?::\s*(.*))?$/;
const CON = /^(\w+)@(\S+)\s*<->\s*@(\S+)\s*(?::\s*(.*))?$/;

/** Parse the timing subset of PlantUML: lifeline declarations, `@t` / `@+dt` time marks, `X is State`, messages between lifelines and `{n ms}` duration durations. Anything else is skipped with a warning. */
export function parseTimingPlantuml(text: string): { model: TimingModel; warnings: string[] } {
  const model = emptyTiming();
  const warnings: string[] = [];
  const id = timingIds();
  const byKey = new Map<string, string>();
  let now = 0;
  let maxT = 0;
  const time = (raw: string): number | undefined => {
    const rel = /^\+(-?[\d.]+)$/.exec(raw);
    const v = rel ? now + Number(rel[1]) : Number(raw);
    return Number.isFinite(v) ? roundT(v) : undefined;
  };
  const unq = (s: string) => s.trim().replace(/^"|"$/g, '');
  const look = (k: string) => byKey.get(k);
  for (const l0 of text.replace(/\/'[\s\S]*?'\//g, '').split(/\r?\n/)) {
    const line = l0.trim();
    if (!line || line.startsWith("'") || /^@(start|end)uml/i.test(line)) continue;
    if (/^(skinparam|title|header|footer|hide|show|scale|legend|end legend|caption|!|note|left to right|top to bottom)/i.test(line)) continue;
    let m = DECL.exec(line);
    if (m) {
      const kind = m[1].toLowerCase() as LifelineKind;
      const name = m[2] ?? m[3];
      const lid = id('l');
      const period = m[5] ? Number(/period\s+([\d.]+)/i.exec(m[5])?.[1]) : NaN;
      model.lifelines.push({ id: lid, name, kind, states: kind === 'binary' ? [...BINARY_STATES] : [], ...(kind === 'clock' && period > 0 ? { period } : {}) });
      byKey.set(m[4] ?? name, lid);
      byKey.set(name, lid);
      continue;
    }
    m = /^@(\S+)$/.exec(line);
    if (m) {
      const t = time(m[1]);
      if (t === undefined) warnings.push(`Skipped time mark: ${line}`);
      else { now = t; maxT = Math.max(maxT, t); }
      continue;
    }
    m = HAS.exec(line);
    if (m && look(m[1])) {
      const l = model.lifelines.find((x) => x.id === look(m![1]));
      if (l && l.kind !== 'binary') for (const s of m[2].split(',').map(unq).filter(Boolean)) if (!l.states.includes(s)) l.states.push(s);
      continue;
    }
    m = IS.exec(line);
    if (m && look(m[1])) {
      const l = model.lifelines.find((x) => x.id === look(m![1]))!;
      let state = unq(m[2].replace(/\s*:.*$/, ''));
      if (l.kind === 'binary') state = /^(1|high|true)$/i.test(state) ? 'high' : 'low';
      if (l.kind !== 'binary' && !l.states.includes(state)) l.states.push(state);
      const same = model.changes.find((c) => c.life === l.id && c.t === now);
      if (same) same.state = state; else model.changes.push({ id: id('c'), life: l.id, t: now, state });
      continue;
    }
    m = CON.exec(line);
    if (m && look(m[1])) {
      const t1 = time(m[2]), t2 = time(m[3]);
      if (t1 === undefined || t2 === undefined) { warnings.push(`Skipped: ${line}`); continue; }
      maxT = Math.max(maxT, t1, t2);
      model.durations.push({ id: id('k'), life: look(m[1])!, t1: Math.min(t1, t2), t2: Math.max(t1, t2), text: (m[4] ?? '').trim() });
      continue;
    }
    m = MSG.exec(line);
    if (m && look(m[1]) && look(m[3])) {
      const t = m[2] ? time(m[2]) : now;
      const t2 = m[4] ? time(m[4]) : undefined;
      if (t === undefined) { warnings.push(`Skipped: ${line}`); continue; }
      maxT = Math.max(maxT, t, t2 ?? 0);
      model.messages.push({ id: id('m'), from: look(m[1])!, to: look(m[3])!, t, ...(t2 !== undefined && t2 !== t ? { t2 } : {}), text: (m[5] ?? '').trim() });
      continue;
    }
    warnings.push(`Skipped: ${line}`);
  }
  for (const c of model.changes) maxT = Math.max(maxT, c.t);
  model.end = maxT > 0 ? roundT(Math.ceil((maxT * 1.2) / niceStep(maxT)) * niceStep(maxT)) : 100;
  return { model, warnings };
}
