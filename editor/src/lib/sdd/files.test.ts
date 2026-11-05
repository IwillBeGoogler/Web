import { describe, expect, it, vi } from 'vitest';
import { pickSddFile, saveSddFile, type FileHandleLike } from './fileAccess';
import { projectSignature } from './signature';
import { assetFromBytes, isAllowedIconMime } from './assets';
import { monitoringStack } from '../../templates/monitoringStack';
import { migrateV1 } from '../project';

const bytes = new Uint8Array([1, 2, 3]);
const handleOf = (name = 'a.sdd') => {
  const written: Uint8Array[] = [];
  const h: FileHandleLike = {
    name,
    createWritable: async () => ({ write: async (d) => void written.push(d as Uint8Array), close: async () => undefined }),
    getFile: async () => new File([bytes], name),
  };
  return { h, written };
};

describe('saveSddFile', () => {
  it('re-saves to the same handle without a picker', async () => {
    const { h, written } = handleOf('proj.sdd');
    const picker = vi.fn();
    const r = await saveSddFile(bytes, 'x.sdd', { handle: h }, { showSaveFilePicker: picker });
    expect(r).toMatchObject({ method: 'handle', name: 'proj.sdd', handle: h });
    expect(written[0]).toEqual(bytes);
    expect(picker).not.toHaveBeenCalled();
  });
  it('uses the File System Access picker for first save and Save as', async () => {
    const { h, written } = handleOf('picked.sdd');
    const picker = vi.fn().mockResolvedValue(h);
    const r = await saveSddFile(bytes, 'proj.sdd', { saveAs: true, handle: handleOf().h }, { showSaveFilePicker: picker });
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'proj.sdd' } as never));
    expect(r).toMatchObject({ method: 'picker', name: 'picked.sdd' });
    expect(written).toHaveLength(1);
  });
  it('cancelled picker returns null', async () => {
    const picker = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    expect(await saveSddFile(bytes, 'p.sdd', {}, { showSaveFilePicker: picker })).toBeNull();
  });
  it('falls back to a download when the API is unavailable', async () => {
    const download = vi.fn();
    const r = await saveSddFile(bytes, 'p.sdd', {}, { download } as never);
    expect(download).toHaveBeenCalledWith(bytes, 'p.sdd');
    expect(r).toMatchObject({ method: 'download', name: 'p.sdd', handle: null });
  });
});

describe('pickSddFile', () => {
  it('uses showOpenFilePicker when available', async () => {
    const { h } = handleOf('o.sdd');
    const r = await pickSddFile({ showOpenFilePicker: vi.fn().mockResolvedValue([h]) } as never);
    expect(r?.name).toBe('o.sdd');
    expect(r?.handle).toBe(h);
    expect(r?.bytes).toEqual(bytes);
  });
  it('cancel returns null; fallback uses an <input type=file accept=.sdd>', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    expect(await pickSddFile({ showOpenFilePicker: vi.fn().mockRejectedValue(abort) } as never)).toBeNull();
    const file = new File([bytes], 'fallback.sdd');
    const r = await pickSddFile({ chooseFile: vi.fn().mockResolvedValue(file) } as never);
    expect(r?.name).toBe('fallback.sdd');
    expect(r?.handle).toBeNull();
    expect(r?.bytes).toEqual(bytes);
  });
});

describe('projectSignature (dirty tracking)', () => {
  const base = () => migrateV1(monitoringStack(), 'P', 1);
  it('ignores selection, viewport, timestamps and transient edge classes', () => {
    const a = base();
    const b = structuredClone(a);
    b.updatedAt = 999;
    b.pages[0].viewport = { x: 5, y: 5, zoom: 2 };
    b.pages[0].nodes[0] = { ...b.pages[0].nodes[0], selected: true, dragging: true, measured: { width: 9, height: 9 } };
    b.pages[0].edges[0] = { ...b.pages[0].edges[0], className: 'edge-new', selected: true };
    expect(projectSignature(b)).toBe(projectSignature(a));
  });
  it('changes on content edits: move, rename, new page, settings, name', () => {
    const a = base();
    const sig = projectSignature(a);
    const moved = structuredClone(a);
    moved.pages[0].nodes[0].position = { x: 1234, y: 5 };
    const renamed = structuredClone(a);
    renamed.name = 'Other';
    const page = structuredClone(a);
    page.pages.push({ id: 'z', name: 'Z', nodes: [], edges: [] });
    const set = structuredClone(a);
    set.settings = { theme: 'dark' };
    for (const x of [moved, renamed, page, set]) expect(projectSignature(x)).not.toBe(sig);
  });
});

describe('custom icon assets', () => {
  it('content-addressed by sha256 and mime-checked', () => {
    const a = assetFromBytes(new Uint8Array([137, 80, 78, 71]), 'image/png');
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.asset.mime).toBe('image/png');
    expect(atob(a.asset.data!)).toBe(String.fromCharCode(137, 80, 78, 71));
    expect(assetFromBytes(new Uint8Array([137, 80, 78, 71]), 'image/png').hash).toBe(a.hash); // dedupe
    expect(isAllowedIconMime('image/png')).toBe(true);
    expect(isAllowedIconMime('image/svg+xml')).toBe(true);
    expect(isAllowedIconMime('text/html')).toBe(false);
    expect(() => assetFromBytes(bytes, 'text/html')).toThrow(/type/i);
    expect(() => assetFromBytes(new Uint8Array(600 * 1024), 'image/png')).toThrow(/large/i);
  });
});
