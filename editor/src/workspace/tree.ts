import type { EntryKind, EntryRef, FileKind, ProjectTree, WsFile, WsFolder } from './types';

/** Pure tree operations. Every function returns a NEW tree (or a result holding one) and never mutates its input. */

/** a folder or file seen uniformly. `kind` says which; `fileKind` is the diagram-kind hint of a file (sdd | erd | uml | board) */
export interface Entry {
  kind: EntryKind;
  id: string;
  name: string;
  position: number;
  parent: string | null;
  fileKind?: FileKind;
  updatedAt?: number;
  pageCount?: number;
}
export const parentOf = (e: Entry): string | null => e.parent;
const asFolder = (f: WsFolder): Entry => ({ kind: 'folder', id: f.id, name: f.name, position: f.position, parent: f.parentId });
const asFile = (f: WsFile): Entry => ({ kind: 'file', id: f.id, name: f.name, position: f.position, parent: f.folderId, fileKind: f.kind, updatedAt: f.updatedAt, pageCount: f.pageCount });
const byOrder = (a: Entry, b: Entry) => a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

export function findEntry(tree: ProjectTree, ref: EntryRef): Entry | null {
  if (ref.kind === 'folder') {
    const f = tree.folders.find((x) => x.id === ref.id);
    return f ? asFolder(f) : null;
  }
  const f = tree.files.find((x) => x.id === ref.id);
  return f ? asFile(f) : null;
}

/** children of a folder (null = project root), folders and files in one position-ordered sequence */
export function siblings(tree: ProjectTree, parentId: string | null): Entry[] {
  return [
    ...tree.folders.filter((f) => f.parentId === parentId).map(asFolder),
    ...tree.files.filter((f) => f.folderId === parentId).map(asFile),
  ].sort(byOrder);
}

const nextPosition = (tree: ProjectTree, parentId: string | null): number => {
  const s = siblings(tree, parentId);
  return s.length ? s[s.length - 1].position + 1 : 0;
};

/** sort key that places an item between two neighbours */
export function positionBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

export function isDescendantFolder(tree: ProjectTree, ancestorId: string, candidateId: string | null): boolean {
  // is `candidateId` the folder `ancestorId` itself or somewhere below it?
  let cur = candidateId;
  const seen = new Set<string>();
  while (cur !== null) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false; // corrupt cycle: stop
    seen.add(cur);
    cur = tree.folders.find((f) => f.id === cur)?.parentId ?? null;
  }
  return false;
}

/** folder ids below (and including) `id` */
export function folderSubtree(tree: ProjectTree, id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of tree.folders) if (f.parentId !== null && out.has(f.parentId) && !out.has(f.id)) (out.add(f.id), (grew = true));
  }
  return out;
}

export function countFolder(tree: ProjectTree, id: string): { folders: number; files: number } {
  const ids = folderSubtree(tree, id);
  return { folders: ids.size - 1, files: tree.files.filter((f) => f.folderId !== null && ids.has(f.folderId)).length };
}

export function ancestorFolderIds(tree: ProjectTree, ref: EntryRef): string[] {
  const e = findEntry(tree, ref);
  const out: string[] = [];
  let cur = e ? parentOf(e) : null;
  while (cur !== null && !out.includes(cur)) {
    out.push(cur);
    cur = tree.folders.find((f) => f.id === cur)?.parentId ?? null;
  }
  return out;
}

/** "name", "name (2)", "name (3)" ... unique among the entries of `parentId` (case-insensitive) */
export function uniqueName(tree: ProjectTree, parentId: string | null, base: string, excludeId?: string): string {
  const taken = new Set(siblings(tree, parentId).filter((e) => e.id !== excludeId).map((e) => e.name.trim().toLowerCase()));
  const name = base.trim() || 'Untitled';
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const n = `${name} (${i})`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

/** validation message for a new/renamed entry name, or null */
export function nameProblem(tree: ProjectTree, parentId: string | null, name: string, excludeId?: string): string | null {
  const n = name.trim();
  if (!n) return 'Name is required';
  if (n.length > 120) return 'Use at most 120 characters';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f/\\]/.test(n)) return 'Names cannot contain / \\ or control characters';
  if (siblings(tree, parentId).some((e) => e.id !== excludeId && e.name.trim().toLowerCase() === n.toLowerCase())) return 'An item with this name already exists here';
  return null;
}

