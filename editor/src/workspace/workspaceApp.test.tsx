import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPrefs = vi.fn();
const patchPrefs = vi.fn();
vi.mock('../api/api', async (orig) => {
  const m = await orig<typeof import('../api/api')>();
  return { ...m, api: { ...m.api, getPrefs: (...a: unknown[]) => getPrefs(...a), patchPrefs: (...a: unknown[]) => patchPrefs(...a), listProjects: async () => ({ items: [], total: 0, page: 1, pageSize: 100 }) } };
});
import App from '../App';
import { useSession } from '../api/session';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import type { DiagramNode } from '../types';
import { _resetPrefsSync, flushPrefs } from './prefsSync';
import { createFileIn, openFile } from './actions';
import { addWsFolder, createWsFile, createWsProject, loadFile } from './storage';
import { readView, useWorkspace, viewKey } from './store';
import { clearTabSessions } from './tabSession';

const ws = () => useWorkspace.getState();
const st = () => useDiagramStore.getState();
const node = (id: string): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id } }) as DiagramNode;
const path = () => window.location.pathname;

beforeEach(() => {
  localStorage.clear();
  clearTabSessions();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  useWorkspace.getState().unload();
  useSession.getState().reset();
  useSession.setState({ mode: 'local' });
  _resetPrefsSync();
  getPrefs.mockReset();
  patchPrefs.mockReset();
  getPrefs.mockResolvedValue({});
  patchPrefs.mockResolvedValue({});
  window.history.replaceState({}, '', '/');
});

function seed() {
  const r = createWsProject(localStorage, 'Platform', { fileName: 'Alpha' });
  const beta = createWsFile(localStorage, r.project.id, { name: 'Beta' }).file.id;
  return { pid: r.project.id, a: r.fileId, b: beta };
}

describe('project routes', () => {
  it('/p/:project opens the last active tab, else the first file', async () => {
    const { pid, a, b } = seed();
    localStorage.setItem(viewKey('local', pid), JSON.stringify({ tabs: { open: [a, b], active: b, closed: [] }, expanded: [], starred: [], recent: [], at: 5 }));
    window.history.replaceState({}, '', `/p/${pid}`);
    render(<App />);
    await waitFor(() => expect(path()).toBe(`/p/${pid}/f/${b}`));
    expect(st().projectId).toBe(b);
    expect(screen.getAllByRole('tab', { name: /Alpha|Beta/ })).toHaveLength(2);
  });

  it('with nothing open it opens the first file of the tree', async () => {
    const { pid, a } = seed();
    window.history.replaceState({}, '', `/p/${pid}`);
    render(<App />);
    await waitFor(() => expect(path()).toBe(`/p/${pid}/f/${a}`));
  });

  it('a deep link to a file (that used to be in a folder) opens it in a tab', async () => {
    const r = createWsProject(localStorage, 'Deep', { fileName: 'Root' });
    const folder = addWsFolder(localStorage, r.project.id, { name: 'docs', parentId: null }).id;
    const f = createWsFile(localStorage, r.project.id, { name: 'Nested', folderId: folder }).file.id;
    window.history.replaceState({}, '', `/p/${r.project.id}/f/${f}`);
    render(<App />);
    await waitFor(() => expect(st().projectName).toBe('Nested'));
    expect(ws().tabs).toMatchObject({ open: [f], active: f });
    expect(ws().tree.folders).toEqual([]); // folders are flattened on load: the file is a plain file of the project
    expect(ws().tree.files.find((x) => x.id === f)).toMatchObject({ name: 'Nested', folderId: null });
  });

  it('an unknown file falls back to the project; a project with no files says so', async () => {
    const { pid, a } = seed();
    window.history.replaceState({}, '', `/p/${pid}/f/does-not-exist`);
    render(<App />);
    await waitFor(() => expect(path()).toBe(`/p/${pid}/f/${a}`));
  });

  it('empty project: message with a New file button', async () => {
    const r = createWsProject(localStorage, 'Hollow');
    localStorage.setItem(`sdd:ws:tree:${r.project.id}`, JSON.stringify({ folders: [], files: [] }));
    window.history.replaceState({}, '', `/p/${r.project.id}`);
    render(<App />);
    expect(await screen.findByText('This project has no files yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New file' })).toBeInTheDocument();
  });

  it('back / forward between files re-activates them', async () => {
    const { pid, a, b } = seed();
    window.history.replaceState({}, '', `/p/${pid}/f/${a}`);
    render(<App />);
    await waitFor(() => expect(st().projectId).toBe(a));
    act(() => openFile(b));
    await waitFor(() => expect(st().projectId).toBe(b));
    act(() => {
      window.history.back();
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(st().projectId).toBe(a));
  });
});

