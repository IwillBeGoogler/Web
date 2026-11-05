import { toast } from '../../store/toastStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useFileStore } from '../../store/fileStore';
import { exportFileName } from '../export';
import { listProjects, saveProject } from '../projects';
import { fileIdFor } from '../../workspace/storage';
import { importOpenedFile } from '../../workspace/actions';
import { syncFileMeta, projectOfFile } from '../../workspace/storage';
import { buildSdd, SddError } from './sdd';
import { readAnySdd } from './any';
import { importProjectBytes } from '../../workspace/projectFile';
import { pickSddFile, saveSddFile, type FileHandleLike, type SaveResult } from './fileAccess';
import { decideOpen, resolveConflict } from './conflict';
import { projectSignature } from './signature';
import type { Project } from '../../types';
import { renderThumbnailPng } from './thumbnailPng';

export interface SddDeps {
  storage: Storage;
  save: (bytes: Uint8Array, name: string, opts: { handle?: FileHandleLike | null; saveAs?: boolean }) => Promise<SaveResult | null>;
  pick: typeof pickSddFile;
  thumbnailPng: (project: Project) => Promise<Uint8Array | undefined>;
  notify: { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void };
  /** put an opened document into the workspace (new file of the open project, or a new project) */
  placeFile: (project: Project) => { projectId: string; fileId: string };
  /** show it */
  openFile: (projectId: string, fileId: string) => void;
  /** show a project (a project container was opened) */
  openProject?: (projectId: string) => void;
}

export const defaultDeps = (openFile: (projectId: string, fileId: string) => void, openProject?: (projectId: string) => void): SddDeps => ({
  storage: localStorage,
  save: (b, n, o) => saveSddFile(b, n, o),
  pick: pickSddFile,
  thumbnailPng: renderThumbnailPng,
  notify: toast,
  placeFile: importOpenedFile,
  openFile,
  openProject,
});

const describe = (e: unknown, file: string): string =>
  e instanceof SddError ? `Could not open ${file}: ${e.message}${e.entry && !e.message.includes(e.entry) ? ` (${e.entry})` : ''}` : `Could not open ${file}: ${(e as Error)?.message ?? 'unknown error'}`;

/** Save the current project as .sdd (Cmd+S re-saves to the same file when the browser allows it). */
export async function saveCurrentProject(opts: { saveAs?: boolean }, deps: SddDeps): Promise<'saved' | 'cancelled' | 'error'> {
  try {
    const project = useDiagramStore.getState().toProject();
    const first = project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0];
    const png = await deps.thumbnailPng(project).catch(() => undefined);
    const bytes = buildSdd(project, png ? { thumbnails: { [first.id]: png } } : {});
    const file = useFileStore.getState();
    const r = await deps.save(bytes, exportFileName(project.name, 'sdd'), { handle: file.projectId === project.id ? file.handle : null, saveAs: !!opts.saveAs });
    if (!r) return 'cancelled';
    saveProject(deps.storage, project); // keep the browser copy in sync as well
    const owner = projectOfFile(deps.storage, project.id);
    if (owner) syncFileMeta(deps.storage, owner, project);
    useFileStore.getState().setFile(project.id, r.name, r.handle, projectSignature(project));
    deps.notify.success(`Saved ${r.name}`);
    return 'saved';
  } catch (e) {
    deps.notify.error(`Save failed: ${(e as Error)?.message ?? 'unknown error'}`);
    return 'error';
  }
}

function finishOpen(project: Project, warnings: string[], fileName: string, handle: FileHandleLike | null, deps: SddDeps) {
  const placed = deps.placeFile(project);
  useFileStore.getState().setFile(placed.fileId, fileName, handle, projectSignature({ ...project, id: placed.fileId }));
  useFileStore.getState().setWarnings(warnings);
  deps.openFile(placed.projectId, placed.fileId);
  deps.notify.success(`Opened ${fileName}`);
  if (warnings.length) deps.notify.info(`Opened with ${warnings.length} warning${warnings.length === 1 ? '' : 's'} (unknown or missing icons use a generic icon)`);
}

export async function openSddFlow(bytes: Uint8Array, fileName: string, handle: FileHandleLike | null, deps: SddDeps): Promise<'opened' | 'pending' | 'error'> {
  try {
    const opened = await readAnySdd(bytes, fileName);
    if (opened.kind === 'project') {
      // a project container: a NEW local project with fresh ids (nothing is written when anything in it is invalid)
      const r = importProjectBytes(deps.storage, bytes);
      deps.notify.success(`Imported ${fileName}`);
      if (r.warnings.length) deps.notify.info(`Imported with ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}`);
      if (r.firstFileId) deps.openFile(r.projectId, r.firstFileId);
      else deps.openProject?.(r.projectId);
      return 'opened';
    }
    if (opened.kind === 'text') {
      // text .sdd: a new file, laid out automatically; it has no file handle, so Cmd+S saves a .sdd container instead of overwriting the text
      finishOpen(opened.project, opened.warnings, fileName, null, deps);
      return 'opened';
    }
    const read = opened;
    const { warnings } = read;
    // a file exported before the workspace model carries its old project id: it is the migrated file `fil_<id>`
    const known = new Set(listProjects(deps.storage).map((m) => m.id));
    const project = known.has(read.project.id) ? read.project : known.has(fileIdFor(read.project.id)) ? { ...read.project, id: fileIdFor(read.project.id) } : read.project;
    const decision = decideOpen([...known], project);
    if (decision.kind === 'conflict') {
      useFileStore.getState().setPending({ project, warnings, fileName, handle });
      return 'pending';
    }
    finishOpen(project, warnings, fileName, handle, deps);
    return 'opened';
  } catch (e) {
    deps.notify.error(describe(e, fileName));
    return 'error';
  }
}

export function resolvePendingOpen(choice: 'replace' | 'copy' | 'cancel', deps: SddDeps): void {
  const pending = useFileStore.getState().pending;
  useFileStore.getState().setPending(null);
  if (!pending || choice === 'cancel') return;
  const project = resolveConflict(pending.project, choice);
  finishOpen(project, pending.warnings, pending.fileName, choice === 'replace' ? pending.handle : null, deps);
}

export async function openSddFromPicker(deps: SddDeps): Promise<void> {
  try {
    const f = await deps.pick();
    if (f) await openSddFlow(f.bytes, f.name, f.handle, deps);
  } catch (e) {
    deps.notify.error(`Could not open file: ${(e as Error)?.message ?? 'unknown error'}`);
  }
}
