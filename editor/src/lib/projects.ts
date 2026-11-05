import type { DiagramContent, Project } from '../types';
import { createProject, duplicatePages, migrateV1, parseProject, serializeProject } from './project';
import { newId } from './graph';
import { parseDiagram } from './serialization';

export const INDEX_KEY = 'sdd:index';
export const LEGACY_KEY = 'system-design-diagram:v1';
const projectKey = (id: string) => `sdd:project:${id}`;

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  pageCount: number;
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function readIndex(st: Store): ProjectMeta[] {
  try {
    const v = JSON.parse(st.getItem(INDEX_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((m) => m && typeof m.id === 'string') : [];
  } catch {
    return [];
  }
}
const writeIndex = (st: Store, l: ProjectMeta[]) => st.setItem(INDEX_KEY, JSON.stringify(l));
const meta = (p: Project): ProjectMeta => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, pageCount: p.pages.length });

export function listProjects(st: Store): ProjectMeta[] {
  return readIndex(st).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadProject(st: Store, id: string): Project | null {
  try {
    const t = st.getItem(projectKey(id));
    if (!t) return null;
    const r = parseProject(t);
    return r.ok ? { ...r.project, id } : null;
  } catch {
    return null;
  }
}

export function saveProject(st: Store, p: Project, now = Date.now()): Project {
  const saved: Project = { ...p, updatedAt: now };
  try {
    st.setItem(projectKey(p.id), serializeProject(saved));
    const idx = readIndex(st).filter((m) => m.id !== p.id);
    writeIndex(st, [...idx, meta(saved)]);
  } catch {
    /* quota: ignore */
  }
  return saved;
}

export function createStoredProject(st: Store, name: string): Project {
  return saveProject(st, createProject(name));
}

export function renameProject(st: Store, id: string, name: string): void {
  const p = loadProject(st, id);
  if (p) saveProject(st, { ...p, name });
}

export function duplicateProject(st: Store, id: string): Project | null {
  const p = loadProject(st, id);
  if (!p) return null;
  const pages = duplicatePages(p.pages);
  const idx = p.pages.findIndex((pg) => pg.id === p.activePageId);
  const copy: Project = { ...structuredClone(p), id: newId('prj'), name: `${p.name} (copy)`, pages, activePageId: pages[Math.max(idx, 0)].id, createdAt: Date.now() };
  return saveProject(st, copy);
}

export function deleteProject(st: Store, id: string): void {
  st.removeItem(projectKey(id));
  writeIndex(st, readIndex(st).filter((m) => m.id !== id));
}

/** Move the old single-diagram autosave into a project called "Untitled" (once). */
export function migrateLegacy(st: Store & { getItem: Storage['getItem'] }): Project | null {
  const done = 'sdd:legacy-migrated';
  if (st.getItem(done)) return null;
  const text = st.getItem(LEGACY_KEY);
  if (!text) return null;
  st.setItem(done, '1');
  const r = parseDiagram(text);
  if (!r.ok) return null;
  return saveProject(st, migrateV1(r.diagram, 'Untitled'));
}

/** New project whose first page is the given template content. */
export function createProjectFromTemplate(st: Store, name: string, content: DiagramContent, pageName = 'Page 1'): Project {
  const base = createProject(name);
  const page = { ...base.pages[0], name: pageName, nodes: structuredClone(content.nodes), edges: structuredClone(content.edges) };
  return saveProject(st, { ...base, pages: [page], activePageId: page.id });
}