describe('tabs keep their own editor state', () => {
  it('undo in one file never touches another; each comes back as it was left', async () => {
    const { pid, a, b } = seed();
    window.history.replaceState({}, '', `/p/${pid}/f/${a}`);
    render(<App />);
    await waitFor(() => expect(st().projectId).toBe(a));
    act(() => {
      st().addNode(node('a1'));
      st().addNode(node('a2'));
    });
    act(() => openFile(b));
    await waitFor(() => expect(st().projectId).toBe(b));
    expect(st().nodes).toEqual([]);
    expect(st().past).toHaveLength(0);
    act(() => st().addNode(node('b1')));
    act(() => st().undo());
    expect(st().nodes).toEqual([]);
    act(() => st().redo());
    // back to A (via its tab): the two nodes and the two undo steps are intact
    fireEvent.click(screen.getByTestId('ftab-Alpha'));
    await waitFor(() => expect(st().projectId).toBe(a));
    expect(st().nodes.map((n) => n.id)).toEqual(['a1', 'a2']);
    expect(st().past).toHaveLength(2);
    act(() => st().undo());
    expect(st().nodes.map((n) => n.id)).toEqual(['a1']);
    fireEvent.click(screen.getByTestId('ftab-Beta'));
    await waitFor(() => expect(st().projectId).toBe(b));
    expect(st().nodes.map((n) => n.id)).toEqual(['b1']); // A's undo did not leak
    // both documents are persisted separately
    await waitFor(() => expect(loadFile(localStorage, a)?.pages[0].nodes.map((n) => n.id)).toEqual(['a1']));
    expect(loadFile(localStorage, b)?.pages[0].nodes.map((n) => n.id)).toEqual(['b1']);
  });

  it('a file switch persists the file being left (no edit is lost to the debounce)', async () => {
    const { pid, a, b } = seed();
    window.history.replaceState({}, '', `/p/${pid}/f/${a}`);
    render(<App />);
    await waitFor(() => expect(st().projectId).toBe(a));
    act(() => st().addNode(node('quick')));
    act(() => openFile(b)); // immediately, before the 400 ms autosave
    expect(loadFile(localStorage, a)?.pages[0].nodes.map((n) => n.id)).toEqual(['quick']);
  });

  it('a new file is empty and independent; renaming it from the top bar updates the tab', async () => {
    const { pid, a } = seed();
    window.history.replaceState({}, '', `/p/${pid}/f/${a}`);
    render(<App />);
    await waitFor(() => expect(st().projectId).toBe(a));
    let id = '';
    act(() => {
      id = createFileIn(null, 'Fresh')!;
    });
    await waitFor(() => expect(st().projectId).toBe(id));
    expect(st().nodes).toEqual([]);
    fireEvent.doubleClick(await screen.findByTestId('ftab-Fresh'));
    const dialog = await screen.findByRole('dialog', { name: 'Rename file' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Fresher' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(await screen.findByTestId('ftab-Fresher')).toBeInTheDocument();
  });
});

describe('restoring tabs', () => {
  it('after a reload the open tabs and the active file come back (local)', async () => {
    const { pid, a, b } = seed();
    window.history.replaceState({}, '', `/p/${pid}/f/${a}`);
    const first = render(<App />);
    await waitFor(() => expect(st().projectId).toBe(a));
    act(() => openFile(b));
    await waitFor(() => expect(st().projectId).toBe(b));
    first.unmount();
    // "reload": fresh in-memory state, same localStorage, URL of the project only
    useDiagramStore.getState().reset();
    useWorkspace.getState().unload();
    clearTabSessions();
    window.history.replaceState({}, '', `/p/${pid}`);
    render(<App />);
    await waitFor(() => expect(path()).toBe(`/p/${pid}/f/${b}`));
    expect(screen.getAllByRole('tab', { name: /Alpha|Beta/ })).toHaveLength(2);
    expect(readView(localStorage, 'local', pid).tabs.active).toBe(b);
  });

  it('signed in: a newer tab state on the server wins over a stale local copy (another device)', async () => {
    const { pid, a, b } = seed();
    useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u1', email: 'a@b.c', name: 'Ada', isAdmin: false } });
    localStorage.setItem(viewKey('u1', pid), JSON.stringify({ tabs: { open: [a], active: a, closed: [] }, expanded: [], starred: [], recent: [], at: 10 }));
    getPrefs.mockResolvedValue({ [`ws:${pid}`]: { tabs: { open: [a, b], active: b, closed: [] }, expanded: [], starred: [b], recent: [b], at: 99 } });
    window.history.replaceState({}, '', `/p/${pid}/f/${a}`);
    render(<App />);
    await waitFor(() => expect(ws().tabs.open).toEqual([a, b]));
    expect(ws().starred).toEqual([b]);
    expect(readView(localStorage, 'u1', pid).tabs.open).toEqual([a, b]); // adopted locally too
  });

  it('signed in with cleared storage: the saved tabs come back BEFORE a file is chosen, and the empty local state never overwrites them', async () => {
    const { pid, a, b } = seed();
    useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u1', email: 'a@b.c', name: 'Ada', isAdmin: false } });
    getPrefs.mockResolvedValue({ [`ws:${pid}`]: { tabs: { open: [a, b], active: b, closed: [] }, expanded: [], starred: [], recent: [b, a], at: 500 } });
    window.history.replaceState({}, '', `/p/${pid}`); // no local view at all
    render(<App />);
    await waitFor(() => expect(path()).toBe(`/p/${pid}/f/${b}`)); // the server's active tab, not the first file
    expect(ws().tabs.open).toEqual([a, b]);
    await act(async () => {
      await flushPrefs(pid);
    });
    for (const call of patchPrefs.mock.calls) {
      const view = (call[0] as Record<string, { tabs: { open: string[] } }>)[`ws:${pid}`];
      expect(view.tabs.open).toEqual([a, b]); // never a smaller state
    }
  });

  it('signed in: tab changes are pushed to the server preferences (debounced), keyed per project', async () => {
    const { pid, a, b } = seed();
    useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u1', email: 'a@b.c', name: 'Ada', isAdmin: false } });
    window.history.replaceState({}, '', `/p/${pid}/f/${a}`);
    render(<App />);
    await waitFor(() => expect(st().projectId).toBe(a));
    act(() => openFile(b));
    await act(async () => {
      await flushPrefs(pid);
    });
    expect(patchPrefs).toHaveBeenCalled();
    const body = patchPrefs.mock.calls.at(-1)![0] as Record<string, { tabs: { open: string[]; active: string } }>;
    expect(Object.keys(body)).toEqual([`ws:${pid}`]);
    expect(body[`ws:${pid}`].tabs).toMatchObject({ open: [a, b], active: b });
  });

  it('local mode never calls the server', async () => {
    const { pid, a, b } = seed();
    window.history.replaceState({}, '', `/p/${pid}/f/${a}`);
    render(<App />);
    await waitFor(() => expect(st().projectId).toBe(a));
    act(() => openFile(b));
    await act(async () => {
      await flushPrefs(pid);
    });
    expect(patchPrefs).not.toHaveBeenCalled();
    expect(getPrefs).not.toHaveBeenCalled();
  });
});
