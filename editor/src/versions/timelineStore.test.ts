import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VersionFull, VersionMeta } from '../api/types';
import { useDiagramStore } from '../store/diagramStore';
import type { Project } from '../types';
import { useDiffStore } from './diffStore';
import { PLAY_INTERVAL_MS, afterRestore, closeTimeline, openTimeline, previewNodesChange, select, step, togglePlay, useTimeline } from './timelineStore';

const meta = (version: number, extra: Partial<VersionMeta> = {}): VersionMeta => ({ version, name: 'P', label: null, createdBy: 'u1', createdAt: 1_700_000_000_000 + version * 1000, ...extra });
const mk = (labels: string[]): Project =>
  ({ version: 2, id: 'f', name: 'F', createdAt: 1, updatedAt: 1, activePageId: 'p', pages: [{ id: 'p', name: 'P', nodes: labels.map((l, i) => ({ id: l, type: 'icon', position: { x: i * 100, y: 0 }, data: { label: l } })), edges: [] }] }) as unknown as Project;
const DOCS: Record<number, string[]> = { 1: ['A'], 2: ['A', 'B'], 3: ['B'], 4: ['B', 'C'] };
function client() {
  return {
    listVersions: vi.fn(async () => [meta(4), meta(1), meta(3, { named: true, label: 'Release' }), meta(2)]), // unsorted on purpose
    getVersion: vi.fn(async (_id: string, v: number) => ({ ...meta(v), data: mk(DOCS[v]) }) as VersionFull),
  };
}
const open = async (c = client()) => {
  await openTimeline({ fileId: 'f', role: 'editor', currentVersion: 4, client: c, activePageId: useDiagramStore.getState().activePageId });
  return c;
};
beforeEach(() => { useDiagramStore.getState().reset(); useDiffStore.getState().clear(); closeTimeline(); });
afterEach(() => { closeTimeline(); vi.useRealTimers(); });

describe('timelineStore: afterRestore', () => {
  it('shows the live document and the history with the version the restore created', async () => {
    const c = await open();
    await select(1);
    c.listVersions.mockResolvedValueOnce([meta(5, { label: 'Restored from v2' }), meta(4), meta(3), meta(2), meta(1)]);
    await afterRestore();
    const s = useTimeline.getState();
    expect(s.selected).toBeNull();
    expect(s.preview).toBeNull();
    expect(s.items.map((v) => v.version)).toEqual([1, 2, 3, 4, 5]);
    expect(s.currentVersion).toBe(5);
  });
});

