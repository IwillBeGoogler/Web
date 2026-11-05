/** AST of the `.sdd` text format (diagrams as code). Pure data; see parse.ts / print.ts / build.ts. */
export interface Diagnostic { line: number; col: number; message: string; severity: 'error' | 'warning' }

export interface DslNode { id: string; label: string; kind: 'node' | 'group'; icon?: string; sub?: string; parent?: string; attrs: Record<string, string>; line: number }
export interface DslEdge { from: string; to: string; label?: string; arrow: '->' | '<->' | '--' | '<-'; attrs: Record<string, string>; line: number }

export type RefOp = '>' | '<' | '-' | '<>';
export interface DslRefEnd { table: string; column: string }
export interface DslColumn {
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  notNull: boolean;
  increment: boolean;
  default?: string;
  note?: string;
  /** inline `ref: > users.id` (this column is the left side) */
  ref?: { op: RefOp; to: DslRefEnd };
  line: number;
}
export interface DslIndex { columns: string[]; unique: boolean; name?: string }
export interface DslTable { name: string; kind: 'table' | 'view' | 'enum'; columns: DslColumn[]; indexes: DslIndex[]; note?: string; line: number }
export interface DslRef { from: DslRefEnd; op: RefOp; to: DslRefEnd; attrs: Record<string, string>; line: number }

export type SeqKindText = 'participant' | 'actor' | 'boundary' | 'control' | 'entity' | 'database';
export interface DslSeqParticipant { id: string; name: string; kind: SeqKindText; modelId?: string }
export type DslSeqItem =
  | { type: 'message'; from: string; to: string; text: string; kind: 'sync' | 'async' | 'return' | 'create' | 'destroy' }
  | { type: 'note'; over: string[]; text: string; side?: 'left' | 'right' }
  | { type: 'fragment'; op: 'alt' | 'opt' | 'loop' | 'par' | 'break' | 'critical'; sections: { guard: string; items: DslSeqItem[] }[] };
export interface DslSeq { id: string; title: string; participants: DslSeqParticipant[]; items: DslSeqItem[]; autonumber: boolean; line: number }

