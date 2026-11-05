import { applyEdgeChanges, applyNodeChanges, type EdgeChange, type NodeChange } from '@xyflow/react';
import { create } from 'zustand';
import type { Api } from '../api/api';
import type { VersionMeta } from '../api/types';
import type { Role } from '../lib/roles';
import type { DiagramEdge, DiagramNode, Project } from '../types';
import { changeNote, pageOf, playNext, playStart, sortAscending, stepSelection, type ChangeNote } from '../lib/versionTimeline';
import { ApiError } from '../api/client';
import { t } from '../i18n';
import { useDiffStore } from './diffStore';

/**
 * The version timeline: which versions exist, which one is shown on the canvas, play / pause.
 * Previewing never touches the live document: the canvas swaps in `preview` while it is set (see Canvas), the editor store,
 * Yjs state, undo stack and autosave keep running underneath, and clearing `preview` brings the live view back unchanged.
 */
const errText = (e: unknown): string => (e instanceof ApiError ? e.message : t('Something went wrong'));
export type TimelineClient = Pick<Api, 'listVersions' | 'getVersion'>;
export const PLAY_INTERVAL_MS = 1600;
/** the diff overlay is shared with "Compare": the timeline only clears it when it is the one that set it */
const DIFF_OWNER = 'timeline';

export interface TimelineState {
  open: boolean;
  fileId: string | null;
  role: Role;
  /** the file's current server version (marked on its point) */
  currentVersion: number;
  /** oldest first */
  items: VersionMeta[];
  loading: boolean;
  error: string | null;
  /** user id -> display name (best effort: VersionMeta only carries the id) */
  authors: Record<string, string>;
  /** index into `items`; null = the live document */
  selected: number | null;
  /** the version drawn on the canvas instead of the live document (null = live) */
  preview: { version: number; nodes: DiagramNode[]; edges: DiagramEdge[] } | null;
  note: ChangeNote | null;
  /** version -> change summary of the points that were visited (shown in the tooltip of the others once known) */
  summaries: Record<number, string>;
  previewLoading: boolean;
  playing: boolean;
}
const initial: TimelineState = { open: false, fileId: null, role: 'viewer', currentVersion: 0, items: [], loading: false, error: null, authors: {}, selected: null, preview: null, note: null, summaries: {}, previewLoading: false, playing: false };
export const useTimeline = create<TimelineState>(() => ({ ...initial }));

let client: TimelineClient | null = null;
let activePage = '';
let token = 0; // bumped on every select / close: an answer for an older request is dropped
let timer: ReturnType<typeof setTimeout> | null = null;
const docs = new Map<number, Project>();
const set = (p: Partial<TimelineState>) => useTimeline.setState(p);
const get = () => useTimeline.getState();
const clearTimer = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};

async function docOf(fileId: string, version: number): Promise<Project> {
  const hit = docs.get(version);
  if (hit) return hit;
  const doc = (await client!.getVersion(fileId, version)).data;
  docs.set(version, doc);
  return doc;
}

export interface OpenOptions {
  fileId: string;
  role: Role;
  currentVersion: number;
  client: TimelineClient;
  /** the page that is open (a version is drawn on the same page) */
  activePageId: string;
  authors?: Record<string, string>;
}
/** load the history and show the bar (on the live view) */
export async function openTimeline(o: OpenOptions): Promise<void> {
  closeTimeline();
  client = o.client;
  activePage = o.activePageId;
  const mine = ++token;
  set({ ...initial, open: true, fileId: o.fileId, role: o.role, currentVersion: o.currentVersion, loading: true, authors: o.authors ?? {} });
  try {
    const items = sortAscending(await o.client.listVersions(o.fileId));
    if (mine === token) set({ items, loading: false });
  } catch (e) {
    if (mine === token) set({ loading: false, error: errText(e) });
  }
}

/** merge in user names once they arrive */
export const setAuthors = (names: Record<string, string>): void => set({ authors: { ...get().authors, ...names } });

/** leave: the live view comes back exactly as it was (it was never replaced) */
export function closeTimeline(): void {
  token++;
  clearTimer();
  clearPreviewDiff();
  docs.clear();
  client = null;
  useTimeline.setState({ ...initial });
}

