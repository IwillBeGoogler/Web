import { isFragment, isMessage, isNote, seqId, type FragmentOp, type MessageKind, type ParticipantKind, type SeqBox, type SeqFragment, type SeqItem, type SeqMessage, type SeqNote, type SeqRef, type SequenceModel } from './types';

/** All edits are pure: they return a new model (or the same object when nothing changes). */
const clone = <T,>(m: T): T => JSON.parse(JSON.stringify(m)) as T;

interface Loc { list: SeqItem[]; index: number }
function locate(items: SeqItem[], id: string): Loc | undefined {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return { list: items, index: i };
    const it = items[i];
    if (isFragment(it)) for (const s of it.sections) { const r = locate(s.items, id); if (r) return r; }
  }
  return undefined;
}
/** messages and notes in document order (a fragment is a container, not a leaf), with the list that holds each */
export function leafOrder(m: SequenceModel): { id: string; item: SeqMessage | SeqNote | SeqRef; list: SeqItem[] }[] {
  const out: { id: string; item: SeqMessage | SeqNote | SeqRef; list: SeqItem[] }[] = [];
  const visit = (items: SeqItem[]) => {
    for (const it of items) {
      if (isFragment(it)) it.sections.forEach((s) => visit(s.items));
      else out.push({ id: it.id, item: it, list: items });
    }
  };
  visit(m.items);
  return out;
}

export function moveParticipant(m: SequenceModel, id: string, toIndex: number): SequenceModel {
  const from = m.participants.findIndex((p) => p.id === id);
  if (from < 0) return m;
  const to = Math.max(0, Math.min(m.participants.length - 1, toIndex));
  if (to === from) return m;
  const participants = [...m.participants];
  const [p] = participants.splice(from, 1);
  participants.splice(to, 0, p);
  return { ...m, participants };
}

/**
 * Move a message / note / fragment so it sits just before the leaf that has index `toLeafIndex` once the item is out of the way
 * (it joins that leaf's section); an index past the last leaf appends to the top level.
 */
export function moveItem(m: SequenceModel, id: string, toLeafIndex: number): SequenceModel {
  const next = clone(m);
  const loc = locate(next.items, id);
  if (!loc) return m;
  const [item] = loc.list.splice(loc.index, 1);
  const leaves = leafOrder(next);
  const target = leaves[toLeafIndex];
  if (!target) next.items.push(item);
  else target.list.splice(target.list.indexOf(target.item), 0, item);
  return next;
}

