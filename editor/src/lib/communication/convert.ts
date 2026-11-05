import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { isObjectNode, objectModelToDiagram } from '../object/convert';
import type { ObjectModel } from '../object/types';
import { sequenceNode, sequenceOf } from '../seq/node';
import { allMessages, isFragment, isNote, isRef, walk, type SeqItem, type SeqMessage, type SequenceModel } from '../seq/types';
import { collect } from './messages';

export interface Conversion { diagram: Diagram; /** what could not be carried over */ lossy: string[] }

/** Sequence frame -> communication diagram: lifelines become objects, every message a numbered message on the link between its two objects. */
export function sequenceToCommunication(seq: DiagramNode, origin = { x: 0, y: 0 }): Conversion {
  const d = sequenceOf(seq);
  const lossy: string[] = [];
  const msgs = allMessages(d.items);
  let fragments = 0, notes = 0, refs = 0;
  walk(d.items, (i: SeqItem) => { if (isFragment(i)) fragments++; else if (isNote(i)) notes++; else if (isRef(i)) refs++; });
  const links: ObjectModel['links'] = [];
  const linkOf = new Map<string, ObjectModel['links'][number]>();
  let n = 0;
  const kinds = { return: 0, create: 0, destroy: 0, ext: 0 };
  for (const m of msgs) {
    const key = [m.from, m.to].sort().join('|');
    let l = linkOf.get(key);
    if (!l) { l = { from: m.from, to: m.to, messages: [] }; linkOf.set(key, l); links.push(l); }
    if (m.kind === 'return' || m.kind === 'create' || m.kind === 'destroy') kinds[m.kind]++;
    if (m.ext) kinds.ext++;
    l.messages!.push({ id: `m${++n}`, seq: String(n), text: m.text, dir: m.from === l.from ? 'fwd' : 'back', ...(m.kind === 'async' || m.kind === 'return' ? { async: true } : {}) });
  }
  const model: ObjectModel = { objects: d.participants.map((p) => ({ id: p.id, name: p.name, slots: [] })), links };
  const diagram = objectModelToDiagram(model, origin);
  if (fragments) lossy.push(`${fragments} fragment${fragments === 1 ? '' : 's'} (alt, loop ...) flattened: their messages are numbered in order, guards are lost`);
  if (notes) lossy.push(`${notes} note${notes === 1 ? '' : 's'} dropped`);
  if (refs) lossy.push(`${refs} interaction use${refs === 1 ? '' : 's'} (ref) dropped`);
  if (kinds.return) lossy.push(`${kinds.return} return message${kinds.return === 1 ? '' : 's'} became asynchronous numbered messages`);
  if (kinds.create || kinds.destroy) lossy.push('create / destroy markers lost (objects exist for the whole diagram)');
  if (kinds.ext) lossy.push(`${kinds.ext} found / lost message${kinds.ext === 1 ? '' : 's'} became self messages`);
  if (msgs.some((m) => m.activate || m.deactivate)) lossy.push('activation bars lost');
  if (d.participants.some((p) => p.kind !== 'participant')) lossy.push('actor / boundary / control / entity / database icons lost');
  return { diagram, lossy };
}

/** Communication diagram -> sequence frame: objects become lifelines (left to right by first message), messages follow the numbering order. */
export function communicationToSequence(nodes: DiagramNode[], edges: DiagramEdge[], label = 'Sequence', origin = { x: 0, y: 0 }): Conversion & { node: DiagramNode } {
  const objs = nodes.filter(isObjectNode);
  const placed = collect(edges.filter((e) => objs.some((o) => o.id === e.source) && objs.some((o) => o.id === e.target)));
  const lossy: string[] = [];
  const order: string[] = [];
  const edgeOf = new Map(edges.map((e) => [e.id, e]));
  for (const p of placed) { const e = edgeOf.get(p.edgeId)!; for (const id of [e.source, e.target]) if (!order.includes(id)) order.push(id); }
  for (const o of [...objs].sort((a, b) => a.position.x - b.position.x)) if (!order.includes(o.id) && !placed.length) order.push(o.id);
  const byId = new Map(objs.map((o) => [o.id, o]));
  const model: SequenceModel = {
    autonumber: false,
    participants: order.map((id) => ({ id, name: String(byId.get(id)!.data.label || id), kind: 'participant' as const })),
    items: placed.map((p, i): SeqMessage => {
      const e = edgeOf.get(p.edgeId)!;
      const [from, to] = p.m.dir === 'fwd' ? [e.source, e.target] : [e.target, e.source];
      return { type: 'message', id: `m${i + 1}`, from, to, text: p.m.text, kind: p.m.async ? 'async' : 'sync' };
    }),
  };
  const nested = placed.filter((p) => p.m.seq.includes('.')).length;
  if (nested) lossy.push(`${nested} nested number${nested === 1 ? '' : 's'} (1.1, 2.3 ...) flattened to the order of the messages`);
  if (objs.some((o) => (o.data.slots as unknown[] | undefined)?.length)) lossy.push('object slots dropped');
  if (objs.some((o) => o.data.className)) lossy.push('object classes dropped (lifelines carry the instance name)');
  const plain = edges.filter((e) => e.data?.uml?.kind === 'link' && !(e.data.uml.messages?.length)).length;
  if (plain) lossy.push(`${plain} link${plain === 1 ? '' : 's'} without messages dropped`);
  if (edges.some((e) => e.data?.uml?.sourceRole || e.data?.uml?.targetRole)) lossy.push('link roles dropped');
  const node = sequenceNode('seqc', origin, model, label);
  return { diagram: { version: 1, nodes: [node], edges: [] }, node, lossy };
}
