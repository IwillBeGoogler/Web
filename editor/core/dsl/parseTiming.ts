/** Line parser of the `timing id "Title" { }` block of the `.sdd` text. */
import { tokenize } from './lex';
import type { Diagnostic, DslTiming, DslTmLife, TimingKindText } from './types';

type Diag = (l: number, c: number, m: string, s?: Diagnostic['severity']) => void;
const KINDS = new Set<string>(['robust', 'concise', 'binary', 'clock']);
export const BINARY_LEVELS = ['high', 'low'];
const num = (s: string): number | undefined => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : undefined);
const round = (t: number): number => Math.round(t * 1000) / 1000;

/** `{ }` of a timing block. Returns true when the block closed. */
export function parseTimingLine(tm: DslTiming, src: string, ln: number, diag: Diag): boolean {
  const s = src.trim();
  if (s === '}') return true;
  const lex = tokenize(s);
  if (lex.error) { diag(ln, lex.error.col, lex.error.message); return false; }
  const toks = lex.toks;
  if (!toks.length) return false;
  const first = toks[0];
  const kw = first.k === 'word' ? first.v : '';
  const life = (id: string): DslTmLife | undefined => tm.lifelines.find((l) => l.id === id);

  if (kw === 'unit' && toks[1] && toks[1].k !== 'sym') { tm.unit = toks[1].v; return false; }
  if (kw === 'end' && toks[1]) {
    const v = num(toks[1].v);
    if (v === undefined || v <= 0) diag(ln, toks[1].col, 'end is a positive number, e.g. end 400');
    else tm.end = v;
    return false;
  }
  if (KINDS.has(kw)) {
    const idTok = toks[1];
    if (!idTok || idTok.k === 'sym') { diag(ln, first.col, `${kw} needs an id, e.g. ${kw} web "Web"`); return false; }
    let i = 2;
    const name = toks[i]?.k === 'str' ? toks[i++].v : idTok.v;
    const states: string[] = [];
    let period: number | undefined;
    while (i < toks.length) {
      const t = toks[i];
      if (t.k === 'word' && t.v === 'states') {
        i++;
        while (i < toks.length && !(toks[i].k === 'word' && toks[i + 1]?.v === '=')) {
          if (toks[i].k !== 'sym') states.push(toks[i].v);
          i++;
        }
        continue;
      }
      if (t.k === 'word' && t.v === 'period' && toks[i + 1]?.v === '=' && toks[i + 2]) {
        const v = num(toks[i + 2].v);
        if (v === undefined || v <= 0) diag(ln, t.col, 'period is a positive number');
        else period = v;
        i += 3;
        continue;
      }
      diag(ln, t.col, `unexpected "${t.v}" in the ${kw} declaration`);
      i++;
    }
    if (life(idTok.v)) { diag(ln, idTok.col, `duplicate lifeline "${idTok.v}"`); return false; }
    if (period !== undefined && kw !== 'clock') diag(ln, 1, 'period belongs to a clock', 'warning');
    if (states.length && (kw === 'binary' || kw === 'clock')) diag(ln, 1, `a ${kw} lifeline has no state list`, 'warning');
    tm.lifelines.push({ id: idTok.v, name, kind: kw as TimingKindText, states: kw === 'binary' ? [...BINARY_LEVELS] : kw === 'clock' ? [] : states, ...(kw === 'clock' && period ? { period } : {}) });
    return false;
  }
  // lifeline @t State
  if (toks.length >= 3 && toks[1].k === 'word' && toks[1].v.startsWith('@')) {
    const t = num(toks[1].v.slice(1));
    const l = life(first.v);
    if (!l) diag(ln, first.col, `unknown lifeline "${first.v}"`);
    else if (t === undefined || t < 0) diag(ln, toks[1].col, 'expected a time like @100');
    else if (l.kind === 'clock') diag(ln, first.col, 'a clock has no state changes');
    else {
      let state = toks[2].v;
      if (l.kind === 'binary') { if (!BINARY_LEVELS.includes(state)) { diag(ln, toks[2].col, 'a binary lifeline is high or low', 'warning'); state = 'low'; } }
      else if (!l.states.includes(state)) l.states.push(state);
      const same = tm.changes.find((c) => c.life === l.id && c.t === t);
      if (same) same.state = state; else tm.changes.push({ life: l.id, t: round(t), state, line: ln });
    }
    return false;
  }
  // a -> b @t[..t2] "text"
  if (toks.length >= 4 && toks[1].v === '->' && toks[1].k === 'word') {
    const a = life(first.v), b = life(toks[2].v);
    const m = /^@(-?\d+(?:\.\d+)?)(?:\.\.(-?\d+(?:\.\d+)?))?$/.exec(toks[3].v);
    if (!a) diag(ln, first.col, `unknown lifeline "${first.v}"`);
    else if (!b) diag(ln, toks[2].col, `unknown lifeline "${toks[2].v}"`);
    else if (!m) diag(ln, toks[3].col, 'expected a time like @100 or @100..150');
    else {
      const t = round(Number(m[1])), t2 = m[2] !== undefined ? round(Number(m[2])) : undefined;
      tm.messages.push({ from: a.id, to: b.id, t, ...(t2 !== undefined && t2 !== t ? { t2 } : {}), text: toks[4]?.k === 'str' ? toks[4].v : '', line: ln });
    }
    return false;
  }
  // life t1..t2 "text"
  if (toks.length >= 2 && toks[1].k === 'word' && /^-?\d+(?:\.\d+)?\.\.-?\d+(?:\.\d+)?$/.test(toks[1].v)) {
    const l = life(first.v);
    const [a, b] = toks[1].v.split('..').map(Number);
    if (!l) diag(ln, first.col, `unknown lifeline "${first.v}"`);
    else tm.constraints.push({ life: l.id, t1: round(Math.min(a, b)), t2: round(Math.max(a, b)), text: toks[2]?.k === 'str' ? toks[2].v : '', line: ln });
    return false;
  }
  diag(ln, first.col, `unknown statement "${first.v}" in timing (expected unit, end, robust, concise, binary, clock, a state change like wb @100 Busy, a message like a -> b @100 "text" or a constraint like wb 100..250 "{150 ms}")`);
  return false;
}
