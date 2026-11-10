import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SddError } from '../lib/sdd/sdd';

const dlg = vi.hoisted(() => ({
  rename: vi.fn(),
  duplicate: vi.fn(),
  del: vi.fn(),
}));
vi.mock('../lib/dialogActions', () => ({
  renameProjectDialog: dlg.rename,
  duplicateProjectDialog: dlg.duplicate,
  deleteProjectDialog: dlg.del,
  newProjectDialog: vi.fn(async () => null),
}));
const sync = vi.hoisted(() => ({ requestTreeSync: vi.fn() }));
vi.mock('../sync/treeRuntime', () => sync);
const sdd = vi.hoisted(() => ({ openBytes: vi.fn(), open: vi.fn() }));
vi.mock('../hooks/useSdd', () => ({ useSddActions: () => sdd }));

import { api } from '../api/api';
import { useSession } from '../api/session';
import { useToastStore } from '../store/toastStore';
import { createWsProject, getProjectSync, listWsProjects, putWsProject, saveFile, setProjectSync } from '../workspace/storage';
import { readQueue } from '../sync/treeSync';
import { createProject } from '../lib/project';
import { ProjectsHome } from './ProjectsHome';

const toasts = () => JSON.stringify(useToastStore.getState());
const mount = () => {
  const onOpen = vi.fn();
  render(<ProjectsHome onOpen={onOpen} />);
  return onOpen;
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] } as never);
  useSession.setState({ mode: 'local' } as never);
});

describe('ProjectsHome persisted view / sort', () => {
  it('restores a stored list view and name sort; ignores invalid stored values', () => {
    createWsProject(localStorage, 'B-proj');
    createWsProject(localStorage, 'A-proj');
    localStorage.setItem('sdd:home-view', 'list');
    localStorage.setItem('sdd:home-sort', 'name');
    const { unmount } = render(<ProjectsHome onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sort by name' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('blank-card')).toBeNull(); // list view has no blank card
    const names = screen.getAllByRole('button', { name: /^(A|B)-proj$/ }).map((b) => b.textContent);
    expect(names).toEqual(['A-proj', 'B-proj']);
    unmount();
    localStorage.setItem('sdd:home-view', 'bogus');
    localStorage.setItem('sdd:home-sort', 'bogus');
    render(<ProjectsHome onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Sort by last edited' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles between grid and list and persists the choice', () => {
    createWsProject(localStorage, 'One');
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(localStorage.getItem('sdd:home-view')).toBe('list');
    expect(screen.queryByTestId('blank-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(localStorage.getItem('sdd:home-view')).toBe('grid');
    expect(screen.getByTestId('blank-card')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sort by name' }));
    expect(localStorage.getItem('sdd:home-sort')).toBe('name');
  });

  it('shows the no-match state for a filter that matches nothing', () => {
    createWsProject(localStorage, 'Alpha');
    mount();
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching projects')).toBeInTheDocument();
    expect(screen.getByText(/Nothing matches “zzz”/)).toBeInTheDocument();
  });
});

describe('ProjectsHome thumbnails', () => {
  it('builds a thumbnail for a project whose active page id is stale, using its first page and canvas background', async () => {
    const { project, fileId } = createWsProject(localStorage, 'Thumbed');
    const doc = createProject('Thumbed');
    saveFile(localStorage, { ...doc, id: fileId, activePageId: 'missing-page', settings: { canvas: { background: '#123456' } } } as never);
    mount();
    const card = screen.getByTestId(`project-${project.id}`);
    await waitFor(() => expect(card.querySelector('.project-thumb svg')).not.toBeNull());
  });

  it('a project without a readable first file still gets a (blank) thumbnail; a server thumbnail url renders an img', async () => {
    const a = createWsProject(localStorage, 'Remote').project;
    putWsProject(localStorage, { ...listWsProjects(localStorage).find((p) => p.id === a.id)!, thumbnailUrl: '/api/files/x/thumbnail?v=1' });
    const b = createWsProject(localStorage, 'Empty').project;
    localStorage.removeItem(`sdd:ws:tree:${b.id}`);
    mount();
    expect(screen.getByTestId(`thumb-img-${a.id}`)).toHaveAttribute('src', '/api/files/x/thumbnail?v=1');
    await waitFor(() => expect(screen.getByTestId(`project-${b.id}`).querySelector('svg')).not.toBeNull());
  });
});

describe('ProjectsHome rename / duplicate', () => {
  it('rename of a server-backed project queues a renameProject op and requests a tree sync; a cancelled dialog changes nothing', async () => {
    const p = createWsProject(localStorage, 'Synced').project;
    setProjectSync(localStorage, p.id, { serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: 1 });
    mount();
    dlg.rename.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(dlg.rename).toHaveBeenCalledWith('Synced'));
    expect(readQueue(localStorage, p.id)).toEqual([]);
    dlg.rename.mockResolvedValueOnce('  Renamed  ');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(readQueue(localStorage, p.id)).toEqual([{ t: 'renameProject', name: 'Renamed' }]));
    expect(sync.requestTreeSync).toHaveBeenCalledWith(p.id, 0);
    expect(await screen.findByText('Renamed')).toBeInTheDocument();
  });

  it('renaming a local project does not queue anything; viewers cannot rename', async () => {
    const p = createWsProject(localStorage, 'Local').project;
    mount();
    dlg.rename.mockResolvedValueOnce('Local2');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await screen.findByText('Local2');
    expect(readQueue(localStorage, p.id)).toEqual([]);
    expect(sync.requestTreeSync).not.toHaveBeenCalled();
  });

  it('viewer projects hide Rename and ignore double-click rename', () => {
    const p = createWsProject(localStorage, 'Shared').project;
    setProjectSync(localStorage, p.id, { serverBacked: true, role: 'viewer', treeRev: 1, lastSyncedAt: 1 });
    mount();
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Shared' }));
    expect(dlg.rename).not.toHaveBeenCalled();
  });

  it('duplicate: cancelled does nothing; confirmed copies and toasts', async () => {
    createWsProject(localStorage, 'Orig');
    mount();
    dlg.duplicate.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(dlg.duplicate).toHaveBeenCalledWith('Orig'));
    expect(listWsProjects(localStorage)).toHaveLength(1);
    dlg.duplicate.mockResolvedValueOnce('Orig 2');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(listWsProjects(localStorage).map((x) => x.name).sort()).toEqual(['Orig', 'Orig 2']));
    expect(toasts()).toContain('Project duplicated');
  });
});

describe('ProjectsHome delete', () => {
  it('server mode + server-backed: deletes remotely first; a failure keeps the project and toasts the reason', async () => {
    const p = createWsProject(localStorage, 'Remote').project;
    setProjectSync(localStorage, p.id, { serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: 1 });
    useSession.setState({ mode: 'server' } as never);
    const del = vi.spyOn(api, 'deleteProject');
    mount();
    dlg.del.mockResolvedValue(true);
    del.mockRejectedValueOnce(new Error('403 forbidden'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toasts()).toContain('Not deleted: 403 forbidden'));
    expect(listWsProjects(localStorage)).toHaveLength(1);
    del.mockRejectedValueOnce('weird');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toasts()).toContain('Not deleted'));
    expect(listWsProjects(localStorage)).toHaveLength(1);
    del.mockResolvedValueOnce(undefined as never);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(listWsProjects(localStorage)).toHaveLength(0));
    expect(del).toHaveBeenLastCalledWith(p.id);
  });

  it('local mode with a synced cache deletes locally without calling the API; declining keeps it', async () => {
    const p = createWsProject(localStorage, 'Cached').project;
    setProjectSync(localStorage, p.id, { serverBacked: true, role: 'owner', treeRev: 1, lastSyncedAt: 1 });
    const del = vi.spyOn(api, 'deleteProject');
    mount();
    dlg.del.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(dlg.del).toHaveBeenCalledWith('Cached', 1));
    expect(listWsProjects(localStorage)).toHaveLength(1);
    dlg.del.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(listWsProjects(localStorage)).toHaveLength(0));
    expect(del).not.toHaveBeenCalled();
    expect(getProjectSync(localStorage, p.id)).toBeNull();
  });
});

