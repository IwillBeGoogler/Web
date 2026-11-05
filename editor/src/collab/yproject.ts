/**
 * The shared (Yjs) shape of ONE file = ONE canvas, and the two pure functions between it and the "Project v2" document:
 *
 *   meta   Y.Map   name, createdAt, pageId, pageName, flow, viewport (seed only), settings (atomic), guides (atomic), assets (Y.Map hash -> asset)
 *   nodes  Y.Map   id -> Y.Map (every top level field; `data` is a nested Y.Map of JSON values)
 *   edges  Y.Map   id -> Y.Map (same)
 *   nodeOrder / edgeOrder  Y.Array<string>   z-order (concurrent inserts may duplicate an id: reads de-duplicate)
 *
 * Writes are DIFFS (only changed keys are touched), so concurrent edits of different nodes or different fields of one node merge.
 * This module has no dependency but `yjs`; `server/src/collab/yproject.ts` is a byte-identical copy (a test keeps them in step).
 */
import * as Y from 'yjs';

export interface YEntity {
  id: string;
  [k: string]: unknown;
}
export interface YPage {
  id: string;
  name: string;
  nodes: YEntity[];
  edges: YEntity[];
  viewport?: unknown;
  flow?: boolean;
  settings?: unknown;
  /** ruler guides of the canvas: [{id, axis:'x'|'y', pos}] (atomic JSON) */
  guides?: unknown;
}
export interface YProject {
  version: 2;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activePageId: string;
  pages: YPage[];
  settings?: unknown;
  assets?: Record<string, unknown>;
}

const NODE_TRANSIENT = ['selected', 'dragging', 'measured', 'resizing'];
const EDGE_TRANSIENT = ['selected'];

type Json = unknown;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function jsonEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => jsonEqual(a[k], b[k]));
  }
  return false;
}
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

function strip(e: YEntity, transient: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    if (v === undefined || transient.includes(k)) continue;
    out[k] = v;
  }
  if (out.className === 'edge-new') delete out.className;
  return out;
}

/** make a Y.Map hold exactly the entries of `obj` (JSON values; a changed value is replaced atomically) */
function diffFlat(m: Y.Map<unknown>, obj: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) {
      if (m.has(k)) m.delete(k);
    } else if (!jsonEqual(m.get(k), v)) m.set(k, clone(v));
  }
  for (const k of [...m.keys()]) if (obj[k] === undefined) m.delete(k);
}

function diffEntity(m: Y.Map<unknown>, clean: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(clean)) {
    if (k === 'data' && isObj(v)) {
      let sub = m.get('data');
      if (!(sub instanceof Y.Map)) {
        sub = new Y.Map<unknown>();
        m.set('data', sub);
      }
      diffFlat(sub as Y.Map<unknown>, v);
    } else if (!jsonEqual(m.get(k), v)) m.set(k, clone(v));
  }
  for (const k of [...m.keys()]) if (clean[k] === undefined) m.delete(k);
}

/** make `arr` list `desired` (ids), touching as little as possible */
export function syncOrder(arr: Y.Array<string>, desired: string[]): void {
  const cur = arr.toArray();
  if (jsonEqual(cur, desired)) return;
  const want = new Set(desired);
  const seen = new Set<string>();
  const del: number[] = [];
  cur.forEach((id, i) => {
    if (!want.has(id) || seen.has(id)) del.push(i);
    seen.add(id);
  });
  for (const i of del.reverse()) arr.delete(i, 1);
  const rem = arr.toArray();
  const present = new Set(rem);
  const target = desired.filter((id) => present.has(id));
  if (!jsonEqual(rem, target)) {
    arr.delete(0, arr.length);
    arr.insert(0, desired);
    return;
  }
  desired.forEach((id, i) => {
    if (rem[i] !== id) {
      arr.insert(i, [id]);
      rem.splice(i, 0, id);
    }
  });
}

function writeEntities(map: Y.Map<Y.Map<unknown>>, order: Y.Array<string>, list: YEntity[], transient: string[], cache?: WeakSet<object>): void {
  const ids = new Set(list.map((e) => e.id));
  for (const k of [...map.keys()]) if (!ids.has(k)) map.delete(k);
  for (const item of list) {
    if (cache?.has(item)) continue;
    let m = map.get(item.id);
    if (!m) {
      m = new Y.Map<unknown>();
      map.set(item.id, m);
    }
    diffEntity(m, strip(item, transient));
    cache?.add(item);
  }
  syncOrder(order, list.map((e) => e.id));
}

/** extra pages (page 2..n) live in `pages` (id -> Y.Map) ordered by `pageOrder`; page 1 keeps the original root layout, so old docs read unchanged */
const extraRoot = (doc: Y.Doc) => ({ pages: doc.getMap<Y.Map<unknown>>('pages'), pageOrder: doc.getArray<string>('pageOrder') });

