import { detachFromCollapsed } from '../lib/graph';
import * as Y from 'yjs';
import type { DiagramEdge, DiagramNode } from '../types';
import { isPrivateSticky, splitPrivate } from '@core/privateStickies';
import type { CEdge, CNode } from '@core/types';
import { jsonEqual, readProject, writeProject, isDocEmpty, type YEntity, type YProject } from './yproject';

/** the part of the diagram store a binding reads and patches (see store/diagramStore.ts) */
export interface PageMeta {
  id: string;
  name: string;
}
export interface CollabSlice {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  past: unknown[];
  future: unknown[];
  projectId: string;
  projectName: string;
  createdAt: number;
  pages: PageMeta[];
  activePageId: string;
  stash: Record<string, unknown>;
  projectSettings: unknown;
  viewports: Record<string, unknown>;
  pageFlow: Record<string, boolean>;
  guides?: Record<string, unknown[]>;
  assets: Record<string, unknown>;
}
export interface BindingStore {
  getState: () => CollabSlice;
  setState: (partial: Partial<CollabSlice> | ((s: CollabSlice) => Partial<CollabSlice>)) => void;
  subscribe: (listener: (s: CollabSlice, prev: CollabSlice) => void) => () => void;
}

/** origin of every transaction a binding writes: the only origin the UndoManager tracks (per user, per file) */
export const LOCAL_ORIGIN = { kind: 'local-binding' } as const;
export const SEED_ORIGIN = { kind: 'seed' } as const;

const NODE_TRANSIENT = ['selected', 'dragging', 'measured', 'resizing'] as const;
const HISTORY_MIRROR_MAX = 99;
const PLACEHOLDER = Object.freeze({ nodes: [], edges: [] });

/** the saveable project of the slice (same shape as store/diagramStore sliceToProject, without importing the store) */
function toProject(s: CollabSlice): YProject {
  // private stickies (and the edges attached to them) never enter the shared doc: they live in the user's own store
  const { shared } = splitPrivate({ nodes: s.nodes as unknown as CNode[], edges: s.edges as unknown as CEdge[] });
  const active = s.pages.find((p) => p.id === s.activePageId) ?? s.pages[0];
  return {
    version: 2,
    id: s.projectId,
    name: s.projectName,
    createdAt: s.createdAt,
    updatedAt: Date.now(),
    activePageId: active.id,
    ...(s.projectSettings && Object.keys(s.projectSettings as object).length ? { settings: s.projectSettings } : {}),
    ...(Object.keys(s.assets).length ? { assets: s.assets } : {}),
    pages: [
      {
        id: active.id,
        name: active.name,
        nodes: shared.nodes as unknown as YEntity[],
        edges: shared.edges as unknown as YEntity[],
        ...(s.viewports[active.id] ? { viewport: s.viewports[active.id] } : {}),
        ...(s.pageFlow[active.id] ? { flow: true } : {}),
        ...(s.guides?.[active.id]?.length ? { guides: s.guides[active.id] } : {}),
      },
    ],
  };
}

const stripTransient = (e: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) if (v !== undefined && !(NODE_TRANSIENT as readonly string[]).includes(k)) out[k] = v;
  return out;
};

/**
 * Keep object identity where nothing changed (no re-render), carry local transient state (selection, drag, measured size)
 * over from the previous object, and remember every object that came from the doc so the next local diff can skip it.
 */
function reconcile<T extends { id: string }>(prev: T[], next: YEntity[], cache: WeakSet<object>): T[] {
  const byId = new Map(prev.map((p) => [p.id, p]));
  let same = prev.length === next.length;
  const out = next.map((n, i) => {
    const old = byId.get(n.id) as (T & Record<string, unknown>) | undefined;
    if (old && jsonEqual(stripTransient(old), stripTransient(n))) {
      if (prev[i] !== old) same = false;
      cache.add(old);
      return old;
    }
    same = false;
    const merged: Record<string, unknown> = { ...n };
    if (old) for (const k of NODE_TRANSIENT) if (old[k] !== undefined) merged[k] = old[k];
    if (old && old.selected !== undefined) merged.selected = old.selected;
    cache.add(merged);
    return merged as unknown as T;
  });
  return same ? prev : out;
}

