import { FRAGMENT_OPS, MESSAGE_KINDS, PARTICIPANT_KINDS } from './types';

/** Structural check of a `sequence` node's data (mirrors the server schema). Returns the first problem, or undefined. */
export function validateSequence(raw: unknown): string | undefined {
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.participants)) return 'participants must be an array';
  if (!Array.isArray(d.items)) return 'items must be an array';
  if (d.autonumber !== undefined && typeof d.autonumber !== 'boolean') return 'autonumber must be boolean';
  const people = new Set<string>();
  for (const [i, p] of (d.participants as Record<string, unknown>[]).entries()) {
    if (!p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string') return `participants[${i}] needs id and name`;
    if (!PARTICIPANT_KINDS.includes(p.kind as never)) return `participants[${i}].kind must be ${PARTICIPANT_KINDS.join('|')}`;
    if (p.modelId !== undefined && typeof p.modelId !== 'string') return `participants[${i}].modelId must be a string`;
    if (people.has(p.id)) return `duplicate participant id "${p.id}"`;
    people.add(p.id);
  }
  if (d.boxes !== undefined) {
    if (!Array.isArray(d.boxes)) return 'boxes must be an array';
    for (const [i, b] of (d.boxes as Record<string, unknown>[]).entries()) {
      if (!b || typeof b.id !== 'string' || typeof b.label !== 'string' || !Array.isArray(b.participants) || b.participants.some((x) => !people.has(x as string))) return `boxes[${i}] needs id, label and known participants`;
    }
  }
  const ids = new Set<string>();
  const walk = (items: unknown[], path: string): string | undefined => {
    for (const [i, raw2] of items.entries()) {
      const it = raw2 as Record<string, unknown>;
      const here = `${path}[${i}]`;
      if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !it.id) return `${here} needs an id`;
      if (ids.has(it.id)) return `duplicate item id "${it.id}"`;
      ids.add(it.id);
      if (it.type === 'message') {
        if (typeof it.from !== 'string' || !people.has(it.from) || typeof it.to !== 'string' || !people.has(it.to)) return `${here} refers to an unknown participant`;
        if (typeof it.text !== 'string') return `${here}.text must be a string`;
        if (!MESSAGE_KINDS.includes(it.kind as never)) return `${here}.kind must be ${MESSAGE_KINDS.join('|')}`;
      } else if (it.type === 'note') {
        if (typeof it.text !== 'string') return `${here}.text must be a string`;
        const over = it.over;
        if (!Array.isArray(over) || over.length < 1 || over.length > 2 || over.some((o) => !people.has(o as string))) return `${here}.over must hold 1 or 2 known participants`;
        if (it.ext !== undefined && it.ext !== 'found' && it.ext !== 'lost') return `${here}.ext must be found|lost`;
      } else if (it.type === 'ref') {
        if (typeof it.text !== 'string') return `${here}.text must be a string`;
        const over = it.over;
        if (!Array.isArray(over) || over.length < 1 || over.some((o) => !people.has(o as string))) return `${here}.over must hold known participants`;
      } else if (it.type === 'fragment') {
        if (!FRAGMENT_OPS.includes(it.op as never)) return `${here}.op must be ${FRAGMENT_OPS.join('|')}`;
        if (!Array.isArray(it.sections)) return `${here}.sections must be an array`;
        for (const [k, s] of (it.sections as Record<string, unknown>[]).entries()) {
          if (!s || typeof s.guard !== 'string' || !Array.isArray(s.items)) return `${here}.sections[${k}] needs a guard string and items`;
          const r = walk(s.items, `${here}.sections[${k}].items`);
          if (r) return r;
        }
      } else return `${here}.type must be message|note|ref|fragment`;
    }
    return undefined;
  };
  return walk(d.items as unknown[], 'items');
}
