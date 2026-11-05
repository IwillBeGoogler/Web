/** Workspace model: Project › Folder (nested) › File › Page. A file is what used to be a "project with pages" (types.ts `Project`). */
export type FileKind = 'sdd' | 'erd' | 'uml' | 'board';
export const FILE_KINDS: FileKind[] = ['sdd', 'erd', 'uml', 'board'];

/** a project is a container; its folders and files live in a ProjectTree */
export interface WsProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** preview of the first file, uploaded by an editor (server projects only) */
  thumbnailUrl?: string;
}
export interface WsFolder {
  id: string;
  parentId: string | null;
  name: string;
  /** sort key among the siblings (folders and files share one sequence); fractional so a drop never renumbers the others */
  position: number;
}
export interface WsFile {
  id: string;
  folderId: string | null;
  name: string;
  kind: FileKind;
  position: number;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
}
export interface ProjectTree {
  folders: WsFolder[];
  files: WsFile[];
}
export type EntryKind = 'folder' | 'file';
export interface EntryRef {
  kind: EntryKind;
  id: string;
}
export const emptyTree = (): ProjectTree => ({ folders: [], files: [] });