// ---- UML class ----
export type ClassKindText = 'class' | 'interface' | 'abstract' | 'enum';
export interface DslMember { vis: '+' | '-' | '#' | '~' | ''; static: boolean; abstract: boolean; name: string; type?: string; default?: string; params?: { name: string; type?: string }[]; op: boolean }
export interface DslArchRef { nodeId: string; fileId?: string; pageId?: string }
export interface DslClass { archRef?: DslArchRef; modelId?: string; name: string; kind: ClassKindText; generics?: string; stereotype?: string; pkg?: string; attrs: DslMember[]; ops: DslMember[]; line: number }
export interface DslPackage { id: string; label: string; parent?: string; line: number }
export type DslClassRelKind = 'inheritance' | 'realization' | 'composition' | 'aggregation' | 'association' | 'dependency';
export interface DslClassRel { from: string; to: string; kind: DslClassRelKind; directed: boolean; label?: string; srcMult?: string; dstMult?: string; srcRole?: string; dstRole?: string; line: number }
// ---- state ----
export type StateKindText = 'state' | 'initial' | 'final' | 'choice' | 'fork' | 'join' | 'history' | 'deepHistory' | 'entryPoint' | 'exitPoint';
export interface DslState { id: string; label: string; kind: StateKindText; composite: boolean; parent?: string; region: number; activity?: string; vertical: boolean; line: number }
export interface DslTransition { from: string; to: string; label?: string; line: number }
// ---- use case ----
export interface DslUcItem { id: string; label: string; kind: 'actor' | 'usecase' | 'boundary'; parent?: string; points: string[]; line: number }
export interface DslUcRel { from: string; to: string; kind: 'association' | 'include' | 'extend' | 'generalization'; label?: string; srcMult?: string; dstMult?: string; line: number }
// ---- component ----
export interface DslComp { archRef?: DslArchRef; id: string; label: string; kind: 'component' | 'node' | 'artifact'; stereotype?: string; parent?: string; provides: string[]; requires: string[]; line: number }
export interface DslCompLink { from: string; to: string; kind: 'dependency' | 'assembly'; label?: string; line: number }
// ---- activity ----
export type ActKindText = 'initial' | 'final' | 'flowFinal' | 'action' | 'decision' | 'fork' | 'object' | 'send' | 'accept' | 'note';
export interface DslActNode { id: string; label: string; kind: ActKindText; lane?: string; vertical: boolean; state?: string; line: number }
export interface DslActLane { id: string; label: string; orient: 'v' | 'h'; line: number }
/** a control flow (label = the `[guard]` text as written) or, with `note`, a dashed link from a note */
export interface DslActFlow { from: string; to: string; label?: string; note: boolean; line: number }
// ---- deployment ----
export type DepKindText = 'node' | 'device' | 'executionEnvironment' | 'artifact' | 'component';
export interface DslDepNode { id: string; label: string; kind: DepKindText; stereotype?: string; icon?: string; parent?: string; line: number }
export interface DslDepLink { from: string; to: string; kind: 'communication' | 'deploy' | 'manifest'; label?: string; line: number }
// ---- package diagram: packages are the class packages (`DslPackage`); only the relations between them live in `packages { }` ----
export type PkgRelKind = 'import' | 'access' | 'merge' | 'dependency';
export interface DslPkgRel { from: string; to: string; kind: PkgRelKind; label?: string; line: number }
// ---- object diagram ----
export interface DslSlot { name: string; value: string }
export interface DslObject { id: string; label: string; className?: string; modelId?: string; slots: DslSlot[]; line: number }
export interface DslObjLink { from: string; to: string; label?: string; srcRole?: string; dstRole?: string; line: number }
// ---- communication diagram: the objects / links of `objects { }` plus numbered messages on the links ----
export interface DslCommMsg { seq: string; from: string; to: string; text: string; async: boolean; line: number }
// ---- timing diagram ----
export type TimingKindText = 'robust' | 'concise' | 'binary' | 'clock';
export interface DslTmLife { id: string; name: string; kind: TimingKindText; states: string[]; period?: number }
export interface DslTmChange { life: string; t: number; state: string; line: number }
export interface DslTmMsg { from: string; to: string; t: number; t2?: number; text: string; line: number }
export interface DslTmCon { life: string; t1: number; t2: number; text: string; line: number }
export interface DslTiming { id: string; title: string; unit: string; end?: number; lifelines: DslTmLife[]; changes: DslTmChange[]; messages: DslTmMsg[]; constraints: DslTmCon[]; line: number }

export interface DslDoc {
  /** `#!sdd <version>` was present */
  header: boolean;
  version: number;
  title?: string;
  nodes: DslNode[];
  edges: DslEdge[];
  tables: DslTable[];
  refs: DslRef[];
  seqs: DslSeq[];
  packages: DslPackage[];
  classes: DslClass[];
  classRels: DslClassRel[];
  states: DslState[];
  transitions: DslTransition[];
  ucItems: DslUcItem[];
  ucRels: DslUcRel[];
  comps: DslComp[];
  compLinks: DslCompLink[];
  actNodes: DslActNode[];
  actLanes: DslActLane[];
  actFlows: DslActFlow[];
  depNodes: DslDepNode[];
  depLinks: DslDepLink[];
  pkgRels: DslPkgRel[];
  objects: DslObject[];
  objLinks: DslObjLink[];
  commMsgs: DslCommMsg[];
  timings: DslTiming[];
}
export const emptyDoc = (): DslDoc => ({ header: false, version: 1, nodes: [], edges: [], tables: [], refs: [], seqs: [], packages: [], classes: [], classRels: [], states: [], transitions: [], ucItems: [], ucRels: [], comps: [], compLinks: [], actNodes: [], actLanes: [], actFlows: [], depNodes: [], depLinks: [], pkgRels: [], objects: [], objLinks: [], commMsgs: [], timings: [] });
export const DSL_VERSION = 1;
