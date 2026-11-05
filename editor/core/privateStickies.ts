/**
 * Private stickies live outside the shared document. Pure helpers (no DOM, no node APIs) used by the server (persistence, export, the
 * Yjs room) and by the browser (what goes into the shared doc and what goes to the per-user store).
 */
import type { CDoc, CEdge, CNode, CPage } from './types';

export interface PrivatePayload { nodes: CNode[]; edges: CEdge[] }
export const emptyPrivate = (): PrivatePayload => ({ nodes: [], edges: [] });

export const isPrivateSticky = (n: { type?: string; data?: any }): boolean => n.type === 'sticky' && n.data?.private === true;

/** the page without its private stickies and the edges attached to them, and those taken out */
export function splitPrivate<P extends { nodes: CNode[]; edges: CEdge[] }>(page: P): { shared: P; priv: PrivatePayload } {
  const ids = new Set(page.nodes.filter(isPrivateSticky).map((n) => n.id));
  if (!ids.size) return { shared: page, priv: emptyPrivate() };
  const touches = (e: CEdge) => ids.has(e.source) || ids.has(e.target);
  return {
    shared: { ...page, nodes: page.nodes.filter((n) => !ids.has(n.id)), edges: page.edges.filter((e) => !touches(e)) },
    priv: { nodes: page.nodes.filter((n) => ids.has(n.id)), edges: page.edges.filter(touches) },
  };
}

/** put private stickies (and their edges) back into a page; a shared node with the same id wins */
export function mergePrivate<P extends { nodes: CNode[]; edges: CEdge[] }>(page: P, priv: PrivatePayload): P {
  if (!priv.nodes.length && !priv.edges.length) return page;
  const have = new Set(page.nodes.map((n) => n.id));
  const haveE = new Set(page.edges.map((e) => e.id));
  const nodes = priv.nodes.filter((n) => !have.has(n.id));
  const ids = new Set([...have, ...nodes.map((n) => n.id)]);
  const edges = priv.edges.filter((e) => !haveE.has(e.id) && ids.has(e.source) && ids.has(e.target));
  if (!nodes.length && !edges.length) return page;
  return { ...page, nodes: [...page.nodes, ...nodes], edges: [...page.edges, ...edges] };
}

/**
 * Take every private sticky out of a whole document. They are grouped by the user who wrote them (`data.authorId` when that is a known
 * user, else `fallbackOwner`, stamped on the node as its author). Returns the same `doc` object when nothing was found.
 */
export function scrubDoc(doc: CDoc, o: { isUser: (id: string) => boolean; fallbackOwner: string }): { doc: CDoc; byUser: Map<string, PrivatePayload>; removed: number } {
  const byUser = new Map<string, PrivatePayload>();
  let removed = 0;
  const pages: CPage[] = doc.pages.map((p) => {
    const { shared, priv } = splitPrivate(p);
    if (!priv.nodes.length) return p;
    removed += priv.nodes.length;
    const owners = new Map<string, string>();
    for (const n of priv.nodes) {
      const a = n.data.authorId;
      const owner = typeof a === 'string' && o.isUser(a) ? a : o.fallbackOwner;
      owners.set(n.id, owner);
      const slot = byUser.get(owner) ?? (byUser.set(owner, emptyPrivate()), byUser.get(owner)!);
      slot.nodes.push(owner === a ? n : { ...n, data: { ...n.data, authorId: owner } });
    }
    for (const e of priv.edges) {
      const owner = owners.get(e.source) ?? owners.get(e.target);
      if (owner) byUser.get(owner)!.edges.push(e);
    }
    return shared;
  });
  return removed ? { doc: { ...doc, pages }, byUser, removed } : { doc, byUser, removed: 0 };
}