export interface BindingOptions {
  doc: Y.Doc;
  store: BindingStore;
  fileId: string;
  /** viewer / commenter: remote changes are applied, local ones are never written */
  readOnly?: boolean;
}

/**
 * Two-way binding between the diagram store and a Y.Doc.
 *  - store -> Y: every store change is diffed against the doc and written in ONE transaction with `LOCAL_ORIGIN`
 *  - Y -> store: transactions with another origin (remote peers, the UndoManager) patch the store; they are never written back
 *  - undo / redo: a Y.UndoManager that only tracks `LOCAL_ORIGIN`, so it reverts MY changes and never someone else's
 * The store's `past` / `future` arrays mirror the undo / redo depth so the toolbar's enabled state keeps working.
 */
export class StoreBinding {
  readonly doc: Y.Doc;
  readonly undoManager: Y.UndoManager;
  private store: BindingStore;
  private fileId: string;
  private readOnly: boolean;
  private cache = new WeakSet<object>();
  private applying = false;
  private mirroring = false;
  private unsub: (() => void) | null = null;
  private started = false;
  private onAfter = (tr: Y.Transaction) => {
    if (tr.origin === LOCAL_ORIGIN || tr.origin === SEED_ORIGIN) return;
    if (!tr.changed.size) return;
    this.applyDoc();
  };
  private onStack = () => this.mirror();

  constructor(o: BindingOptions) {
    this.doc = o.doc;
    this.store = o.store;
    this.fileId = o.fileId;
    this.readOnly = !!o.readOnly;
    const scope = [this.doc.getMap('meta'), this.doc.getMap('nodes'), this.doc.getMap('edges'), this.doc.getArray('nodeOrder'), this.doc.getArray('edgeOrder')];
    this.undoManager = new Y.UndoManager(scope, { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 1500 });
  }

