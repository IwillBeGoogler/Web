import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openSddFlow, resolvePendingOpen, saveCurrentProject, type SddDeps } from './actions';
import { buildSdd, readSdd } from './sdd';
import { useDiagramStore } from '../../store/diagramStore';
import { useFileStore } from '../../store/fileStore';
import { listProjects } from '../projects';
import { createWsProject, listWsProjects, loadFile, loadTree } from '../../workspace/storage';
import { importOpenedFile } from '../../workspace/actions';
import { useWorkspace } from '../../workspace/store';
import { createProject } from '../project';
import { projectSignature } from './signature';
import type { DiagramNode } from '../../types';

const node = (id: string): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id, iconId: 'redis' } });

function deps(over: Partial<SddDeps> = {}): SddDeps & { notify: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> } } {
  return {
    storage: localStorage,
    save: vi.fn().mockResolvedValue({ method: 'download', name: 'proj.sdd', handle: null }),
    pick: vi.fn(),
    thumbnailPng: vi.fn().mockResolvedValue(undefined),
    notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    placeFile: importOpenedFile,
    openFile: vi.fn(),
    ...over,
  } as never;
}

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useFileStore.getState().reset();
});

describe('save', () => {
  it('writes a valid .sdd of the current project, marks clean and remembers the file', async () => {
    const d = deps();
    useDiagramStore.getState().setProjectName('My Project');
    useDiagramStore.getState().addNode(node('a'));
    useFileStore.getState().setDirty(true);
    expect(await saveCurrentProject({}, d)).toBe('saved');
    const [bytes, suggested] = (d.save as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(suggested).toBe('my-project.sdd');
    const back = readSdd(bytes as Uint8Array).project;
    expect(back.name).toBe('My Project');
    expect(back.pages[0].nodes[0].id).toBe('a');
    expect(useFileStore.getState().dirty).toBe(false);
    expect(useFileStore.getState().fileName).toBe('proj.sdd');
    expect(useFileStore.getState().savedSig).toBe(projectSignature(useDiagramStore.getState().toProject()));
    expect(d.notify.success).toHaveBeenCalled();
  });
  it('Save re-uses the handle; Save as passes saveAs', async () => {
    const handle = { name: 'x.sdd' } as never;
    useFileStore.getState().setFile(useDiagramStore.getState().projectId, 'x.sdd', handle, 'sig');
    const d = deps({ save: vi.fn().mockResolvedValue({ method: 'handle', name: 'x.sdd', handle }) });
    await saveCurrentProject({}, d);
    expect((d.save as ReturnType<typeof vi.fn>).mock.calls[0][2]).toMatchObject({ handle, saveAs: false });
    await saveCurrentProject({ saveAs: true }, d);
    expect((d.save as ReturnType<typeof vi.fn>).mock.calls[1][2]).toMatchObject({ saveAs: true });
  });
  it('cancelled picker leaves the dirty flag; errors are reported not thrown', async () => {
    useFileStore.getState().setDirty(true);
    expect(await saveCurrentProject({}, deps({ save: vi.fn().mockResolvedValue(null) }))).toBe('cancelled');
    expect(useFileStore.getState().dirty).toBe(true);
    const d = deps({ save: vi.fn().mockRejectedValue(new Error('disk full')) });
    expect(await saveCurrentProject({}, d)).toBe('error');
    expect(d.notify.error).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });
});

describe('open (a .sdd becomes a FILE of the workspace)', () => {
  const file = () => {
    const p = createProject('From file');
    p.id = 'fil_fromfile';
    p.pages[0].nodes = [node('n1')];
    return { p, bytes: buildSdd(p) };
  };
  it('outside a project: a new project holding the file, file remembered and clean', async () => {
    const d = deps();
    const { p, bytes } = file();
    expect(await openSddFlow(bytes, 'from-file.sdd', null, d)).toBe('opened');
    const [pid, fid] = (d.openFile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fid).toBe('fil_fromfile');
    expect(loadFile(localStorage, fid)!.pages[0].nodes[0].id).toBe('n1');
    expect(listWsProjects(localStorage).map((x) => [x.id, x.name])).toEqual([[pid, 'From file']]);
    expect(loadTree(localStorage, pid).files.map((f) => f.id)).toEqual([fid]);
    expect(useFileStore.getState()).toMatchObject({ projectId: p.id, fileName: 'from-file.sdd', dirty: false });
  });
  it('inside an open project: a new file at its root', async () => {
    const d = deps();
    const { project } = createWsProject(localStorage, 'Open one');
    useWorkspace.getState().load(localStorage, project.id, 'local');
    const { bytes } = file();
    await openSddFlow(bytes, 'f.sdd', null, d);
    expect((d.openFile as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(project.id);
    expect(loadTree(localStorage, project.id).files.map((f) => f.name).sort()).toEqual(['From file', 'Open one']);
    expect(listWsProjects(localStorage)).toHaveLength(1);
    useWorkspace.getState().unload();
  });
  it('an old export (project id) matches the migrated file fil_<id>', async () => {
    const d = deps();
    const old = createProject('Old export');
    old.id = 'prj_legacy01';
    createWsProject(localStorage, 'Existing', { id: 'prj_legacy01', fileId: 'fil_prj_legacy01' });
    expect(await openSddFlow(buildSdd(old), 'old.sdd', null, d)).toBe('pending');
    expect(useFileStore.getState().pending?.project.id).toBe('fil_prj_legacy01');
  });
  it('same file id already stored: asks (pending), nothing written yet', async () => {
    const d = deps();
    const { p, bytes } = file();
    createWsProject(localStorage, 'Existing', { fileId: p.id });
    expect(await openSddFlow(bytes, 'f.sdd', null, d)).toBe('pending');
    expect(useFileStore.getState().pending?.project.id).toBe(p.id);
    expect(loadFile(localStorage, p.id)!.name).toBe('Existing');
    expect(d.openFile).not.toHaveBeenCalled();
  });
  it('Replace overwrites the stored file; Open as copy keeps both; Cancel does nothing', async () => {
    const { p, bytes } = file();
    const d = deps();
    createWsProject(localStorage, 'Existing', { fileId: p.id });
    await openSddFlow(bytes, 'f.sdd', null, d);
    resolvePendingOpen('replace', d);
    expect(loadFile(localStorage, p.id)!.name).toBe('From file');
    expect(listProjects(localStorage)).toHaveLength(1);
    expect(useFileStore.getState().pending).toBeNull();

    await openSddFlow(bytes, 'f.sdd', null, d);
    resolvePendingOpen('copy', d);
    const names = listProjects(localStorage).map((x) => x.name).sort();
    expect(names).toEqual(['From file', 'From file (copy)']);
    expect((d.openFile as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1]).not.toBe(p.id);

    const count = (d.openFile as ReturnType<typeof vi.fn>).mock.calls.length;
    await openSddFlow(bytes, 'f.sdd', null, d);
    resolvePendingOpen('cancel', d);
    expect((d.openFile as ReturnType<typeof vi.fn>).mock.calls.length).toBe(count);
    expect(useFileStore.getState().pending).toBeNull();
  });
  it('corrupt file: clear error toast naming what failed; nothing stored; never throws', async () => {
    const d = deps();
    expect(await openSddFlow(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]), 'bad.sdd', null, d)).toBe('error');
    expect(d.notify.error).toHaveBeenCalledWith(expect.stringContaining('bad.sdd'));
    expect(listProjects(localStorage)).toHaveLength(0);
    expect(listWsProjects(localStorage)).toHaveLength(0);
  });
  it('unknown icon ids open fine and are listed as warnings', async () => {
    const p = createProject('W');
    p.pages[0].nodes = [{ ...node('a'), data: { label: 'a', iconId: 'no-such-logo' } }];
    const d = deps();
    expect(await openSddFlow(buildSdd(p), 'w.sdd', null, d)).toBe('opened');
    expect(useFileStore.getState().warnings.join()).toMatch(/no-such-logo/);
    expect(d.notify.info).toHaveBeenCalledWith(expect.stringMatching(/warning/i));
  });
});
