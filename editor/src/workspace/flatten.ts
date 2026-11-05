import { newId } from '../lib/graph';
import type { Project } from '../types';
import { getProjectSync, listWsProjects, loadFile, loadTree, saveFile, saveTree, type Store } from './storage';
import { dominantKind } from './tree';
import type { ProjectTree, WsFile } from './types';

/** version marker of the "Project › Files" model (flat files, one canvas each) */
export const FLAT_KEY = 'sdd:ws:flat';
export const FLAT_VERSION = 1;

/** one single-page document per page of `doc`; the original id keeps the FIRST page. Names are "<file> — <page>". Single-page docs come back untouched. */
export function splitIntoFiles(doc: Project, makeId: () => string = () => newId('fil')): Project[] {
  if (doc.pages.length <= 1) return [doc];
  return doc.pages.map((page, i) => ({
    ...structuredClone(doc),
    id: i === 0 ? doc.id : makeId(),
    name: `${doc.name} — ${page.name}`,
    pages: [structuredClone(page)],
    activePageId: page.id,
  }));
}

const keyOf = (n: string) => n.trim().toLowerCase();

/**
 * One-time, versioned migration to Project › Files: every file with N > 1 pages becomes N files in the same project
 * (the original id keeps the first page), and folders are flattened (files keep their names; the folder path is prefixed
 * only on a name clash). Server-backed projects are skipped: the server runs the same migration and the next sync pulls it.
 */
export function flattenWorkspace(st: Store): { split: number; flattened: number } {
  const out = { split: 0, flattened: 0 };
  try {
    if (Number(st.getItem(FLAT_KEY) ?? 0) >= FLAT_VERSION) return out;
  } catch {
    return out;
  }
  for (const project of listWsProjects(st)) {
    if (getProjectSync(st, project.id)) continue;
    let tree = loadTree(st, project.id);
    // 1. folders -> flat (names first, so the split below sees the final names)
    if (tree.folders.length || tree.files.some((f) => f.folderId !== null)) {
      const folderPath = (id: string | null): string => {
        const parts: string[] = [];
        let cur = id;
        for (let i = 0; cur && i < 64; i++) {
          const f = tree.folders.find((x) => x.id === cur);
          if (!f) break;
          parts.unshift(f.name);
          cur = f.parentId;
        }
        return parts.join(' / ');
      };
      const moved = tree.files.filter((f) => f.folderId !== null).length;
      const counts = new Map<string, number>();
      for (const f of tree.files) counts.set(keyOf(f.name), (counts.get(keyOf(f.name)) ?? 0) + 1);
      const taken = new Set<string>();
      const files: WsFile[] = [...tree.files]
        .sort((a, b) => Number(a.folderId !== null) - Number(b.folderId !== null) || a.position - b.position)
        .map((f) => {
          let name = f.name;
          if (f.folderId !== null && (counts.get(keyOf(f.name)) ?? 0) > 1) name = `${folderPath(f.folderId)} / ${f.name}`;
          let unique = name;
          for (let n = 2; taken.has(keyOf(unique)); n++) unique = `${name} (${n})`;
          taken.add(keyOf(unique));
          return { ...f, name: unique, folderId: null };
        });
      tree = { folders: [], files: files.map((f, i) => ({ ...f, position: i })) };
      for (const f of tree.files) {
        const doc = loadFile(st, f.id);
        if (doc && doc.name !== f.name) saveFile(st, { ...doc, name: f.name }, doc.updatedAt);
      }
      out.flattened += moved;
      saveTree(st, project.id, tree, project.updatedAt);
    }
    // 2. pages -> files
    const next: WsFile[] = [];
    for (const f of tree.files) {
      next.push(f);
      const doc = loadFile(st, f.id);
      if (!doc || doc.pages.length <= 1) continue;
      const parts = splitIntoFiles(doc);
      parts.forEach((d, i) => {
        const saved = saveFile(st, d, doc.updatedAt);
        const entry: WsFile = { ...f, id: d.id, name: d.name, kind: dominantKind(saved.pages as { nodes: { type?: string }[] }[]), pageCount: 1, position: f.position + (i + 1) / (parts.length + 1) };
        if (i === 0) next[next.length - 1] = { ...entry, position: f.position };
        else next.push(entry);
      });
      out.split++;
    }
    const final: ProjectTree = { folders: tree.folders, files: next.sort((a, b) => a.position - b.position).map((f, i) => ({ ...f, position: i })) };
    saveTree(st, project.id, final, project.updatedAt);
  }
  try {
    st.setItem(FLAT_KEY, String(FLAT_VERSION));
  } catch {
    /* ignore */
  }
  return out;
}
