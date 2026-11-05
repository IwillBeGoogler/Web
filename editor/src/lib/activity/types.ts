/** UML activity diagram. `activity` nodes + `group` nodes (variant 'lane') + control flows (`edge.data.uml.kind === 'transition'`, label = `[guard]`). */
export type ActivityKind = 'initial' | 'final' | 'flowFinal' | 'action' | 'decision' | 'fork' | 'object' | 'send' | 'accept' | 'note';
export const ACTIVITY_KINDS: ActivityKind[] = ['initial', 'final', 'flowFinal', 'action', 'decision', 'fork', 'object', 'send', 'accept', 'note'];
export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  initial: 'Initial node', final: 'Activity final', flowFinal: 'Flow final', action: 'Action', decision: 'Decision / merge',
  fork: 'Fork / join bar', object: 'Object node', send: 'Send signal', accept: 'Accept event', note: 'Note',
};
export const ACTIVITY_DEFAULT_NAME: Record<ActivityKind, string> = {
  initial: '', final: '', flowFinal: '', action: 'Action', decision: '', fork: '', object: 'Object', send: 'Send signal', accept: 'Accept event', note: 'Note',
};
/** nodes that carry no text of their own (pseudo nodes) */
export const isPseudo = (k: ActivityKind): boolean => k === 'initial' || k === 'final' || k === 'flowFinal' || k === 'fork';

export type LaneOrient = 'v' | 'h';
export const ACTIVITY_ACCENT = '#d9822b';

/** What an `activity` node stores in `node.data`. */
export interface ActivityData {
  label: string;
  actKind: ActivityKind;
  accent: string;
  /** fork / join bars: draw vertically (left to right flow) */
  vertical?: boolean;
  /** object nodes: the state in brackets under the name */
  objectState?: string;
}

export interface ActNode { id: string; name: string; kind: ActivityKind; lane?: string; vertical?: boolean; state?: string }
export interface ActLane { id: string; name: string }
/** `note` flows attach a note node to the node it comments on (dashed, no arrow) */
export interface ActFlow { from: string; to: string; guard?: string; note?: boolean }
export interface ActivityModel {
  nodes: ActNode[];
  lanes: ActLane[];
  flows: ActFlow[];
  /** `v`: lanes are columns and the flow runs top down; `h`: lanes are rows and the flow runs left to right */
  orientation?: LaneOrient;
}
export const emptyActivityModel = (): ActivityModel => ({ nodes: [], lanes: [], flows: [] });