function writeExtraPage(doc: Y.Doc, page: YPage, cache?: WeakSet<object>): void {
  const { pages, pageOrder } = extraRoot(doc);
  let m = pages.get(page.id);
  if (!m) {
    m = new Y.Map<unknown>();
    pages.set(page.id, m);
    m.set('nodes', new Y.Map<Y.Map<unknown>>());
    m.set('edges', new Y.Map<Y.Map<unknown>>());
    m.set('nodeOrder', new Y.Array<string>());
    m.set('edgeOrder', new Y.Array<string>());
  }
  if (m.get('name') !== page.name) m.set('name', page.name);
  if (!!m.get('flow') !== !!page.flow) m.set('flow', !!page.flow);
  const guides = Array.isArray(page.guides) && page.guides.length ? page.guides : null;
  if (!jsonEqual(m.get('guides') ?? null, guides)) {
    if (guides) m.set('guides', clone(guides));
    else m.delete('guides');
  }
  if (page.viewport !== undefined && m.get('viewport') === undefined) m.set('viewport', clone(page.viewport));
  writeEntities(m.get('nodes') as Y.Map<Y.Map<unknown>>, m.get('nodeOrder') as Y.Array<string>, page.nodes, NODE_TRANSIENT, cache);
  writeEntities(m.get('edges') as Y.Map<Y.Map<unknown>>, m.get('edgeOrder') as Y.Array<string>, page.edges, EDGE_TRANSIENT, cache);
  if (!pageOrder.toArray().includes(page.id)) pageOrder.push([page.id]);
}

function readExtraPages(doc: Y.Doc): YPage[] {
  const { pages, pageOrder } = extraRoot(doc);
  const out: YPage[] = [];
  const seen = new Set<string>();
  for (const id of pageOrder.toArray()) {
    const m = pages.get(id);
    if (!m || seen.has(id)) continue;
    seen.add(id);
    const viewport = m.get('viewport');
    const guides = m.get('guides');
    out.push({
      id,
      name: (m.get('name') as string | undefined) ?? 'Page',
      nodes: readOrdered(m.get('nodes') as Y.Map<Y.Map<unknown>>, m.get('nodeOrder') as Y.Array<string>),
      edges: readOrdered(m.get('edges') as Y.Map<Y.Map<unknown>>, m.get('edgeOrder') as Y.Array<string>),
      ...(viewport !== undefined ? { viewport } : {}),
      ...(m.get('flow') === true ? { flow: true } : {}),
      ...(Array.isArray(guides) && guides.length ? { guides } : {}),
    });
  }
  return out;
}

/** add the pages of `project` (after the first) that the doc does not have yet; returns how many. Existing pages are never touched. */
export function addMissingPages(doc: Y.Doc, project: YProject, origin: unknown = null): number {
  const have = new Set(extraRoot(doc).pages.keys());
  const rootId = doc.getMap<unknown>('meta').get('pageId');
  const todo = project.pages.slice(1).filter((p) => !have.has(p.id) && p.id !== rootId);
  if (!todo.length) return 0;
  doc.transact(() => { for (const p of todo) writeExtraPage(doc, p); }, origin);
  return todo.length;
}

/** delete nodes / edges (by id) from one page of the doc, in one transaction tagged `origin` */
export function deleteEntities(doc: Y.Doc, pageId: string, nodeIds: string[], edgeIds: string[], origin: unknown = null): void {
  doc.transact(() => {
    const r = root(doc);
    const extra = extraRoot(doc).pages.get(pageId);
    const place = extra && r.meta.get('pageId') !== pageId
      ? { nodes: extra.get('nodes') as Y.Map<Y.Map<unknown>>, edges: extra.get('edges') as Y.Map<Y.Map<unknown>>, nodeOrder: extra.get('nodeOrder') as Y.Array<string>, edgeOrder: extra.get('edgeOrder') as Y.Array<string> }
      : r;
    for (const [map, order, ids] of [[place.nodes, place.nodeOrder, nodeIds], [place.edges, place.edgeOrder, edgeIds]] as const) {
      const gone = new Set(ids);
      for (const id of ids) map.delete(id);
      const cur = order.toArray();
      for (let i = cur.length - 1; i >= 0; i--) if (gone.has(cur[i])) order.delete(i, 1);
    }
  }, origin);
}

const root = (doc: Y.Doc) => ({
  meta: doc.getMap<unknown>('meta'),
  nodes: doc.getMap<Y.Map<unknown>>('nodes'),
  edges: doc.getMap<Y.Map<unknown>>('edges'),
  nodeOrder: doc.getArray<string>('nodeOrder'),
  edgeOrder: doc.getArray<string>('edgeOrder'),
});

