/**
 * Shared UML model: a class that lives on several diagrams / pages of one file. Each copy is a normal `class` node whose data
 * carries the same `modelId`; the model fields below are kept equal across copies, everything else (position, size policy, accent,
 * collapse state, package, cross-link) stays per copy, so concurrent Yjs edits to positions never collide. Sequence lifelines and
 * object nodes may carry the same `modelId`; their displayed class name follows the class. Pure helpers: the store applies them.
 * Additive on the schema (one optional string), so there is no schema bump.
 */
import type { DiagramNode } from '../../types';
import type { SequenceData } from '../seq/types';
import { withObjectSize } from '../object/sizes';
import { withSequenceSize } from '../seq/node';
import { classOf, withClassSize } from './geometry';
import type { ClassNodeData } from './types';

/** the class fields that are equal on every linked copy */
export const MODEL_FIELDS = ['label', 'kind', 'generics', 'stereotype', 'attributes', 'operations'] as const;

export const newModelId = (): string => `m_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;

type Dict = Record<string, unknown>;
const dataOf = (n: DiagramNode): Dict => n.data as unknown as Dict;

/** the shared model a node is linked to (class, object or sequence lifeline links excluded: see `participantsOf`) */
export function modelIdOf(n: DiagramNode): string | undefined {
  if (n.type !== 'class' && n.type !== 'object') return undefined;
  const v = dataOf(n).modelId;
  return typeof v === 'string' && v ? v : undefined;
}

/** the part of a class that is shared */
export function modelFields(d: ClassNodeData): Pick<ClassNodeData, (typeof MODEL_FIELDS)[number]> {
  const out: Dict = {};
  for (const k of MODEL_FIELDS) if ((d as unknown as Dict)[k] !== undefined) out[k] = (d as unknown as Dict)[k];
  return out as never;
}
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** `n` with the model fields of `src` (the copy keeps its own position, accent, collapse state ...); the same node when nothing differs */
function applyToClass(n: DiagramNode, src: ClassNodeData): DiagramNode {
  const mine = modelFields(classOf(n));
  const theirs = modelFields(src);
  if (sameJson(mine, theirs)) return n;
  const data: Dict = { ...dataOf(n) };
  for (const k of MODEL_FIELDS) if (theirs[k] === undefined) delete data[k]; else data[k] = theirs[k];
  return withClassSize({ ...n, data: data as never });
}

function applyToRefs(n: DiagramNode, modelId: string, label: string): DiagramNode {
  const d = dataOf(n);
  if (n.type === 'object' && d.modelId === modelId && d.className !== label) return withObjectSize({ ...n, data: { ...d, className: label } as never });
  if (n.type === 'sequence') {
    const seq = d as unknown as SequenceData;
    if (!seq.participants.some((p) => p.modelId === modelId && p.name !== label)) return n;
    return withSequenceSize({ ...n, data: { ...d, participants: seq.participants.map((p) => (p.modelId === modelId && p.name !== label ? { ...p, name: label } : p)) } as never });
  }
  return n;
}

/** put the shared fields of `src` on every other copy of `modelId` in `nodes` (and on the objects / lifelines linked to it); same array when nothing changes */
export function propagateNodes(nodes: DiagramNode[], modelId: string, src: ClassNodeData, exceptId?: string): DiagramNode[] {
  let changed = false;
  const out = nodes.map((n) => {
    let next = n;
    if (n.id !== exceptId && n.type === 'class' && modelIdOf(n) === modelId) next = applyToClass(n, src);
    else if (n.type === 'object' || n.type === 'sequence') next = applyToRefs(n, modelId, src.label);
    if (next !== n) changed = true;
    return next;
  });
  return changed ? out : nodes;
}

export interface PagesState { nodes: DiagramNode[]; stash: Record<string, { nodes: DiagramNode[] }> }
/** the same on the active page and every other page of the file */
export function propagateEverywhere<S extends PagesState>(s: S, modelId: string, src: ClassNodeData, exceptId?: string): { nodes: DiagramNode[]; stash: S['stash'] } {
  const nodes = propagateNodes(s.nodes, modelId, src, exceptId);
  let stash = s.stash;
  for (const [pid, ps] of Object.entries(s.stash)) {
    const next = propagateNodes(ps.nodes, modelId, src);
    if (next !== ps.nodes) stash = { ...stash, [pid]: { ...ps, nodes: next } };
  }
  return { nodes, stash };
}

/** after undo / redo the active page is the truth: the other pages follow its version of every model they share */
export function healStash<S extends PagesState>(s: S): S['stash'] {
  let stash = s.stash;
  const done = new Set<string>();
  for (const n of s.nodes) {
    const mid = modelIdOf(n);
    if (!mid || n.type !== 'class' || done.has(mid)) continue;
    done.add(mid);
    for (const [pid, ps] of Object.entries(stash)) {
      const next = propagateNodes(ps.nodes, mid, classOf(n));
      if (next !== ps.nodes) stash = { ...stash, [pid]: { ...ps, nodes: next } };
    }
  }
  return stash;
}

/** how many class copies share `modelId` in the file */
export function copyCount(s: PagesState, modelId: string): number {
  let n = s.nodes.filter((x) => x.type === 'class' && modelIdOf(x) === modelId).length;
  for (const ps of Object.values(s.stash)) n += ps.nodes.filter((x) => x.type === 'class' && modelIdOf(x) === modelId).length;
  return n;
}

export interface ModelEntry { modelId?: string; label: string; kind: string; pageId: string; pageName: string; nodeId: string; members: number; onThisPage: boolean }
/** every class of the file (one entry per model; unlinked classes are their own entry), for the "Add existing class" picker */
export function listModels(s: PagesState & { pages: { id: string; name: string }[]; activePageId: string }): ModelEntry[] {
  const out: ModelEntry[] = [];
  const seen = new Map<string, ModelEntry>();
  for (const p of s.pages) {
    const nodes = p.id === s.activePageId ? s.nodes : s.stash[p.id]?.nodes ?? [];
    for (const n of nodes) {
      if (n.type !== 'class') continue;
      const d = classOf(n);
      const mid = modelIdOf(n);
      const here = p.id === s.activePageId;
      const e: ModelEntry = { modelId: mid, label: d.label, kind: d.kind, pageId: p.id, pageName: p.name, nodeId: n.id, members: d.attributes.length + d.operations.length, onThisPage: here };
      if (!mid) { out.push(e); continue; }
      const prev = seen.get(mid);
      if (!prev) { seen.set(mid, e); out.push(e); } else if (here) { prev.onThisPage = true; }
    }
  }
  return out;
}
