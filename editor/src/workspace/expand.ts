import { toggleFolder } from './actions';
import { useWorkspace } from './store';

/** reveal a file in the explorer: open every folder above it (only when it is not already visible) */
export function expandToFile(fileId: string): void {
  const s = useWorkspace.getState();
  const f = s.tree.files.find((x) => x.id === fileId);
  let cur = f?.folderId ?? null;
  while (cur) {
    if (!s.expanded.includes(cur)) toggleFolder(cur, true);
    cur = s.tree.folders.find((x) => x.id === cur)?.parentId ?? null;
  }
}
