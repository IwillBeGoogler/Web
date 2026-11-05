import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../lib/project';
import type { DiagramNode, Project } from '../types';
import { flattenWorkspace, FLAT_KEY, splitIntoFiles } from './flatten';
import { addWsFolder, createWsFile, createWsProject, ensureWorkspace, getWsProject, loadFile, loadTree, setProjectSync } from './storage';

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
let st: ReturnType<typeof mem>;
beforeEach(() => {
  st = mem();
});
const icon = (id: string): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id } }) as DiagramNode;
const multi = (name: string): Project => {
  const p = createProject(name);
  return {
    ...p,
    pages: [
      { id: 'pg_a', name: 'Overview', nodes: [icon('a1')], edges: [] },
      { id: 'pg_b', name: 'Database', nodes: [icon('b1'), icon('b2')], edges: [] },
      { id: 'pg_c', name: 'Network', nodes: [], edges: [] },
    ],
    activePageId: 'pg_b',
  };
};
const names = (pid: string) => loadTree(st, pid).files.map((f) => f.name).sort();

describe('splitIntoFiles (pure)', () => {
  it('one document per page; the original id keeps the FIRST page; names are "<file> — <page>"', () => {
    let n = 0;
    const src = multi('Arch');
    const out = splitIntoFiles(src, () => `fil_new${++n}`);
    expect(out.map((d) => d.name)).toEqual(['Arch — Overview', 'Arch — Database', 'Arch — Network']);
    expect(out[0].id).toBe(src.id);
    expect(out.slice(1).map((d) => d.id)).toEqual(['fil_new1', 'fil_new2']);
    for (const d of out) {
      expect(d.pages).toHaveLength(1);
      expect(d.activePageId).toBe(d.pages[0].id);
    }
    expect(out[1].pages[0].nodes.map((x) => x.id)).toEqual(['b1', 'b2']);
  });
  it('a single-page document is returned untouched', () => {
    const p = createProject('Solo');
    expect(splitIntoFiles(p, () => 'x')).toEqual([p]);
  });
});

describe('flattenWorkspace: pages -> files', () => {
  it('splits a 3-page file into 3 files in the same project; the original id is the first page (links keep working)', () => {
    const { project, fileId } = createWsProject(st, 'Proj', { doc: multi('Arch'), fileName: 'Arch' });
    const r = flattenWorkspace(st);
    expect(r.split).toBe(1);
    expect(names(project.id)).toEqual(['Arch — Database', 'Arch — Network', 'Arch — Overview']);
    const first = loadTree(st, project.id).files.find((f) => f.id === fileId)!;
    expect(first.name).toBe('Arch — Overview'); // same id, first page
    expect(loadFile(st, fileId)!.pages.map((p) => p.id)).toEqual(['pg_a']);
    const db = loadTree(st, project.id).files.find((f) => f.name === 'Arch — Database')!;
    expect(loadFile(st, db.id)!.pages[0].nodes.map((n) => n.id)).toEqual(['b1', 'b2']);
    expect(db.pageCount).toBe(1);
    expect(loadTree(st, project.id).files.every((f) => f.pageCount === 1)).toBe(true);
  });

  it('leaves single-page files (and their names) alone', () => {
    const { project } = createWsProject(st, 'Proj', { fileName: 'Plain' });
    createWsFile(st, project.id, { name: 'Other' });
    flattenWorkspace(st);
    expect(names(project.id)).toEqual(['Other', 'Plain']);
  });

  it('is versioned and idempotent', () => {
    const { project } = createWsProject(st, 'Proj', { doc: multi('Arch'), fileName: 'Arch' });
    flattenWorkspace(st);
    expect(st.getItem(FLAT_KEY)).toBe('1');
    const before = JSON.stringify(loadTree(st, project.id));
    expect(flattenWorkspace(st)).toEqual({ split: 0, flattened: 0 });
    expect(JSON.stringify(loadTree(st, project.id))).toBe(before);
  });

  it('skips server-backed projects (the server migrates those; the next sync pulls the result)', () => {
    const { project } = createWsProject(st, 'Srv', { doc: multi('Arch'), fileName: 'Arch' });
    setProjectSync(st, project.id, { serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: null });
    flattenWorkspace(st);
    expect(loadTree(st, project.id).files).toHaveLength(1);
  });

  it('ensureWorkspace runs it', () => {
    const { project } = createWsProject(st, 'Proj', { doc: multi('Arch'), fileName: 'Arch' });
    ensureWorkspace(st);
    expect(loadTree(st, project.id).files).toHaveLength(3);
    expect(getWsProject(st, project.id)).not.toBeNull();
  });
});

describe('flattenWorkspace: folders -> flat', () => {
  it('files keep their names and move to the root; folders disappear', () => {
    const { project } = createWsProject(st, 'Proj', { fileName: 'Root' });
    const docs = addWsFolder(st, project.id, { name: 'docs', parentId: null }).id;
    const sub = addWsFolder(st, project.id, { name: 'sub', parentId: docs }).id;
    createWsFile(st, project.id, { name: 'Guide', folderId: docs });
    createWsFile(st, project.id, { name: 'Deep', folderId: sub });
    const r = flattenWorkspace(st);
    expect(r.flattened).toBe(2);
    const t = loadTree(st, project.id);
    expect(t.folders).toEqual([]);
    expect(t.files.every((f) => f.folderId === null)).toBe(true);
    expect(names(project.id)).toEqual(['Deep', 'Guide', 'Root']);
  });

  it('prefixes the folder name only on a name clash', () => {
    const { project } = createWsProject(st, 'Proj', { fileName: 'Guide' });
    const docs = addWsFolder(st, project.id, { name: 'docs', parentId: null }).id;
    const ops = addWsFolder(st, project.id, { name: 'ops', parentId: null }).id;
    createWsFile(st, project.id, { name: 'Guide', folderId: docs });
    createWsFile(st, project.id, { name: 'Guide', folderId: ops });
    createWsFile(st, project.id, { name: 'Unique', folderId: ops });
    flattenWorkspace(st);
    expect(names(project.id)).toEqual(['Guide', 'Unique', 'docs / Guide', 'ops / Guide']);
  });

  it('the file documents follow their new names', () => {
    const { project } = createWsProject(st, 'Proj', { fileName: 'Guide' });
    const docs = addWsFolder(st, project.id, { name: 'docs', parentId: null }).id;
    const f = createWsFile(st, project.id, { name: 'Guide', folderId: docs }).file;
    flattenWorkspace(st);
    expect(loadFile(st, f.id)!.name).toBe('docs / Guide');
  });
});