export function createFolder(tree: ProjectTree, o: { id: string; name: string; parentId: string | null; position?: number }): ProjectTree {
  if (o.parentId !== null && !tree.folders.some((f) => f.id === o.parentId)) return tree;
  if (tree.folders.some((f) => f.id === o.id)) return tree;
  return { ...tree, folders: [...tree.folders, { id: o.id, parentId: o.parentId, name: o.name, position: o.position ?? nextPosition(tree, o.parentId) }] };
}

export function createFile(tree: ProjectTree, o: { id: string; name: string; folderId: string | null; kind?: FileKind; position?: number; now: number; pageCount?: number }): ProjectTree {
  if (o.folderId !== null && !tree.folders.some((f) => f.id === o.folderId)) return tree;
  if (tree.files.some((f) => f.id === o.id)) return tree;
  const file: WsFile = { id: o.id, folderId: o.folderId, name: o.name, kind: o.kind ?? 'sdd', position: o.position ?? nextPosition(tree, o.folderId), createdAt: o.now, updatedAt: o.now, pageCount: o.pageCount ?? 1 };
  return { ...tree, files: [...tree.files, file] };
}

export function renameEntry(tree: ProjectTree, ref: EntryRef, name: string, now?: number): ProjectTree {
  const n = name.trim();
  if (!n) return tree;
  return ref.kind === 'folder'
    ? { ...tree, folders: tree.folders.map((f) => (f.id === ref.id ? { ...f, name: n } : f)) }
    : { ...tree, files: tree.files.map((f) => (f.id === ref.id ? { ...f, name: n, ...(now ? { updatedAt: now } : {}) } : f)) };
}

export type MoveResult = { ok: true; tree: ProjectTree; parentId: string | null; position: number } | { ok: false; reason: 'missing' | 'cycle' | 'noop' };

/**
 * Move an entry under `parentId` at `index` among that parent's other children (default: the end). A folder can never go
 * into itself or one of its descendants. Positions are fractional so only the moved entry changes.
 */
export function moveEntry(tree: ProjectTree, ref: EntryRef, parentId: string | null, index?: number): MoveResult {
  const e = findEntry(tree, ref);
  if (!e) return { ok: false, reason: 'missing' };
  if (parentId !== null && !tree.folders.some((f) => f.id === parentId)) return { ok: false, reason: 'missing' };
  if (ref.kind === 'folder' && isDescendantFolder(tree, ref.id, parentId)) return { ok: false, reason: 'cycle' };
  const others = siblings(tree, parentId).filter((s) => !(s.kind === ref.kind && s.id === ref.id));
  const at = Math.max(0, Math.min(index ?? others.length, others.length));
  let position = positionBetween(others[at - 1]?.position, others[at]?.position);
  const sameSpot = parentOf(e) === parentId && siblings(tree, parentId).findIndex((s) => s.kind === ref.kind && s.id === ref.id) === at;
  if (sameSpot) return { ok: false, reason: 'noop' };
  // neighbours with identical positions (legacy data): renumber the target level so the new position is unambiguous
  let base = tree;
  if (others.some((o, i) => i > 0 && o.position === others[i - 1].position)) {
    base = renumber(tree, parentId, others);
    const re = siblings(base, parentId).filter((s) => !(s.kind === ref.kind && s.id === ref.id));
    position = positionBetween(re[at - 1]?.position, re[at]?.position);
  }
  const next: ProjectTree =
    ref.kind === 'folder'
      ? { ...base, folders: base.folders.map((f) => (f.id === ref.id ? { ...f, parentId, position } : f)) }
      : { ...base, files: base.files.map((f) => (f.id === ref.id ? { ...f, folderId: parentId, position } : f)) };
  return { ok: true, tree: next, parentId, position };
}

