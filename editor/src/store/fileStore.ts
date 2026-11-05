import { create } from 'zustand';
import type { Project } from '../types';
import type { FileHandleLike } from '../lib/sdd/fileAccess';

export interface PendingOpen {
  project: Project;
  warnings: string[];
  fileName: string;
  handle: FileHandleLike | null;
}

interface FileStore {
  /** project the file info below belongs to */
  projectId: string | null;
  fileName: string | null;
  handle: FileHandleLike | null;
  savedSig: string | null;
  dirty: boolean;
  pending: PendingOpen | null;
  warnings: string[];
  baseline: (projectId: string, sig: string) => void;
  setFile: (projectId: string, fileName: string | null, handle: FileHandleLike | null, sig: string) => void;
  setDirty: (d: boolean) => void;
  setPending: (p: PendingOpen | null) => void;
  setWarnings: (w: string[]) => void;
  reset: () => void;
}

const initial = { projectId: null, fileName: null, handle: null, savedSig: null, dirty: false, pending: null, warnings: [] };
export const useFileStore = create<FileStore>((set, get) => ({
  ...initial,
  /** called when the editor mounts: keep file info if it is for this project, else start clean */
  baseline: (projectId, sig) => {
    if (get().projectId === projectId) return set({ dirty: get().savedSig !== null && get().savedSig !== sig });
    set({ projectId, fileName: null, handle: null, savedSig: sig, dirty: false });
  },
  setFile: (projectId, fileName, handle, sig) => set({ projectId, fileName, handle, savedSig: sig, dirty: false }),
  setDirty: (dirty) => set({ dirty }),
  setPending: (pending) => set({ pending }),
  setWarnings: (warnings) => set({ warnings }),
  reset: () => set({ ...initial }),
}));
