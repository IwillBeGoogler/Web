import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncProjectTree = vi.fn();
vi.mock('./treeSync', async (orig) => ({ ...(await orig<typeof import('./treeSync')>()), syncProjectTree: (...a: unknown[]) => syncProjectTree(...a) }));
import { useSession } from '../api/session';
import { useToastStore } from '../store/toastStore';
import { createWsProject } from '../workspace/storage';
import { useWorkspace } from '../workspace/store';
import { _resetTreeRuntime, flushAllTreeQueues, requestTreeSync, runTreeSync } from './treeRuntime';
import { enqueue } from './treeSync';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  _resetTreeRuntime();
  syncProjectTree.mockReset();
  syncProjectTree.mockResolvedValue({ flushed: { sent: 0, dropped: 0, left: 0, stopped: null }, removedFiles: [], pulled: true });
  useToastStore.getState().clear();
  useWorkspace.getState().unload();
  useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u1', email: 'a@b.c', name: 'Ada', isAdmin: false } });
});
afterEach(() => vi.useRealTimers());

describe('requestTreeSync', () => {
  it('debounces bursts into one sync', async () => {
    const { project } = createWsProject(localStorage, 'P');
    requestTreeSync(project.id);
    requestTreeSync(project.id);
    requestTreeSync(project.id);
    await vi.advanceTimersByTimeAsync(300);
    expect(syncProjectTree).toHaveBeenCalledTimes(1);
  });
  it('does nothing without a signed-in server session', async () => {
    useSession.setState({ mode: 'local', user: null });
    const { project } = createWsProject(localStorage, 'P');
    requestTreeSync(project.id);
    await vi.advanceTimersByTimeAsync(500);
    expect(syncProjectTree).not.toHaveBeenCalled();
  });
  it('AUTH_MODE=none counts as signed in', async () => {
    useSession.setState({ mode: 'server', authMode: 'none', user: null });
    const { project } = createWsProject(localStorage, 'P');
    requestTreeSync(project.id);
    await vi.advanceTimersByTimeAsync(300);
    expect(syncProjectTree).toHaveBeenCalledTimes(1);
  });
  it('tells the explorer how many operations are still queued', () => {
    const { project } = createWsProject(localStorage, 'P');
    useWorkspace.getState().load(localStorage, project.id, 'u1');
    enqueue(localStorage, project.id, [{ t: 'deleteFile', id: 'a' }, { t: 'deleteFile', id: 'b' }]);
    requestTreeSync(project.id);
    expect(useWorkspace.getState().queued).toBe(2);
  });
});

describe('runTreeSync', () => {
  it('reloads the explorer from storage and reports files removed by someone else', async () => {
    const { project } = createWsProject(localStorage, 'P');
    useWorkspace.getState().load(localStorage, project.id, 'u1');
    syncProjectTree.mockResolvedValue({ flushed: { sent: 1, dropped: 0, left: 0, stopped: null }, removedFiles: ['x', 'y'], pulled: true });
    await runTreeSync(project.id);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('2 files were removed by someone else');
  });
  it('does not run twice at once for a project', async () => {
    const { project } = createWsProject(localStorage, 'P');
    let release: () => void = () => undefined;
    syncProjectTree.mockImplementation(() => new Promise((r) => (release = () => r({ flushed: { sent: 0, dropped: 0, left: 0, stopped: null }, removedFiles: [], pulled: true }))));
    const first = runTreeSync(project.id);
    await runTreeSync(project.id);
    expect(syncProjectTree).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});

describe('coming back online', () => {
  it('flushAllTreeQueues drains every project that has queued operations', async () => {
    const a = createWsProject(localStorage, 'A').project;
    const b = createWsProject(localStorage, 'B').project;
    createWsProject(localStorage, 'C');
    enqueue(localStorage, a.id, { t: 'deleteFile', id: '1' });
    enqueue(localStorage, b.id, { t: 'deleteFile', id: '2' });
    flushAllTreeQueues();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncProjectTree.mock.calls.map((c) => c[1]).sort()).toEqual([a.id, b.id].sort());
  });
});
