import { useEffect } from 'react';
import { openFile } from '../../workspace/actions';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { showProblem } from '../smart/lintBridge';
import { buildProjectIndex, currentPlace } from './projectIndex';
import { resolveRef, type ArchRef, type Loc } from './links';

let pending: Loc | null = null;

function arrive(loc: Loc): void {
  const st = useDiagramStore.getState();
  if (st.activePageId !== loc.pageId) st.switchPage(loc.pageId);
  // let the canvas render the page before fitting
  setTimeout(() => showProblem([loc.nodeId]), 30);
}

/** open the file / page of `loc`, select the node and fit it */
export function jumpToLoc(loc: Loc): void {
  if (useDiagramStore.getState().projectId === loc.fileId) return arrive(loc);
  pending = loc;
  openFile(loc.fileId);
}

/** follow a ref from the open page; false (and a toast) when it is broken */
export function jumpToRef(ref: ArchRef, from = currentPlace()): boolean {
  const r = resolveRef(ref, from, buildProjectIndex());
  if (!r.ok) { toast.error(`Broken link: ${r.reason}`); return false; }
  jumpToLoc(r.loc);
  return true;
}

/** mounted once in the editor: finishes a jump that had to open another file first */
export function useCrossLinkJump(): void {
  const projectId = useDiagramStore((s) => s.projectId);
  useEffect(() => {
    if (!pending || pending.fileId !== projectId) return;
    const loc = pending;
    pending = null;
    arrive(loc);
  }, [projectId]);
}

export const _pendingJump = (): Loc | null => pending;