function renumber(tree: ProjectTree, parentId: string | null, ordered: Entry[]): ProjectTree {
  const pos = new Map(ordered.map((e, i) => [`${e.kind}:${e.id}`, i * 2]));
  void parentId;
  return {
    folders: tree.folders.map((f) => (pos.has(`folder:${f.id}`) ? { ...f, position: pos.get(`folder:${f.id}`)! } : f)),
    files: tree.files.map((f) => (pos.has(`file:${f.id}`) ? { ...f, position: pos.get(`file:${f.id}`)! } : f)),
  };
}

export interface DeleteResult {
  tree: ProjectTree;
  removedFolders: string[];
  removedFiles: string[];
}
export function deleteEntry(tree: ProjectTree, ref: EntryRef): DeleteResult {
  if (ref.kind === 'file') {
    if (!tree.files.some((f) => f.id === ref.id)) return { tree, removedFolders: [], removedFiles: [] };
    return { tree: { ...tree, files: tree.files.filter((f) => f.id !== ref.id) }, removedFolders: [], removedFiles: [ref.id] };
  }
  if (!tree.folders.some((f) => f.id === ref.id)) return { tree, removedFolders: [], removedFiles: [] };
  const ids = folderSubtree(tree, ref.id);
  return {
    tree: { folders: tree.folders.filter((f) => !ids.has(f.id)), files: tree.files.filter((f) => f.folderId === null || !ids.has(f.folderId)) },
    removedFolders: [...ids],
    removedFiles: tree.files.filter((f) => f.folderId !== null && ids.has(f.folderId)).map((f) => f.id),
  };
}

export interface DuplicateResult {
  tree: ProjectTree;
  /** the new top entry */
  root: EntryRef;
  /** old file id -> new file id (the caller copies the file documents) */
  fileMap: Record<string, string>;
  folderMap: Record<string, string>;
}
/** Deep copy next to the original ("name (copy)"). `newId(prefix)` supplies fresh ids. */
export function duplicateEntry(tree: ProjectTree, ref: EntryRef, newId: (prefix: 'fld' | 'fil') => string, now: number): DuplicateResult | null {
  const e = findEntry(tree, ref);
  if (!e) return null;
  const parent = parentOf(e);
  const position = nextPosition(tree, parent);
  if (ref.kind === 'file') {
    const id = newId('fil');
    const orig = tree.files.find((x) => x.id === ref.id)!;
    const copy: WsFile = { ...orig, id, name: uniqueName(tree, parent, `${orig.name} (copy)`), position, createdAt: now, updatedAt: now };
    return { tree: { ...tree, files: [...tree.files, copy] }, root: { kind: 'file', id }, fileMap: { [ref.id]: id }, folderMap: {} };
  }
  const ids = folderSubtree(tree, ref.id);
  const folderMap: Record<string, string> = {};
  for (const id of ids) folderMap[id] = newId('fld');
  const folders: WsFolder[] = tree.folders
    .filter((f) => ids.has(f.id))
    .map((f) => (f.id === ref.id ? { ...f, id: folderMap[f.id], parentId: parent, name: uniqueName(tree, parent, `${f.name} (copy)`), position } : { ...f, id: folderMap[f.id], parentId: folderMap[f.parentId!] }));
  const fileMap: Record<string, string> = {};
  const files: WsFile[] = tree.files
    .filter((f) => f.folderId !== null && ids.has(f.folderId))
    .map((f) => {
      const id = newId('fil');
      fileMap[f.id] = id;
      return { ...f, id, folderId: folderMap[f.folderId!], createdAt: now, updatedAt: now };
    });
  return { tree: { folders: [...tree.folders, ...folders], files: [...tree.files, ...files] }, root: { kind: 'folder', id: folderMap[ref.id] }, fileMap, folderMap };
}

