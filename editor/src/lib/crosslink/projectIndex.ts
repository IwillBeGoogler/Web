import { loadFile } from '../../workspace/storage';
import { useWorkspace } from '../../workspace/store';
import type { WsFile } from '../../workspace/types';
import { useDiagramStore } from '../../store/diagramStore';
import { indexPage, type IdxFile, type ProjectIndex } from './links';

const cache = new Map<string, IdxFile>();

/** index of a stored file; cached by its `updatedAt` so a badge re-render does not re-parse the document */
function storedFile(f: WsFile): IdxFile | null {
  const key = `${f.id}:${f.updatedAt}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let doc;
  try { doc = loadFile(localStorage, f.id); } catch { doc = null; }
  if (!doc) return null;
  const idx: IdxFile = { id: f.id, name: f.name, kind: f.kind, pages: doc.pages.map(indexPage) };
  for (const k of cache.keys()) if (k.startsWith(`${f.id}:`)) cache.delete(k);
  cache.set(key, idx);
  return idx;
}

/** the open file as the canvas holds it right now (unsaved edits included) */
export function liveFile(): IdxFile {
  const s = useDiagramStore.getState();
  const ws = useWorkspace.getState();
  const meta = ws.tree.files.find((f) => f.id === s.projectId);
  return {
    id: s.projectId ?? '',
    name: meta?.name ?? s.projectName ?? 'This file',
    kind: meta?.kind,
    pages: s.pages.map((p) => indexPage({ id: p.id, name: p.name, nodes: p.id === s.activePageId ? s.nodes : s.stash[p.id]?.nodes ?? [] })),
  };
}

/** every file of the open workspace project (the open one live, the others from storage) */
export function buildProjectIndex(): ProjectIndex {
  const cur = liveFile();
  const files: IdxFile[] = [cur];
  for (const f of useWorkspace.getState().tree.files) {
    if (f.id === cur.id) continue;
    const idx = storedFile(f);
    if (idx) files.push(idx);
  }
  return { files };
}

export const currentPlace = (): { fileId: string; pageId: string } => {
  const s = useDiagramStore.getState();
  return { fileId: s.projectId ?? '', pageId: s.activePageId };
};
