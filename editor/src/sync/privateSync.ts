import { isPrivateSticky, mergePrivate, splitPrivate, type PrivatePayload } from '@core/privateStickies';
import type { CEdge, CNode } from '@core/types';
import { jsonEqual } from '../collab/yproject';

/**
 * My private stickies of a server file. They are NOT part of the shared document (not in the Yjs doc, not in the saved JSON): this keeps
 * them in my own server-side store (`/files/:id/private`, readable only by me) and mirrors them into the editor store.
 *  - open: fetch mine and show them next to the shared nodes (unless I have local changes that never reached the server)
 *  - edit: when the private set changes, upload it (debounced); a failed upload leaves a "pending" marker in this browser and the
 *    next open uploads the local copy first, so working offline never loses a note
 */
export interface PrivateStoreLike {
  get(): { nodes: unknown[]; edges: unknown[] };
  set(p: { nodes: unknown[]; edges: unknown[] }): void;
  subscribe(cb: () => void): () => void;
}
export interface PrivateSyncDeps {
  fileId: string;
  api: {
    getPrivate(fileId: string): Promise<PrivatePayload & { updatedAt?: number }>;
    putPrivate(fileId: string, p: PrivatePayload): Promise<unknown>;
  };
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  store: PrivateStoreLike;
  delayMs?: number;
}

const pendingKey = (fileId: string) => `sdd:priv:pending:${fileId}`;
const read = (d: PrivateSyncDeps): PrivatePayload => {
  const s = d.store.get();
  return splitPrivate({ nodes: s.nodes as CNode[], edges: s.edges as CEdge[] }).priv;
};
const strip = (p: PrivatePayload) => ({ nodes: p.nodes.map((n) => ({ ...n, selected: undefined, dragging: undefined, measured: undefined })), edges: p.edges.map((e) => ({ ...e, selected: undefined })) });

export function startPrivateSync(d: PrivateSyncDeps): () => void {
  let stopped = false;
  let applying = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let synced: PrivatePayload | null = null; // what the server has (as far as we know)
  let ready = false;
  const wait = d.delayMs ?? 2000;

  const upload = async (): Promise<void> => {
    timer = null;
    const mine = read(d);
    try {
      await d.api.putPrivate(d.fileId, strip(mine) as PrivatePayload);
      synced = mine;
      if (jsonEqual(strip(read(d)), strip(mine))) d.storage.removeItem(pendingKey(d.fileId));
    } catch {
      d.storage.setItem(pendingKey(d.fileId), '1'); // retried on the next change or the next open
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void upload(), wait);
  };

  const unsub = d.store.subscribe(() => {
    if (applying || stopped || !ready) return;
    const mine = read(d);
    if (synced && jsonEqual(strip(mine), strip(synced))) return;
    d.storage.setItem(pendingKey(d.fileId), '1');
    schedule();
  });

  void (async () => {
    const localPending = d.storage.getItem(pendingKey(d.fileId)) === '1';
    try {
      const remote = await d.api.getPrivate(d.fileId);
      if (stopped) return;
      const theirs: PrivatePayload = { nodes: remote.nodes ?? [], edges: remote.edges ?? [] };
      ready = true;
      if (localPending) {
        synced = theirs;
        await upload();
        return;
      }
      synced = theirs;
      const cur = d.store.get();
      const shared = splitPrivate({ nodes: cur.nodes as CNode[], edges: cur.edges as CEdge[] }).shared;
      if (!jsonEqual(strip(read(d)), strip(theirs))) {
        applying = true;
        try {
          const merged = mergePrivate(shared, theirs);
          d.store.set({ nodes: merged.nodes, edges: merged.edges });
        } finally {
          applying = false;
        }
      }
    } catch {
      ready = true; // unreachable server: keep what this browser has and try again on the next change
      synced = null;
    }
  })();

  return () => {
    stopped = true;
    unsub();
    if (timer) {
      clearTimeout(timer);
      timer = null;
      void upload(); // best effort: a change made in the last moments
    }
  };
}

/**
 * For change detection: `s` with `nodes` / `edges` swapped for the previous arrays when only private stickies (and their edges)
 * differ, so a change of a private note is not mistaken for an edit of the shared document.
 */
export function sharedPart<T extends { nodes: unknown[]; edges: unknown[] }>(s: T, prev: T): T {
  if (s.nodes === prev.nodes && s.edges === prev.edges) return s;
  const a = splitPrivate({ nodes: s.nodes as CNode[], edges: s.edges as CEdge[] }).shared;
  const b = splitPrivate({ nodes: prev.nodes as CNode[], edges: prev.edges as CEdge[] }).shared;
  const same = <X>(x: X[], y: X[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return same(a.nodes, b.nodes) && same(a.edges, b.edges) ? { ...s, nodes: prev.nodes, edges: prev.edges } : s;
}

// ---- whole documents ---------------------------------------------------------------------------------------------------
interface DocLike { activePageId?: string; pages: { id: string; nodes: unknown[]; edges: unknown[] }[] }

/** the document as the server may see it: no private stickies, no edges attached to them (every page) */
export function withoutPrivate<D extends DocLike>(doc: D): D {
  if (!doc.pages.some((p) => (p.nodes as CNode[]).some(isPrivateSticky))) return doc;
  return { ...doc, pages: doc.pages.map((p) => splitPrivate(p as unknown as { nodes: CNode[]; edges: CEdge[] }).shared as unknown as typeof p) };
}
/** put my private stickies back into the page they belong to (the active one) of a document that came from the server */
export function withMyPrivate<D extends DocLike>(doc: D, mine: PrivatePayload): D {
  if (!mine.nodes.length && !mine.edges.length) return doc;
  const target = doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0];
  if (!target) return doc;
  return { ...doc, pages: doc.pages.map((p) => (p === target ? (mergePrivate(p as unknown as { nodes: CNode[]; edges: CEdge[] }, mine) as unknown as typeof p) : p)) };
}
export { isPrivateSticky };
