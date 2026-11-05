import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAssetUploader } from '../lib/sdd/assets';
import { useDiagramStore } from '../store/diagramStore';
import { migrateInlineAssets } from './assetMigrate';

const OLD = 'a'.repeat(64);
const NEW = 'b'.repeat(64);

describe('migrateInlineAssets', () => {
  afterEach(() => setAssetUploader(null));
  it('uploads inline images and rewrites assets + icon refs in one store update', async () => {
    const s = useDiagramStore.getState();
    const node = { id: 'n1', type: 'icon', position: { x: 0, y: 0 }, data: { label: 'x', iconId: `asset:${OLD}` } };
    useDiagramStore.setState({ projectId: 'f1', assets: { [OLD]: { mime: 'image/png', data: btoa('png') } }, nodes: [node as never], stash: { p2: { nodes: [{ ...node, id: 'n2' } as never], edges: [], past: [], future: [] } } });
    const up = vi.fn(async () => ({ hash: NEW, mime: 'image/png' }));
    setAssetUploader(up);
    let updates = 0;
    const unsub = useDiagramStore.subscribe(() => updates++);
    expect(await migrateInlineAssets('f1')).toBe(true);
    unsub();
    expect(updates).toBe(1);
    const n = useDiagramStore.getState();
    expect(n.assets).toEqual({ [NEW]: { mime: 'image/png' } });
    expect(n.nodes[0]!.data.iconId).toBe(`asset:${NEW}`);
    expect(n.stash.p2!.nodes[0]!.data.iconId).toBe(`asset:${NEW}`);
    expect(await migrateInlineAssets('f1')).toBe(false);
    expect(up).toHaveBeenCalledOnce();
    useDiagramStore.setState(s);
  });
  it('is a no-op standalone and keeps images whose upload fails', async () => {
    useDiagramStore.setState({ projectId: 'f1', assets: { [OLD]: { mime: 'image/png', data: btoa('png') } } });
    expect(await migrateInlineAssets('f1')).toBe(false);
    setAssetUploader(async () => { throw new Error('offline'); });
    expect(await migrateInlineAssets('f1')).toBe(false);
    expect(useDiagramStore.getState().assets[OLD]!.data).toBeTruthy();
  });
});
