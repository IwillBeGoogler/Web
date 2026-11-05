/** UML sequence diagram model. A `sequence` node stores a SequenceData in `node.data`; the layout engine owns every coordinate. */
export type ParticipantKind = 'participant' | 'actor' | 'boundary' | 'control' | 'entity' | 'database';
export const PARTICIPANT_KINDS: ParticipantKind[] = ['participant', 'actor', 'boundary', 'control', 'entity', 'database'];

export interface SeqParticipant {
  id: string;
  name: string;
  kind: ParticipantKind;
  /** shared class model this lifeline is linked to (its `name` follows the class name) */
  modelId?: string;
}

/**
 * sync: solid line, filled arrowhead (a call, opens an activation on the target)
 * async: solid line, open arrowhead
 * return: dashed line, open arrowhead (closes the caller's activation)
 * create: dashed line, open arrowhead into a new participant box (the lifeline starts there)
 * destroy: solid line ending in a cross on the target lifeline (the lifeline ends there)
 */
export type MessageKind = 'sync' | 'async' | 'return' | 'create' | 'destroy';
export const MESSAGE_KINDS: MessageKind[] = ['sync', 'async', 'return', 'create', 'destroy'];

export interface SeqMessage {
  type: 'message';
  id: string;
  from: string;
  to: string;
  text: string;
  kind: MessageKind;
  /** open an activation on the target even though the message is not a sync call */
  activate?: boolean;
  /** close the sender's innermost activation after this message */
  deactivate?: boolean;
  /** found: arrives from outside the diagram (filled dot, `from` equals `to`); lost: leaves to nowhere (dot at the end) */
  ext?: 'found' | 'lost';
}
export interface SeqNote {
  type: 'note';
  id: string;
  text: string;
  /** 1 or 2 participant ids */
  over: string[];
  side?: 'over' | 'left' | 'right';
}
/** `group` is a PlantUML-style titled frame; `rect` is a plain coloured background block (the colour is the guard text, e.g. `rgb(200,220,255)`) */
export type FragmentOp = 'alt' | 'opt' | 'loop' | 'par' | 'break' | 'critical' | 'group' | 'rect';
export const FRAGMENT_OPS: FragmentOp[] = ['alt', 'opt', 'loop', 'par', 'break', 'critical', 'group', 'rect'];
/** the keyword that starts the 2nd, 3rd ... section of a fragment */
export const SECTION_KEYWORD: Record<FragmentOp, string> = { alt: 'else', opt: 'else', loop: 'else', par: 'and', break: 'else', critical: 'option', group: 'else', rect: 'else' };

/** interaction use: a frame over 1..n participants that points at another diagram */
export interface SeqRef {
  type: 'ref';
  id: string;
  text: string;
  over: string[];
}
export interface SeqSection {
  id: string;
  /** guard / condition shown in [brackets] */
  guard: string;
  items: SeqItem[];
}
export interface SeqFragment {
  type: 'fragment';
  id: string;
  op: FragmentOp;
  /** the first section is the fragment body, later ones are else / and / option */
  sections: SeqSection[];
}
export type SeqItem = SeqMessage | SeqNote | SeqRef | SeqFragment;

/** a titled group drawn around the header boxes of consecutive participants (Mermaid `box`, PlantUML `box`) */
export interface SeqBox {
  id: string;
  label: string;
  /** any CSS colour, optional */
  color?: string;
  participants: string[];
}

export interface SequenceModel {
  participants: SeqParticipant[];
  items: SeqItem[];
  autonumber: boolean;
  boxes?: SeqBox[];
}
/** What a `sequence` node stores in `node.data` (`label` is the diagram title). */
export interface SequenceData extends SequenceModel {
  label: string;
  accent: string;
}
export interface SeqParseResult {
  model: SequenceModel;
  warnings: string[];
}
export const emptySequence = (): SequenceModel => ({ participants: [], items: [], autonumber: false });

let counter = 0;
/** ids only have to be unique inside one diagram */
export const seqId = (prefix: string): string => `${prefix}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** sequential ids for parsers (deterministic, so tests can compare round trips) */
export function idMaker(): (prefix: string) => string {
  const n: Record<string, number> = {};
  return (p) => `${p}${(n[p] = (n[p] ?? 0) + 1)}`;
}

export const isMessage = (i: SeqItem): i is SeqMessage => i.type === 'message';
export const isNote = (i: SeqItem): i is SeqNote => i.type === 'note';
export const isRef = (i: SeqItem): i is SeqRef => i.type === 'ref';
export const isFragment = (i: SeqItem): i is SeqFragment => i.type === 'fragment';

/** every message / note / fragment in document order (depth first, a fragment before its content) */
export function walk(items: SeqItem[], fn: (i: SeqItem, depth: number) => void, depth = 0): void {
  for (const i of items) {
    fn(i, depth);
    if (i.type === 'fragment') for (const s of i.sections) walk(s.items, fn, depth + 1);
  }
}
export const allMessages = (items: SeqItem[]): SeqMessage[] => {
  const out: SeqMessage[] = [];
  walk(items, (i) => i.type === 'message' && out.push(i));
  return out;
};