function clearPreviewDiff(): void {
  if (useDiffStore.getState().owner === DIFF_OWNER) useDiffStore.getState().clear();
}

/** show version at `index` (null = back to live), highlighted against the version before it */
export async function select(index: number | null): Promise<void> {
  const s = get();
  if (!s.open) return;
  const mine = ++token;
  if (index === null || !s.items[index]) {
    clearTimer();
    clearPreviewDiff();
    set({ selected: null, preview: null, note: null, previewLoading: false, playing: false, error: null });
    return;
  }
  const meta = s.items[index];
  set({ selected: index, previewLoading: true, error: null });
  try {
    const prevMeta = s.items[index - 1];
    const [doc, prev] = await Promise.all([docOf(s.fileId!, meta.version), prevMeta ? docOf(s.fileId!, prevMeta.version) : Promise.resolve(null)]);
    if (mine !== token) return;
    const note = changeNote(prev, doc);
    set({ preview: { version: meta.version, ...pageOf(doc, activePage) }, note, summaries: { ...get().summaries, [meta.version]: note.summary }, previewLoading: false });
    if (note.diff && !note.diff.isEmpty) useDiffStore.getState().show(note.diff, prevMeta ? `v${prevMeta.version}` : '', `v${meta.version}`, DIFF_OWNER);
    else clearPreviewDiff();
  } catch (e) {
    if (mine !== token) return;
    clearTimer();
    set({ previewLoading: false, playing: false, error: errText(e) });
  }
}

export const step = (dir: -1 | 1): Promise<void> => select(stepSelection(get().selected, dir, get().items.length));

export function pause(): void {
  clearTimer();
  set({ playing: false });
}

async function advance(): Promise<void> {
  timer = null;
  const s = get();
  if (!s.playing) return;
  const next = playNext(s.selected, s.items.length);
  if (next === null) return pause();
  await select(next);
  const after = get();
  if (!after.playing || after.selected !== next) return; // paused / moved by hand / failed meanwhile
  if (playNext(next, after.items.length) === null) return pause(); // reached the newest version: stop
  timer = setTimeout(() => void advance(), PLAY_INTERVAL_MS);
}

/** play / pause: steps oldest to newest, one version per interval, and stops on the newest */
export async function togglePlay(): Promise<void> {
  const s = get();
  if (s.playing) return pause();
  const start = playStart(s.selected, s.items.length);
  if (start === null) return;
  set({ playing: true });
  if (start !== s.selected) {
    await select(start);
    if (!get().playing || get().selected !== start) return;
  }
  if (playNext(start, get().items.length) === null) return pause();
  timer = setTimeout(() => void advance(), PLAY_INTERVAL_MS);
}

/** a version was restored: the history changed, show the live (restored) document */
export async function afterRestore(): Promise<void> {
  const s = get();
  if (!s.open || !s.fileId || !client) return;
  await select(null); // bumps `token`: read it after, or the fresh list below would always count as stale
  const mine = token;
  try {
    const items = sortAscending(await client.listVersions(s.fileId));
    // the restore made the newest version the live one
    if (mine === token) set({ items, currentVersion: items.length ? items[items.length - 1].version : s.currentVersion });
  } catch {
    /* the old list stays */
  }
}

/** React Flow reports measured sizes and selection for the previewed nodes: keep those on the preview copy, never on the live document */
export function previewNodesChange(changes: NodeChange<DiagramNode>[]): void {
  const p = get().preview;
  const ok = changes.filter((c) => c.type === 'dimensions' || c.type === 'select');
  if (p && ok.length) set({ preview: { ...p, nodes: applyNodeChanges(ok, p.nodes) } });
}
export function previewEdgesChange(changes: EdgeChange<DiagramEdge>[]): void {
  const p = get().preview;
  const ok = changes.filter((c) => c.type === 'select');
  if (p && ok.length) set({ preview: { ...p, edges: applyEdgeChanges(ok, p.edges) } });
}
/** true while a past version is drawn (the editor is read-only then) */
export const usePreviewing = (): boolean => useTimeline((s) => s.preview !== null);
