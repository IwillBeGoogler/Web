import { create } from 'zustand';
import { useDiagramStore } from '../../store/diagramStore';
import { computeDrift, driftKey, type ClassChange, type Drift, type DriftOptions, type MemberChange, type Status } from './drift';
import { acceptChange, type DriftItem } from './driftApply';
import type { UmlModel } from './model';

export interface NodeMarks {
  /** every reviewed member of the class, by key (`a:name`, `o:name/2`) */
  members: Map<string, Status>;
  /** status of the rows that exist on the canvas, by member id (changed / removed) */
  byMemberId: Map<string, Status>;
  /** members only the code has, shown as ghost rows */
  ghosts: { comp: 'attributes' | 'operations'; text: string }[];
  classStatus?: 'removed' | 'changed';
  count: number;
}

interface DriftState {
  code: UmlModel | null;
  source: string;
  opts: DriftOptions;
  drift: Drift | null;
  dismissed: Set<string>;
  start: (code: UmlModel, source: string, opts?: DriftOptions) => void;
  refresh: () => void;
  clear: () => void;
  accept: (item: DriftItem) => void;
  reject: (key: string) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  /** the drift without what was rejected */
  visible: () => Drift | null;
  marksFor: (nodeId: string) => NodeMarks;
}

let unsub: (() => void) | null = null;
const text = (m: MemberChange) => `${m.after?.visibility ?? ''} ${m.after?.name}${m.comp === 'operations' ? '()' : ''}${m.after?.type ? `: ${m.after.type}` : ''}`.trim();

export const useDriftStore = create<DriftState>((set, get) => ({
  code: null, source: '', opts: {}, drift: null, dismissed: new Set(),
  start: (code, source, opts = {}) => {
    unsub?.();
    set({ code, source, opts, dismissed: new Set(), drift: computeDrift(useDiagramStore.getState().nodes, useDiagramStore.getState().edges, code, opts) });
    // the review follows the canvas: edits and accepted changes recompute what is left
    unsub = useDiagramStore.subscribe((s, p) => { if (s.nodes !== p.nodes || s.edges !== p.edges) get().refresh(); });
  },
  refresh: () => {
    const { code, opts } = get();
    if (!code) return;
    const s = useDiagramStore.getState();
    set({ drift: computeDrift(s.nodes, s.edges, code, opts) });
  },
  clear: () => { unsub?.(); unsub = null; set({ code: null, drift: null, dismissed: new Set(), source: '' }); },
  accept: (item) => { acceptChange(item); get().refresh(); },
  reject: (key) => set((s) => ({ dismissed: new Set([...s.dismissed, key]) })),
  visible: () => {
    const { drift, dismissed } = get();
    if (!drift) return null;
    const classes = drift.classes.map((c): ClassChange => ({ ...c, members: c.members.filter((m) => !dismissed.has(driftKey({ class: c, member: m }))) })).filter((c) => {
      if (c.status === 'same') return true;
      if (c.status === 'changed') return c.members.length > 0 || (Object.keys(c.header).length > 0 && !dismissed.has(driftKey({ class: c })));
      return !dismissed.has(driftKey({ class: c }));
    });
    const relations = drift.relations.filter((r) => !dismissed.has(driftKey({ relation: r })));
    return { classes, relations, isEmpty: classes.every((c) => c.status === 'same') && relations.length === 0 };
  },
  acceptAll: () => {
    // classes first (relations need both ends), then members, then relations; recompute in between
    for (let pass = 0; pass < 3; pass++) {
      const v = get().visible();
      if (!v || v.isEmpty) break;
      for (const c of v.classes) {
        if (c.status === 'added' || c.status === 'removed') acceptChange({ class: c });
        else if (c.status === 'changed') { if (Object.keys(c.header).length) acceptChange({ class: c }); for (const m of c.members) acceptChange({ class: c, member: m }); }
      }
      get().refresh();
      for (const r of get().visible()?.relations ?? []) acceptChange({ relation: r });
      get().refresh();
    }
  },
  rejectAll: () => {
    const v = get().visible();
    if (!v) return;
    const keys: string[] = [];
    for (const c of v.classes) { if (c.status === 'added' || c.status === 'removed' || Object.keys(c.header).length) keys.push(driftKey({ class: c })); for (const m of c.members) keys.push(driftKey({ class: c, member: m })); }
    for (const r of v.relations) keys.push(driftKey({ relation: r }));
    set((s) => ({ dismissed: new Set([...s.dismissed, ...keys]) }));
  },
  marksFor: (nodeId) => {
    const marks: NodeMarks = { members: new Map(), byMemberId: new Map(), ghosts: [], count: 0 };
    const v = get().visible();
    const c = v?.classes.find((x) => x.nodeId === nodeId);
    if (!c || c.status === 'same') return marks;
    if (c.status === 'removed') { marks.classStatus = 'removed'; marks.count = 1; return marks; }
    if (c.status === 'changed') marks.classStatus = 'changed';
    for (const m of c.members) {
      marks.members.set(m.key, m.status);
      marks.count++;
      if (m.status === 'added') marks.ghosts.push({ comp: m.comp, text: text(m) });
      else if (m.before) marks.byMemberId.set(m.before.id, m.status);
    }
    if (Object.keys(c.header).length) marks.count++;
    return marks;
  },
}));
