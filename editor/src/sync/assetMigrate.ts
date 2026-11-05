import { registerCustomIcons } from '../data/customIcons';
import { storeImage, hasAssetUploader } from '../lib/sdd/assets';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramNode, ProjectAsset } from '../types';

const b64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const remap = (nodes: DiagramNode[], ids: Map<string, string>): DiagramNode[] => {
  let changed = false;
  const out = nodes.map((n) => {
    const to = typeof n.data.iconId === 'string' && n.data.iconId.startsWith('asset:') ? ids.get(n.data.iconId.slice(6)) : undefined;
    if (!to) return n;
    changed = true;
    return { ...n, data: { ...n.data, iconId: `asset:${to}` } };
  });
  return changed ? out : nodes;
};

/**
 * Embedded editor, document opened with inline data-URI images (older saves, imported .sdd): upload each one to the asset
 * store and rewrite the document in ONE store update (assets map + every page's icon references), so it is one change/save.
 * No-op without an uploader or inline images. Uploads that fail stay inline (tried again later). Returns whether it rewrote.
 */
export async function migrateInlineAssets(fileId: string): Promise<boolean> {
  if (!hasAssetUploader()) return false;
  const inline = Object.entries(useDiagramStore.getState().assets).filter(([, a]) => typeof a.data === 'string');
  if (!inline.length) return false;
  const ids = new Map<string, string>(); // old hash -> stored hash
  const stored: Record<string, ProjectAsset> = {};
  for (const [hash, a] of inline) {
    try {
      const r = await storeImage(b64ToBytes(a.data!), a.mime);
      ids.set(hash, r.hash);
      stored[r.hash] = r.asset;
    } catch {
      /* too large / refused / offline: stays inline */
    }
  }
  if (!ids.size) return false;
  const s = useDiagramStore.getState();
  if (s.projectId !== fileId) return false; // the editor moved on to another file
  const assets: Record<string, ProjectAsset> = {};
  for (const [h, a] of Object.entries(s.assets)) if (!ids.has(h)) assets[h] = a; // an asset added while uploading is kept
  Object.assign(assets, stored);
  registerCustomIcons(stored);
  useDiagramStore.setState({
    assets,
    nodes: remap(s.nodes, ids),
    stash: Object.fromEntries(Object.entries(s.stash).map(([id, pg]) => [id, { ...pg, nodes: remap(pg.nodes, ids) }])),
  });
  return true;
}