describe('timelineStore: open / select', () => {
  it('loads the history oldest first and starts on the live document', async () => {
    await open();
    const s = useTimeline.getState();
    expect(s.items.map((v) => v.version)).toEqual([1, 2, 3, 4]);
    expect(s.selected).toBeNull();
    expect(s.preview).toBeNull();
  });
  it('a failing history load shows an error and keeps the bar usable', async () => {
    await openTimeline({ fileId: 'f', role: 'viewer', currentVersion: 1, client: { listVersions: vi.fn(async () => { throw new Error('x'); }), getVersion: vi.fn() } as never, activePageId: 'p' });
    expect(useTimeline.getState().error).toBeTruthy();
    expect(useTimeline.getState().open).toBe(true);
  });
  it('selecting a point previews it and highlights it against the version before', async () => {
    const c = await open();
    await select(1);
    const s = useTimeline.getState();
    expect(s.preview?.version).toBe(2);
    expect(s.preview?.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    expect(s.note?.summary).toBe('1 added');
    expect(useDiffStore.getState()).toMatchObject({ from: 'v1', to: 'v2', owner: 'timeline' });
    expect(useDiffStore.getState().diff?.nodes.added.map((n) => n.id)).toEqual(['B']);
    await select(2); // v3 removes A: shown as removed (ghost) data
    expect(useDiffStore.getState().diff?.nodes.removed.map((n) => n.id)).toEqual(['A']);
    expect(c.getVersion).toHaveBeenCalledTimes(3); // v2+v1, then v3 (v2 cached)
  });
  it('the first version has no diff to show', async () => {
    await open();
    await select(0);
    expect(useTimeline.getState().note?.summary).toBe('First version');
    expect(useDiffStore.getState().diff).toBeNull();
  });
  it('previewing leaves the live document, its history and selection untouched; leaving restores the view', async () => {
    const live = useDiagramStore.getState();
    live.addNode({ id: 'LIVE', type: 'icon', position: { x: 5, y: 5 }, data: { label: 'Live' } } as never);
    const before = useDiagramStore.getState();
    const snap = JSON.stringify([before.nodes, before.edges, before.past.length, before.future.length]);
    await open();
    await select(1);
    previewNodesChange([{ type: 'select', id: 'A', selected: true }, { type: 'remove', id: 'A' }, { type: 'position', id: 'A', position: { x: 9, y: 9 } }]);
    const p = useTimeline.getState().preview!;
    expect(p.nodes.find((n) => n.id === 'A')?.selected).toBe(true); // selection stays on the copy
    expect(p.nodes.find((n) => n.id === 'A')?.position).toEqual({ x: 0, y: 0 }); // moves / removals are ignored
    const now = useDiagramStore.getState();
    expect(JSON.stringify([now.nodes, now.edges, now.past.length, now.future.length])).toBe(snap);
    closeTimeline();
    expect(useTimeline.getState().preview).toBeNull();
    expect(useDiffStore.getState().diff).toBeNull();
    expect(JSON.stringify([useDiagramStore.getState().nodes])).toBe(JSON.stringify([before.nodes]));
  });
  it('remote edits that arrive during a preview land in the live document and are there on exit', async () => {
    await open();
    await select(0);
    useDiagramStore.getState().addNode({ id: 'REMOTE', type: 'icon', position: { x: 1, y: 1 }, data: { label: 'Remote' } } as never);
    expect(useTimeline.getState().preview?.nodes.map((n) => n.id)).toEqual(['A']); // the preview itself does not change
    closeTimeline();
    expect(useDiagramStore.getState().nodes.map((n) => n.id)).toContain('REMOTE');
  });
  it('a Compare overlay that is not ours survives leaving the timeline', async () => {
    await open();
    useDiffStore.getState().show({ nodes: { added: [], removed: [], changed: [] }, edges: { added: [], removed: [], changed: [] }, nameChanged: null, isEmpty: true }, 'a', 'b');
    await select(0);
    closeTimeline();
    expect(useDiffStore.getState().from).toBe('a');
  });
  it('a slow answer for a point that is no longer selected is dropped', async () => {
    const c = client();
    let release: (v: VersionFull) => void = () => undefined;
    c.getVersion.mockImplementationOnce(() => new Promise<VersionFull>((r) => { release = r; }));
    await open(c);
    const first = select(0);
    await select(2);
    release({ ...meta(1), data: mk(DOCS[1]) } as VersionFull);
    await first;
    expect(useTimeline.getState().preview?.version).toBe(3);
  });
  it('a failed version load reports and keeps the previous preview', async () => {
    const c = client();
    await open(c);
    await select(0);
    c.getVersion.mockRejectedValueOnce(new Error('boom'));
    await select(1);
    expect(useTimeline.getState().error).toBeTruthy();
    expect(useTimeline.getState().previewLoading).toBe(false);
  });
});

describe('timelineStore: keyboard stepping and play', () => {
  it('step moves between points, to live at the end and back', async () => {
    await open();
    await step(-1);
    expect(useTimeline.getState().selected).toBe(3);
    await step(-1);
    expect(useTimeline.getState().selected).toBe(2);
    await step(1);
    await step(1);
    expect(useTimeline.getState().selected).toBeNull();
    expect(useTimeline.getState().preview).toBeNull();
  });
  it('play steps every interval and stops on the newest version', async () => {
    vi.useFakeTimers();
    await open();
    await togglePlay();
    expect(useTimeline.getState()).toMatchObject({ playing: true, selected: 0 });
    for (const want of [1, 2, 3]) {
      await vi.advanceTimersByTimeAsync(PLAY_INTERVAL_MS);
      expect(useTimeline.getState().selected).toBe(want);
    }
    expect(useTimeline.getState().playing).toBe(false);
    await vi.advanceTimersByTimeAsync(PLAY_INTERVAL_MS * 3);
    expect(useTimeline.getState().selected).toBe(3);
  });
  it('pause stops further steps; closing stops the timer', async () => {
    vi.useFakeTimers();
    await open();
    await togglePlay();
    await togglePlay();
    expect(useTimeline.getState().playing).toBe(false);
    await vi.advanceTimersByTimeAsync(PLAY_INTERVAL_MS * 2);
    expect(useTimeline.getState().selected).toBe(0);
    await togglePlay();
    closeTimeline();
    await vi.advanceTimersByTimeAsync(PLAY_INTERVAL_MS * 2);
    expect(useTimeline.getState().open).toBe(false);
  });
});
