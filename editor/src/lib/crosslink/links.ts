/**
 * Cross-links: a UML class / component or an ERD table points at an architecture node (icon or card) of the same workspace
 * project ("this service owns these tables"). Stored as `node.data.archRef`. Pure helpers: the ref model, resolution against a
 * project index, back-links, and validation. A ref to something that no longer exists resolves to `{ ok: false }` (shown as broken).
 */
export interface ArchRef {
  nodeId: string;
  /** omitted: the file that holds the source node */
  fileId?: string;
  /** omitted: the page of the source node (same file) or any page of the target file */
  pageId?: string;
}
export interface Loc { fileId: string; pageId: string; nodeId: string }

/** node types that can carry a link / be linked to */
export const LINK_SOURCE_TYPES = ['class', 'component', 'table'];
export const ARCH_TARGET_TYPES = ['icon', 'card'];
export const isLinkSource = (n: { type?: string }): boolean => LINK_SOURCE_TYPES.includes(String(n.type));
export const isArchTarget = (n: { type?: string }): boolean => ARCH_TARGET_TYPES.includes(String(n.type));

export interface IdxNode { id: string; type: string; label: string; archRef?: ArchRef }
export interface IdxPage { id: string; name: string; nodes: IdxNode[] }
export interface IdxFile { id: string; name: string; kind?: string; pages: IdxPage[] }
export interface ProjectIndex { files: IdxFile[] }

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** the error text of a malformed `archRef` value (null when fine or absent); used by the document validators */
export function validateArchRef(v: unknown): string | null {
  if (v === undefined) return null;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'must be an object {nodeId, fileId?, pageId?}';
  const r = v as Record<string, unknown>;
  if (!str(r.nodeId)) return '.nodeId must be a non-empty string';
  if (r.fileId !== undefined && !str(r.fileId)) return '.fileId must be a non-empty string';
  if (r.pageId !== undefined && !str(r.pageId)) return '.pageId must be a non-empty string';
  return null;
}
/** the ref stored in node data, or null when absent / malformed */
export function archRefOf(data: unknown): ArchRef | null {
  const v = (data as { archRef?: unknown } | null | undefined)?.archRef;
  if (validateArchRef(v) || v === undefined) return null;
  const r = v as ArchRef;
  return { nodeId: r.nodeId, ...(r.fileId ? { fileId: r.fileId } : {}), ...(r.pageId ? { pageId: r.pageId } : {}) };
}

/** the ref to store for `target`, relative to the source (same file / same page parts are left out) */
export function makeRef(target: Loc, from: { fileId: string; pageId: string }): ArchRef {
  const sameFile = target.fileId === from.fileId;
  const ref: ArchRef = { nodeId: target.nodeId };
  if (!sameFile) ref.fileId = target.fileId;
  if (!sameFile || target.pageId !== from.pageId) ref.pageId = target.pageId;
  return ref;
}

export type Resolution =
  | { ok: true; loc: Loc; node: IdxNode; file: IdxFile; page: IdxPage }
  | { ok: false; reason: string };

/** find the node a ref points at; `from` is where the source node lives */
export function resolveRef(ref: ArchRef, from: { fileId: string; pageId: string }, index: ProjectIndex): Resolution {
  const fileId = ref.fileId ?? from.fileId;
  const file = index.files.find((f) => f.id === fileId);
  if (!file) return { ok: false, reason: 'The file was deleted' };
  const pages = ref.pageId ? file.pages.filter((p) => p.id === ref.pageId) : ref.fileId ? file.pages : file.pages.filter((p) => p.id === from.pageId);
  if (ref.pageId && !pages.length) return { ok: false, reason: 'The page was deleted' };
  for (const page of pages) {
    const node = page.nodes.find((n) => n.id === ref.nodeId);
    if (node) {
      if (!isArchTarget(node)) return { ok: false, reason: 'The target is not an architecture node' };
      return { ok: true, loc: { fileId: file.id, pageId: page.id, nodeId: node.id }, node, file, page };
    }
  }
  return { ok: false, reason: 'The node was deleted' };
}

export interface BackLink { loc: Loc; node: IdxNode; file: IdxFile; page: IdxPage }
/** every node (class / component / table) whose ref resolves to `target` */
export function backlinksOf(target: Loc, index: ProjectIndex): BackLink[] {
  const out: BackLink[] = [];
  for (const file of index.files)
    for (const page of file.pages)
      for (const node of page.nodes) {
        if (!node.archRef || !isLinkSource(node)) continue;
        const r = resolveRef(node.archRef, { fileId: file.id, pageId: page.id }, index);
        if (r.ok && r.loc.fileId === target.fileId && r.loc.pageId === target.pageId && r.loc.nodeId === target.nodeId) out.push({ loc: { fileId: file.id, pageId: page.id, nodeId: node.id }, node, file, page });
      }
  return out;
}

export interface Candidate { loc: Loc; label: string; fileName: string; pageName: string }
/** architecture nodes the picker offers: same page first, then same file, then other files */
export function candidatesOf(index: ProjectIndex, from: { fileId: string; pageId: string }): Candidate[] {
  const out: (Candidate & { rank: number })[] = [];
  for (const file of index.files)
    for (const page of file.pages)
      for (const n of page.nodes)
        if (isArchTarget(n)) out.push({ loc: { fileId: file.id, pageId: page.id, nodeId: n.id }, label: n.label || n.id, fileName: file.name, pageName: page.name, rank: file.id === from.fileId ? (page.id === from.pageId ? 0 : 1) : 2 });
  return out.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label)).map(({ rank: _r, ...c }) => (void _r, c));
}

/** index entry of a page-like object (the node `data.label` and `data.archRef` are all the index keeps) */
export function indexPage(p: { id: string; name: string; nodes: { id: string; type?: string; data?: unknown }[] }): IdxPage {
  return {
    id: p.id,
    name: p.name,
    nodes: p.nodes.map((n) => {
      const d = (n.data ?? {}) as { label?: unknown };
      return { id: n.id, type: String(n.type), label: typeof d.label === 'string' ? d.label : '', ...(archRefOf(n.data) ? { archRef: archRefOf(n.data)! } : {}) };
    }),
  };
}
