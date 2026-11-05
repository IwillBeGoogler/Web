import type { LibraryDoc } from '../lib/library/types';
import { mergeLibrary, useLibraryDoc } from '../lib/library/store';

export interface LibraryApi {
  getLibrary: (projectId: string) => Promise<{ rev: number; doc: LibraryDoc }>;
  putLibrary: (projectId: string, baseRev: number, doc: LibraryDoc) => Promise<{ rev: number; doc: LibraryDoc }>;
}

/** the library was changed by someone else: 409 (Node server) or 412 `LIBRARY_CONFLICT` (Go API) */
export const isLibraryConflict = (e: unknown): boolean => {
  const { status, code } = (e ?? {}) as { status?: number; code?: string };
  return status === 409 || (status === 412 && (code === undefined || code === 'LIBRARY_CONFLICT'));
};

/** Library <-> server for ONE project. Local edits are never lost: offline pushes fail quietly and stay dirty; a stale-rev conflict (409 from the Node server, 412 LIBRARY_CONFLICT from the Go API) merges per id and retries. */
export class LibrarySync {
  private busy = false;
  constructor(private api: LibraryApi, private projectId: string) {}

  /** fetch the server library and merge it into mine */
  async pull(): Promise<void> {
    try {
      const s = await this.api.getLibrary(this.projectId);
      const st = useLibraryDoc.getState();
      if (st.projectId !== this.projectId) return;
      const merged = st.dirty ? mergeLibrary(st.base, st.doc, s.doc) : s.doc;
      st.adopt(s.rev, s.doc, merged);
    } catch { /* offline: keep the local copy */ }
  }

  async push(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const st = useLibraryDoc.getState();
        if (st.projectId !== this.projectId || !st.dirty) return;
        try {
          const r = await this.api.putLibrary(this.projectId, st.rev, st.doc);
          useLibraryDoc.getState().adopt(r.rev, r.doc, useLibraryDoc.getState().doc);
        } catch (e) {
          if (!isLibraryConflict(e)) return;
          await this.pull();
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
