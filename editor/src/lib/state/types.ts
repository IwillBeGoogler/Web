/** UML state machine model. `state` nodes + `group` nodes (variant 'composite') + transition edges (`edge.data.uml.kind === 'transition'`). */
export type StateKind = 'state' | 'initial' | 'final' | 'choice' | 'fork' | 'join' | 'history' | 'deepHistory' | 'entryPoint' | 'exitPoint';
export const STATE_KINDS: StateKind[] = ['state', 'initial', 'final', 'choice', 'fork', 'join', 'history', 'deepHistory', 'entryPoint', 'exitPoint'];
export const stateKindLabel = (k: StateKind): string =>
  k === 'deepHistory' ? 'Deep history (H*)' : k === 'history' ? 'History (H)' : k === 'entryPoint' ? 'Entry point' : k === 'exitPoint' ? 'Exit point' : k[0].toUpperCase() + k.slice(1);
/** entry / exit points sit on the border of their composite instead of inside a region */
export const isBorderPoint = (k: StateKind): boolean => k === 'entryPoint' || k === 'exitPoint';

/** What a `state` node stores in `node.data` (`label` is the state name; pseudo-states have none). */
export interface StateNodeData {
  label: string;
  stateKind: StateKind;
  /** internal activities, one per line: `entry / start timer` */
  activity?: string;
  /** index of the concurrent region of the enclosing composite this state lives in */
  region?: number;
  accent: string;
  /** fork / join bars: draw vertically (for left to right diagrams) */
  vertical?: boolean;
}

export interface StateDef {
  /** identifier (unique in the model) */
  id: string;
  name: string;
  kind: StateKind;
  /** id of the enclosing composite state */
  parent?: string;
  /** a composite state contains other states */
  composite?: boolean;
  activity?: string;
  /** concurrent region index inside the parent composite (0 when the composite has a single region) */
  region?: number;
}
/** note attached to a state */
export interface NoteDef {
  target: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  text: string;
}
export interface TransitionDef {
  from: string;
  to: string;
  /** `event [guard] / action` */
  label: string;
}
export interface StateModel {
  states: StateDef[];
  transitions: TransitionDef[];
  notes?: NoteDef[];
  direction?: 'TB' | 'LR';
}
export interface StateParseResult {
  model: StateModel;
  warnings: string[];
}
export const STATE_ACCENT = '#2f6fdb';
export const emptyStateModel = (): StateModel => ({ states: [], transitions: [] });
