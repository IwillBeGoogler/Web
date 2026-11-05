import { LIFELINE_KINDS } from './types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Structural check of a `timing` node's data (mirrors the server schema). Returns the first problem, or undefined. */
export function validateTiming(raw: unknown): string | undefined {
  const d = raw as Record<string, unknown>;
  for (const k of ['lifelines', 'changes', 'messages', 'durations']) if (!Array.isArray(d[k])) return `${k} must be an array`;
  if (!isNum(d.end) || d.end <= 0) return 'end must be a positive number';
  if (typeof d.unit !== 'string') return 'unit must be a string';
  const life = new Set<string>();
  for (const [i, l] of (d.lifelines as Record<string, unknown>[]).entries()) {
    if (!l || typeof l.id !== 'string' || !l.id || typeof l.name !== 'string') return `lifelines[${i}] needs id and name`;
    if (!LIFELINE_KINDS.includes(l.kind as never)) return `lifelines[${i}].kind must be ${LIFELINE_KINDS.join('|')}`;
    if (!Array.isArray(l.states) || l.states.some((s) => typeof s !== 'string')) return `lifelines[${i}].states must be an array of strings`;
    if (l.period !== undefined && (!isNum(l.period) || l.period <= 0)) return `lifelines[${i}].period must be a positive number`;
    if (life.has(l.id)) return `duplicate lifeline id "${l.id}"`;
    life.add(l.id);
  }
  const ids = new Set<string>();
  const uniq = (id: unknown, where: string): string | undefined => {
    if (typeof id !== 'string' || !id) return `${where} needs an id`;
    if (ids.has(id)) return `duplicate id "${id}"`;
    ids.add(id);
    return undefined;
  };
  for (const [i, c] of (d.changes as Record<string, unknown>[]).entries()) {
    const e = uniq(c?.id, `changes[${i}]`);
    if (e) return e;
    if (typeof c.life !== 'string' || !life.has(c.life) || !isNum(c.t) || typeof c.state !== 'string') return `changes[${i}] needs a known life, a numeric t and a state`;
  }
  for (const [i, m] of (d.messages as Record<string, unknown>[]).entries()) {
    const e = uniq(m?.id, `messages[${i}]`);
    if (e) return e;
    if (typeof m.from !== 'string' || !life.has(m.from) || typeof m.to !== 'string' || !life.has(m.to) || !isNum(m.t) || typeof m.text !== 'string') return `messages[${i}] needs known from / to lifelines, a numeric t and a text`;
    if (m.t2 !== undefined && !isNum(m.t2)) return `messages[${i}].t2 must be a number`;
  }
  for (const [i, c] of (d.durations as Record<string, unknown>[]).entries()) {
    const e = uniq(c?.id, `durations[${i}]`);
    if (e) return e;
    if (typeof c.life !== 'string' || !life.has(c.life) || !isNum(c.t1) || !isNum(c.t2) || typeof c.text !== 'string') return `durations[${i}] needs a known life, numeric t1 / t2 and a text`;
  }
  return undefined;
}