describe('ProjectsHome import', () => {
  const pick = (file?: File) => {
    const input = screen.getByTestId('import-project-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: file ? [file] : [], configurable: true });
    fireEvent.change(input);
  };
  const file = () => new File([new Uint8Array([1, 2, 3])], 'x.sdd');

  it('no file chosen does nothing', () => {
    mount();
    pick();
    expect(sdd.openBytes).not.toHaveBeenCalled();
  });

  it('success refreshes the list', async () => {
    mount();
    sdd.openBytes.mockImplementationOnce(async () => void createWsProject(localStorage, 'Imported'));
    pick(file());
    expect(await screen.findByText('Imported')).toBeInTheDocument();
    expect(sdd.openBytes.mock.calls[0][1]).toBe('x.sdd');
  });

  it('SddError, Error and non-Error failures each give a specific toast', async () => {
    mount();
    sdd.openBytes.mockRejectedValueOnce(new SddError('BAD_FORMAT' as never, 'not a project'));
    pick(file());
    await waitFor(() => expect(toasts()).toContain('Could not import x.sdd: not a project'));
    sdd.openBytes.mockRejectedValueOnce(new Error('disk full'));
    pick(file());
    await waitFor(() => expect(toasts()).toContain('Import failed: disk full'));
    sdd.openBytes.mockRejectedValueOnce('strange');
    pick(file());
    await waitFor(() => expect(toasts()).toContain('Import failed: strange'));
  });
});

describe('ProjectsHome keyboard', () => {
  it('N opens the new-project flow only when not typing; Cmd+K focuses search', async () => {
    mount();
    const { newProjectDialog } = await import('../lib/dialogActions');
    fireEvent.keyDown(window, { key: 'n' });
    await waitFor(() => expect(newProjectDialog).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(screen.getByLabelText('Search projects'), { key: 'n' });
    fireEvent.keyDown(window, { key: 'n', shiftKey: true });
    fireEvent.keyDown(window, { key: 'n', repeat: true });
    expect(newProjectDialog).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByLabelText('Search projects')).toHaveFocus();
  });
});
