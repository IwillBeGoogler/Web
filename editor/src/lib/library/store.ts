/** The project library on this device: persisted per project in localStorage, synced to the server by sync/libraryRuntime. */
import { create } from 'zustand';
import { emptyLibraryDoc, type LibraryDoc } from './types';

const key = (pid: string) => `sdd:lib:${pid}`;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** three-way merge per id: a side that changed an entry wins over a side that did not; both changed -> mine, but never a lower revision */
function mergeRecord<T extends object>(base: Record<string, T>, mine: Record<string, T>, theirs: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const b = base[id], m = mine[id], t = theirs[id];
    const mineChanged = !sameJson(b, m);
    const theirsChanged = !sameJson(b, t);
    let pick: T | undefined;
    if (mineChanged && !theirsChanged) pick = m;
    else if (!mineChanged) pick = t;
    else if (m === undefined) pick = t; // I deleted it but they changed it: keep theirs
    else if (t === undefined) pick = m;
    else { const tr = (t as { rev?: number }).rev, mr = (m as { rev?: number }).rev; pick = typeof tr === 'number' && typeof mr === 'number' && tr > mr ? t : m; }
    if (pick !== undefined) out[id] = pick;
  }
  return out;
}
export function mergeLibrary(base: LibraryDoc, mine: LibraryDoc, theirs: LibraryDoc): LibraryDoc {
  return {
    components: mergeRecord(base.components, mine.components, theirs.components),
    styles: {
      colors: mergeRecord(base.styles.colors, mine.styles.colors, theirs.styles.colors),
      texts: mergeRecord(base.styles.texts, mine.styles.texts, theirs.styles.texts),
      effects: mergeRecord(base.styles.effects, mine.styles.effects, theirs.styles.effects),
    },
    tokens: mergeRecord(base.tokens, mine.tokens, theirs.tokens),
  };
}

interface Persisted { doc: LibraryDoc; rev: number; base: LibraryDoc; dirty: boolean }
interface LibState extends Persisted {
  projectId: string | null;
  /** bumps on every change of `doc` (subscribers re-sync instances and styles) */
  version: number;
  open: (projectId: string) => void;
  close: () => void;
  update: (fn: (d: LibraryDoc) => LibraryDoc) => void;
  /** the server's library arrived and merged: store it as the new base */
  adopt: (rev: number, doc: LibraryDoc, merged?: LibraryDoc) => void;
}
const fresh = (): Persisted => ({ doc: emptyLibraryDoc(), rev: 0, base: emptyLibraryDoc(), dirty: false });
function persist(pid: string | null, s: Persisted): void {
  if (!pid) return;
  try { localStorage.setItem(key(pid), JSON.stringify({ doc: s.doc, rev: s.rev, base: s.base, dirty: s.dirty })); } catch { /* quota / private mode */ }
}
function read(pid: string): Persisted {
  try {
    const v = JSON.parse(localStorage.getItem(key(pid)) ?? 'null') as Partial<Persisted> | null;
    if (v && v.doc && v.base) return { doc: { ...emptyLibraryDoc(), ...v.doc }, rev: v.rev ?? 0, base: v.base, dirty: !!v.dirty };
  } catch { /* corrupt */ }
  return fresh();
}

export const useLibraryDoc = create<LibState>((set, get) => ({
  ...fresh(),
  projectId: null,
  version: 0,
  open: (projectId) => set({ ...read(projectId), projectId, version: get().version + 1 }),
  close: () => set({ ...fresh(), projectId: null, version: get().version + 1 }),
  update: (fn) => {
    const s = get();
    const doc = fn(s.doc);
    if (doc === s.doc) return;
    const next = { doc, rev: s.rev, base: s.base, dirty: true };
    persist(s.projectId, next);
    set({ ...next, version: s.version + 1 });
  },
  adopt: (rev, serverDoc, merged) => {
    const s = get();
    const doc = merged ?? serverDoc;
    const dirty = !sameJson(doc, serverDoc);
    const next = { doc, rev, base: serverDoc, dirty };
    persist(s.projectId, next);
    set({ ...next, version: sameJson(doc, s.doc) ? s.version : s.version + 1 });
  },
}));