const uniqueName = (m: SequenceModel, base: string): string => {
  const names = new Set(m.participants.map((p) => p.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
};
const KIND_NAME: Record<ParticipantKind, string> = { participant: 'Participant', actor: 'Actor', boundary: 'Boundary', control: 'Control', entity: 'Entity', database: 'Database' };

export function addParticipant(m: SequenceModel, o: { kind?: ParticipantKind; after?: string; name?: string } = {}): SequenceModel {
  const kind = o.kind ?? 'participant';
  const p = { id: seqId('p'), name: o.name ?? uniqueName(m, KIND_NAME[kind]), kind };
  const participants = [...m.participants];
  const at = o.after ? participants.findIndex((x) => x.id === o.after) : -1;
  participants.splice(at < 0 ? participants.length : at + 1, 0, p);
  return { ...m, participants };
}

export function removeParticipant(m: SequenceModel, id: string): SequenceModel {
  if (!m.participants.some((p) => p.id === id)) return m;
  const prune = (items: SeqItem[]): SeqItem[] =>
    items.flatMap((it): SeqItem[] => {
      if (isMessage(it)) return it.from === id || it.to === id ? [] : [it];
      if (isNote(it) || it.type === 'ref') { const over = it.over.filter((o) => o !== id); return over.length ? [{ ...it, over }] : []; }
      return [{ ...it, sections: it.sections.map((s) => ({ ...s, items: prune(s.items) })) }];
    });
  const out: SequenceModel = { ...m, participants: m.participants.filter((p) => p.id !== id), items: prune(m.items) };
  if (m.boxes) out.boxes = m.boxes.map((b) => ({ ...b, participants: b.participants.filter((x) => x !== id) })).filter((b) => b.participants.length);
  return out;
}

export function addMessage(m: SequenceModel, o: { after?: string; from?: string; to?: string; kind?: MessageKind; text?: string } = {}): SequenceModel {
  if (!m.participants.length) return m;
  const next = clone(m);
  const ids = next.participants.map((p) => p.id);
  const ref = o.after ? locate(next.items, o.after) : undefined;
  const prev = ref && isMessage(ref.list[ref.index]) ? (ref.list[ref.index] as SeqMessage) : undefined;
  const from = o.from ?? prev?.to ?? ids[0];
  const to = o.to ?? (ids.length > 1 ? ids[(ids.indexOf(from) + 1) % ids.length] : from);
  const msg: SeqMessage = { type: 'message', id: seqId('m'), from, to, text: o.text ?? 'message', kind: o.kind ?? 'sync' };
  if (ref) ref.list.splice(ref.index + 1, 0, msg);
  else next.items.push(msg);
  return next;
}

export function addNote(m: SequenceModel, o: { over?: string[]; after?: string; text?: string } = {}): SequenceModel {
  if (!m.participants.length) return m;
  const next = clone(m);
  const note: SeqNote = { type: 'note', id: seqId('n'), text: o.text ?? 'note', over: o.over?.length ? o.over : [next.participants[0].id] };
  const ref = o.after ? locate(next.items, o.after) : undefined;
  if (ref) ref.list.splice(ref.index + 1, 0, note);
  else next.items.push(note);
  return next;
}

export function addRef(m: SequenceModel, o: { over?: string[]; after?: string; text?: string } = {}): SequenceModel {
  if (!m.participants.length) return m;
  const next = clone(m);
  const ref: SeqRef = { type: 'ref', id: seqId('r'), text: o.text ?? 'other diagram', over: o.over?.length ? o.over : next.participants.slice(0, 2).map((p) => p.id) };
  const at = o.after ? locate(next.items, o.after) : undefined;
  if (at) at.list.splice(at.index + 1, 0, ref);
  else next.items.push(ref);
  return next;
}

/** make a message found (comes from outside, lands on `to`) or lost (leaves `from` to nowhere); undefined restores a normal message */
export function setMessageExt(m: SequenceModel, id: string, ext: 'found' | 'lost' | undefined): SequenceModel {
  const next = clone(m);
  const loc = locate(next.items, id);
  const it = loc?.list[loc.index];
  if (!it || !isMessage(it)) return m;
  if (!ext) { delete it.ext; if (it.from === it.to && next.participants.length > 1) it.to = next.participants[(next.participants.findIndex((p) => p.id === it.from) + 1) % next.participants.length].id; return next; }
  it.ext = ext;
  if (ext === 'found') it.from = it.to; else it.to = it.from;
  if (it.kind === 'create' || it.kind === 'destroy') it.kind = 'sync';
  return next;
}

/**
 * Drag one end of a message onto another lifeline. Found / lost messages keep both ends on the same lifeline.
 * Dropping an end on the other end of an ordinary message turns it into a self message.
 */
export function retargetMessage(m: SequenceModel, id: string, end: 'from' | 'to', participantId: string): SequenceModel {
  if (!m.participants.some((p) => p.id === participantId)) return m;
  const next = clone(m);
  const loc = locate(next.items, id);
  const it = loc?.list[loc.index];
  if (!it || !isMessage(it) || it[end] === participantId && !it.ext) return m;
  if (it.ext) { it.from = participantId; it.to = participantId; } else it[end] = participantId;
  return next;
}

/** group participants in a titled box; a participant belongs to one box only */
export function addBox(m: SequenceModel, participantIds: string[], label = 'Group', color?: string): SequenceModel {
  const ids = participantIds.filter((id) => m.participants.some((p) => p.id === id));
  if (!ids.length) return m;
  const boxes: SeqBox[] = (m.boxes ?? []).map((b) => ({ ...b, participants: b.participants.filter((x) => !ids.includes(x)) })).filter((b) => b.participants.length);
  boxes.push({ id: seqId('b'), label, ...(color ? { color } : {}), participants: ids });
  return { ...m, boxes };
}
export function updateBox(m: SequenceModel, id: string, patch: { label?: string; color?: string }): SequenceModel {
  if (!m.boxes?.some((b) => b.id === id)) return m;
  return { ...m, boxes: m.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}
export function removeBox(m: SequenceModel, id: string): SequenceModel {
  if (!m.boxes?.some((b) => b.id === id)) return m;
  return { ...m, boxes: m.boxes.filter((b) => b.id !== id) };
}

/** wrap the given sibling items in a new fragment (an empty one is appended when none are given) */
export function addFragment(m: SequenceModel, op: FragmentOp, wrapIds: string[] = []): SequenceModel {
  const next = clone(m);
  const frag: SeqFragment = { type: 'fragment', id: seqId('f'), op, sections: [{ id: seqId('s'), guard: op === 'alt' || op === 'opt' || op === 'break' ? 'condition' : op === 'group' ? 'label' : op === 'rect' ? 'rgb(220,232,252)' : op === 'loop' ? 'while condition' : '', items: [] }] };
  const first = wrapIds.length ? locate(next.items, wrapIds[0]) : undefined;
  if (!first) { next.items.push(frag); return next; }
  const wrap = first.list.filter((i) => wrapIds.includes(i.id));
  frag.sections[0].items = wrap;
  const at = first.list.indexOf(wrap[0]);
  first.list.splice(at, wrap.length, frag);
  return next;
}
export function addSection(m: SequenceModel, fragmentId: string, guard = 'else'): SequenceModel {
  const next = clone(m);
  const loc = locate(next.items, fragmentId);
  const f = loc?.list[loc.index];
  if (!f || !isFragment(f)) return m;
  f.sections.push({ id: seqId('s'), guard, items: [] });
  return next;
}

export function updateItem(m: SequenceModel, id: string, patch: Record<string, unknown>): SequenceModel {
  const next = clone(m);
  const loc = locate(next.items, id);
  if (!loc) return m;
  Object.assign(loc.list[loc.index], patch);
  return next;
}
export function updateSection(m: SequenceModel, sectionId: string, patch: { guard?: string }): SequenceModel {
  const next = clone(m);
  let hit = false;
  const visit = (items: SeqItem[]) => { for (const it of items) if (isFragment(it)) for (const s of it.sections) { if (s.id === sectionId) { Object.assign(s, patch); hit = true; } visit(s.items); } };
  visit(next.items);
  return hit ? next : m;
}
export function updateParticipant(m: SequenceModel, id: string, patch: { name?: string; kind?: ParticipantKind }): SequenceModel {
  if (!m.participants.some((p) => p.id === id)) return m;
  return { ...m, participants: m.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}
export function removeItem(m: SequenceModel, id: string): SequenceModel {
  const next = clone(m);
  const loc = locate(next.items, id);
  if (!loc) return m;
  loc.list.splice(loc.index, 1);
  return next;
}
export const setNumbering = (m: SequenceModel, on: boolean): SequenceModel => (m.autonumber === on ? m : { ...m, autonumber: on });

/** Tab / Shift+Tab between participants: the id to move to, or undefined at the end (Tab on the last one adds a participant) */
export function nextParticipant(m: SequenceModel, id: string, dir: 1 | -1): string | undefined {
  const i = m.participants.findIndex((p) => p.id === id);
  return i < 0 ? undefined : m.participants[i + dir]?.id;
}
export function findItem(m: SequenceModel, id: string): SeqItem | undefined {
  const l = locate(m.items, id);
  return l?.list[l.index];
}
