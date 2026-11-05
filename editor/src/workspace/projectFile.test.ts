import { strToU8, zipSync, type Zippable } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { SddError } from '../lib/sdd/sdd';
import { SDDPROJ_MIMETYPE } from '../lib/sdd/sddproj';
import type { DiagramNode } from '../types';
import { exportProjectBytes, importProjectBytes } from './projectFile';
import { addWsFolder, createWsFile, createWsProject, listWsProjects, loadFile, loadTree, saveFile } from './storage';

const mem = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
let st: ReturnType<typeof mem>;
beforeEach(() => {
  st = mem();
});
const node = (id: string): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id } }) as DiagramNode;

describe('project export / import (local, same model as the server)', () => {
  it('round-trips a nested project into a new project with fresh ids', () => {
    const { project, fileId } = createWsProject(st, 'Platform');
    const infra = addWsFolder(st, project.id, { name: 'infra', parentId: null }).id;
    const db = addWsFolder(st, project.id, { name: 'db', parentId: infra }).id;
    const { file } = createWsFile(st, project.id, { name: 'Schema', folderId: db });
    saveFile(st, { ...loadFile(st, file.id)!, pages: [{ ...loadFile(st, file.id)!.pages[0], nodes: [node('t1'), node('t2')] }] });

    const bytes = exportProjectBytes(st, project.id);
    const r = importProjectBytes(st, bytes);
    expect(r.warnings).toEqual([]);
    expect(r.projectId).not.toBe(project.id);
    expect(listWsProjects(st).map((p) => p.name)).toEqual(['Platform', 'Platform']);

    const tree = loadTree(st, r.projectId);
    expect(tree.folders.map((f) => f.name).sort()).toEqual(['db', 'infra']);
    const newDb = tree.folders.find((f) => f.name === 'db')!;
    expect(newDb.parentId).toBe(tree.folders.find((f) => f.name === 'infra')!.id);
    expect(tree.files.map((f) => f.name).sort()).toEqual(['Platform', 'Schema']);
    const schema = tree.files.find((f) => f.name === 'Schema')!;
    expect(schema.folderId).toBe(newDb.id);
    expect(schema.id).not.toBe(file.id);
    expect(tree.files.find((f) => f.name === 'Platform')!.id).not.toBe(fileId);
    expect(loadFile(st, schema.id)!.pages[0].nodes.map((n) => n.id)).toEqual(['t1', 't2']);
    expect(loadFile(st, schema.id)!.id).toBe(schema.id);
    // the original is untouched
    expect(loadTree(st, project.id).files).toHaveLength(2);
  });

  it('malicious or broken archives write nothing', () => {
    createWsProject(st, 'Keep');
    const before = [...st.m.keys()].sort();
    const bad: Uint8Array[] = [
      zipSync({ mimetype: [strToU8(SDDPROJ_MIMETYPE), { level: 0 }], '../../evil': strToU8('x') } as Zippable),
      strToU8('this is not a zip archive at all, sorry'),
      zipSync({ mimetype: [strToU8('text/plain'), { level: 0 }], 'manifest.json': strToU8('{}') } as Zippable),
    ];
    for (const b of bad) expect(() => importProjectBytes(st, b)).toThrow(SddError);
    expect([...st.m.keys()].sort()).toEqual(before);
    expect(listWsProjects(st)).toHaveLength(1);
  });

  it('an empty project exports and imports', () => {
    const { project } = createWsProject(st, 'Solo');
    const r = importProjectBytes(st, exportProjectBytes(st, project.id));
    expect(loadTree(st, r.projectId).files.map((f) => f.name)).toEqual(['Solo']);
  });

  it('exporting an unknown project throws', () => {
    expect(() => exportProjectBytes(st, 'nope')).toThrow(/not found/i);
  });
});