/** the doc has never been written (a brand-new file: the server seeds it from the stored JSON) */
export const isDocEmpty = (doc: Y.Doc): boolean => !doc.getMap('meta').has('pageId');

/**
 * Write `project` (its first page; with `pages: 'all'` every page) into `doc` as a diff, in ONE transaction tagged `origin`.
 * `cache` holds node / edge objects already known to be in the doc: they are skipped without a deep compare.
 */
export function writeProject(doc: Y.Doc, project: YProject, origin: unknown = null, cache?: WeakSet<object>, opts: { pages?: 'first' | 'all' } = {}): void {
  const page = project.pages[0];
  if (!page) return;
  doc.transact(() => {
    const r = root(doc);
    const seeded = r.meta.has('pageId');
    if (!seeded) {
      r.meta.set('pageId', page.id);
      r.meta.set('createdAt', project.createdAt);
      if (page.viewport !== undefined) r.meta.set('viewport', clone(page.viewport));
    }
    if (r.meta.get('name') !== project.name) r.meta.set('name', project.name);
    if (r.meta.get('pageName') !== page.name) r.meta.set('pageName', page.name);
    const flow = !!page.flow;
    if (!!r.meta.get('flow') !== flow || (flow && r.meta.get('flow') !== true)) r.meta.set('flow', flow);
    const settings = project.settings ?? null;
    if (!jsonEqual(r.meta.get('settings') ?? null, settings)) r.meta.set('settings', clone(settings));
    const guides = Array.isArray(page.guides) && page.guides.length ? page.guides : null;
    if (!jsonEqual(r.meta.get('guides') ?? null, guides)) {
      if (guides) r.meta.set('guides', clone(guides));
      else r.meta.delete('guides');
    }
    let assets = r.meta.get('assets');
    if (!(assets instanceof Y.Map)) {
      assets = new Y.Map<unknown>();
      r.meta.set('assets', assets);
    }
    diffFlat(assets as Y.Map<unknown>, (project.assets ?? {}) as Record<string, unknown>);
    writeEntities(r.nodes, r.nodeOrder, page.nodes, NODE_TRANSIENT, cache);
    writeEntities(r.edges, r.edgeOrder, page.edges, EDGE_TRANSIENT, cache);
    if (opts.pages === 'all') {
      const { pages, pageOrder } = extraRoot(doc);
      const rest = project.pages.slice(1);
      const keep = new Set(rest.map((p) => p.id));
      for (const k of [...pages.keys()]) if (!keep.has(k)) pages.delete(k);
      for (const p of rest) writeExtraPage(doc, p, cache);
      syncOrder(pageOrder, rest.map((p) => p.id));
    }
  }, origin);
}

function readOrdered(map: Y.Map<Y.Map<unknown>>, order: Y.Array<string>): YEntity[] {
  const out: YEntity[] = [];
  const seen = new Set<string>();
  for (const id of order.toArray()) {
    const m = map.get(id);
    if (m && !seen.has(id)) {
      seen.add(id);
      out.push(m.toJSON() as YEntity);
    }
  }
  for (const id of [...map.keys()].sort()) if (!seen.has(id)) out.push((map.get(id) as Y.Map<unknown>).toJSON() as YEntity);
  return out;
}

/** the "Project v2" document of the shared canvas. `id` is the file id; `updatedAt` defaults to now */
export function readProject(doc: Y.Doc, o: { id: string; updatedAt?: number }): YProject {
  const r = root(doc);
  const settings = r.meta.get('settings');
  const assets = (r.meta.get('assets') as Y.Map<unknown> | undefined)?.toJSON() ?? {};
  const pageId = (r.meta.get('pageId') as string | undefined) ?? 'pg_1';
  const viewport = r.meta.get('viewport');
  const guides = r.meta.get('guides');
  const page: YPage = {
    id: pageId,
    name: (r.meta.get('pageName') as string | undefined) ?? 'Page 1',
    nodes: readOrdered(r.nodes, r.nodeOrder),
    edges: readOrdered(r.edges, r.edgeOrder),
    ...(viewport !== undefined ? { viewport } : {}),
    ...(r.meta.get('flow') === true ? { flow: true } : {}),
    ...(Array.isArray(guides) && guides.length ? { guides } : {}),
  };
  return {
    version: 2,
    id: o.id,
    name: (r.meta.get('name') as string | undefined) ?? 'Untitled',
    createdAt: (r.meta.get('createdAt') as number | undefined) ?? 0,
    updatedAt: o.updatedAt ?? Date.now(),
    activePageId: pageId,
    pages: [page, ...readExtraPages(doc)],
    ...(settings !== undefined && settings !== null ? { settings } : {}),
    ...(Object.keys(assets).length ? { assets } : {}),
  };
}