  /** start listening both ways; a non-empty doc is loaded into the store right away */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.doc.on('afterTransaction', this.onAfter);
    this.undoManager.on('stack-item-added', this.onStack);
    this.undoManager.on('stack-item-popped', this.onStack);
    this.undoManager.on('stack-cleared', this.onStack);
    this.unsub = this.store.subscribe((s, prev) => this.onStore(s, prev));
    if (!isDocEmpty(this.doc)) this.applyDoc();
    this.mirror();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.doc.off('afterTransaction', this.onAfter);
    this.undoManager.off('stack-item-added', this.onStack);
    this.undoManager.off('stack-item-popped', this.onStack);
    this.undoManager.off('stack-cleared', this.onStack);
    this.unsub?.();
    this.unsub = null;
    this.undoManager.destroy();
  }

  /** write the store into an EMPTY doc (first open of a file nobody has shared yet); not undoable */
  seed(): void {
    if (this.readOnly || !isDocEmpty(this.doc)) return;
    writeProject(this.doc, toProject(this.store.getState()), SEED_ORIGIN, this.cache);
  }

  undo(): void {
    this.undoManager.stopCapturing();
    this.undoManager.undo();
    this.mirror();
  }
  redo(): void {
    this.undoManager.stopCapturing();
    this.undoManager.redo();
    this.mirror();
  }
  /** the next local change starts a new undo step */
  stopCapturing(): void {
    this.undoManager.stopCapturing();
  }
  undoDepth(): number {
    return this.undoManager.undoStack.length;
  }
  redoDepth(): number {
    return this.undoManager.redoStack.length;
  }

  private onStore(s: CollabSlice, prev: CollabSlice): void {
    if (this.applying || this.mirroring) return;
    if (s.past !== prev.past) this.undoManager.stopCapturing(); // the store recorded a history step: a new undo step starts here
    if (this.readOnly) return;
    if (
      s.nodes === prev.nodes && s.edges === prev.edges && s.projectName === prev.projectName && s.pages === prev.pages && s.activePageId === prev.activePageId &&
      s.projectSettings === prev.projectSettings && s.assets === prev.assets && s.pageFlow === prev.pageFlow && s.guides === prev.guides && s.stash === prev.stash
    ) {
      if (s.past !== prev.past || s.future !== prev.future) this.mirror();
      return;
    }
    writeProject(this.doc, toProject(s), LOCAL_ORIGIN, this.cache);
    this.mirror();
  }

  /** make `past` / `future` as deep as the undo / redo stacks (placeholders: the UndoManager owns the real history) */
  private mirror(): void {
    const s = this.store.getState();
    const past = Math.min(this.undoManager.undoStack.length, HISTORY_MIRROR_MAX);
    const future = Math.min(this.undoManager.redoStack.length, HISTORY_MIRROR_MAX);
    if (s.past.length === past && s.future.length === future) return;
    this.mirroring = true;
    try {
      this.store.setState({ past: new Array(past).fill(PLACEHOLDER), future: new Array(future).fill(PLACEHOLDER) });
    } finally {
      this.mirroring = false;
    }
  }

  /** doc -> store (remote update, undo, initial load) */
  private applyDoc(): void {
    const s = this.store.getState();
    const p = readProject(this.doc, { id: this.fileId, updatedAt: 0 });
    const page = p.pages[0];
    const patch: Partial<CollabSlice> = {};
    // my private stickies are not in the doc: reconcile the shared part, then put them back
    const hasPriv = s.nodes.some(isPrivateSticky);
    const mine = hasPriv ? splitPrivate({ nodes: s.nodes as unknown as CNode[], edges: s.edges as unknown as CEdge[] }) : null;
    const prevNodes = mine ? (mine.shared.nodes as unknown as DiagramNode[]) : s.nodes;
    const prevEdges = mine ? (mine.shared.edges as unknown as DiagramEdge[]) : s.edges;
    const sharedNodes = reconcile(prevNodes, page.nodes, this.cache);
    const sharedEdges = reconcile(prevEdges, page.edges, this.cache);
    if (sharedNodes !== prevNodes) patch.nodes = mine ? ([...sharedNodes, ...mine.priv.nodes.filter((n) => !sharedNodes.some((x) => x.id === n.id))] as unknown as DiagramNode[]) : sharedNodes;
    if (sharedEdges !== prevEdges) patch.edges = mine ? ([...sharedEdges, ...mine.priv.edges] as unknown as DiagramEdge[]) : sharedEdges;
    if (p.name !== s.projectName) patch.projectName = p.name;
    if (s.pages.length !== 1 || s.pages[0].id !== page.id || s.pages[0].name !== page.name) {
      patch.pages = [{ id: page.id, name: page.name }];
      patch.activePageId = page.id;
      patch.stash = {};
    } else if (s.activePageId !== page.id) patch.activePageId = page.id;
    const settings = p.settings ?? {};
    if (!jsonEqual(s.projectSettings, settings)) patch.projectSettings = settings;
    const assets = (p.assets ?? {}) as Record<string, unknown>;
    if (!jsonEqual(s.assets, assets)) patch.assets = assets;
    const flow = !!page.flow;
    if (!!s.pageFlow[page.id] !== flow) patch.pageFlow = flow ? { ...s.pageFlow, [page.id]: true } : Object.fromEntries(Object.entries(s.pageFlow).filter(([k]) => k !== page.id));
    const guides = Array.isArray(page.guides) ? page.guides : [];
    if (!jsonEqual(s.guides?.[page.id] ?? [], guides)) patch.guides = guides.length ? { ...s.guides, [page.id]: guides } : Object.fromEntries(Object.entries(s.guides ?? {}).filter(([k]) => k !== page.id));
    if (!Object.keys(patch).length) return;
    this.applying = true;
    try {
      this.store.setState(patch);
    } finally {
      this.applying = false;
    }
    // repair older docs once (a node dropped into a collapsed card): as a normal local edit, so it syncs to everyone
    if (patch.nodes) {
      const fixed = detachFromCollapsed(this.store.getState().nodes);
      if (fixed !== this.store.getState().nodes) queueMicrotask(() => this.store.setState({ nodes: fixed }));
    }
  }
}