// ---------- listing / search ----------
export interface Row {
  ref: EntryRef;
  entry: Entry;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
  expanded: boolean;
}

/** Visible rows in display order. `visible` (search) restricts to those ids; matches force-expand their ancestors. */
export function flatten(tree: ProjectTree, expanded: ReadonlySet<string>, visible?: ReadonlySet<string> | null): Row[] {
  const out: Row[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const e of siblings(tree, parentId)) {
      if (visible && !visible.has(e.id)) continue;
      const kids = e.kind === 'folder' ? siblings(tree, e.id).filter((k) => !visible || visible.has(k.id)) : [];
      const isOpen = e.kind === 'folder' && (visible ? true : expanded.has(e.id));
      out.push({ ref: { kind: e.kind, id: e.id }, entry: e, depth, parentId, hasChildren: kids.length > 0, expanded: isOpen });
      if (e.kind === 'folder' && isOpen) walk(e.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** ids to show for a filter: matching files/folders, their ancestors, and everything inside a matching folder. null = no filter */
export function filterTree(tree: ProjectTree, query: string): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const out = new Set<string>();
  for (const f of tree.folders)
    if (f.name.toLowerCase().includes(q)) {
      for (const id of folderSubtree(tree, f.id)) out.add(id);
      for (const file of tree.files) if (file.folderId !== null && out.has(file.folderId)) out.add(file.id);
      for (const a of ancestorFolderIds(tree, { kind: 'folder', id: f.id })) out.add(a);
    }
  for (const file of tree.files)
    if (file.name.toLowerCase().includes(q)) {
      out.add(file.id);
      for (const a of ancestorFolderIds(tree, { kind: 'file', id: file.id })) out.add(a);
    }
  return out;
}

/** slash path of a file for breadcrumbs / search results */
export function pathOf(tree: ProjectTree, ref: EntryRef): string {
  const e = findEntry(tree, ref);
  if (!e) return '';
  const names = [e.name];
  for (const a of ancestorFolderIds(tree, ref)) names.unshift(tree.folders.find((f) => f.id === a)!.name);
  return names.join(' / ');
}

// ---------- dominant kind ----------
const BOARD_TYPES = new Set(['sticky', 'draw', 'text', 'shape', 'frame', 'mindmap', 'stamp']);
const UML_TYPES = new Set(['class', 'sequence', 'state', 'usecase', 'activity', 'component', 'deployment', 'object', 'timing']);
/** group variants only UML diagrams use (package, state composite, use case boundary, activity lane): a package diagram is nothing but these */
const UML_GROUP_VARIANTS = new Set(['package', 'composite', 'boundary', 'lane']);
/** the icon hint of a file: whichever kind has most nodes (ties and empty files: sdd). Matches the server rule. */
export function dominantKind(pages: { nodes: { type?: string; data?: { variant?: unknown } }[] }[]): FileKind {
  const n: Record<FileKind, number> = { sdd: 0, erd: 0, uml: 0, board: 0 };
  for (const pg of pages)
    for (const node of pg.nodes) {
      const t = node.type ?? '';
      if (t === 'group' && UML_GROUP_VARIANTS.has(String(node.data?.variant))) n.uml++;
      else if (t === 'table' || t.startsWith('erd')) n.erd++;
      else if (UML_TYPES.has(t) || t.startsWith('uml')) n.uml++;
      else if (BOARD_TYPES.has(t)) n.board++;
      else n.sdd++;
    }
  let best: FileKind = 'sdd';
  for (const k of ['sdd', 'erd', 'uml', 'board'] as FileKind[]) if (n[k] > n[best]) best = k;
  return best;
}
