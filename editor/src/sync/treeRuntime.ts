import { api } from '../api/api';
import { useSession } from '../api/session';
import { toast } from '../store/toastStore';
import { useWorkspace } from '../workspace/store';
import { projectsWithQueue, queueLength, syncProjectTree } from './treeSync';
import { useLibrary } from './library';

/** Debounced "send my tree operations and reconcile" for the open project (and any other project with unsent operations). */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let running = new Set<string>();

const signedIn = () => {
  const s = useSession.getState();
  return s.mode === 'server' && (s.authMode === 'none' || !!s.user);
};

export async function runTreeSync(projectId: string): Promise<void> {
  if (running.has(projectId) || !signedIn()) return;
  running.add(projectId);
  try {
    const r = await syncProjectTree({ api, storage: localStorage, online: () => navigator.onLine !== false, now: () => Date.now() }, projectId);
    const ws = useWorkspace.getState();
    if (ws.projectId === projectId) {
      ws.reload(localStorage);
      ws.setQueued(queueLength(localStorage, projectId));
      if (r.removedFiles.length) toast.info(`${r.removedFiles.length} file${r.removedFiles.length === 1 ? ' was' : 's were'} removed by someone else`);
    }
    useLibrary.getState().bump();
  } finally {
    running.delete(projectId);
  }
}

export function requestTreeSync(projectId: string, delay = 250): void {
  const ws = useWorkspace.getState();
  if (ws.projectId === projectId) ws.setQueued(queueLength(localStorage, projectId));
  if (!signedIn()) return;
  clearTimeout(timers.get(projectId));
  timers.set(
    projectId,
    setTimeout(() => {
      timers.delete(projectId);
      void runTreeSync(projectId);
    }, delay),
  );
}

/** back online: drain every project's queue */
export function flushAllTreeQueues(): void {
  for (const id of projectsWithQueue(localStorage)) void runTreeSync(id);
}
export const _resetTreeRuntime = (): void => {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  running = new Set();
};
