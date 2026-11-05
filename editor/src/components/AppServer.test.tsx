import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openShared = vi.fn();
const getShared = vi.fn();
const getProject = vi.fn();
const getTree = vi.fn();
const getFile = vi.fn();
const createProject_ = vi.fn();
vi.mock('../api/api', async (orig) => {
  const m = await orig<typeof import('../api/api')>();
  return {
    ...m,
    api: {
      ...m.api,
      openShared: (...a: unknown[]) => openShared(...a),
      getShared: (...a: unknown[]) => getShared(...a),
      getProject: (...a: unknown[]) => getProject(...a),
      getTree: (...a: unknown[]) => getTree(...a),
      getFile: (...a: unknown[]) => getFile(...a),
      createProject: (...a: unknown[]) => createProject_(...a),
      getPrefs: async () => ({}),
      patchPrefs: async () => ({}),
      listProjects: async () => ({ items: [], total: 0, page: 1, pageSize: 100 }),
      listMembers: async () => [],
      listShares: async () => [],
    },
  };
});
import App from '../App';
import { useSession } from '../api/session';
import { ApiError } from '../api/client';
import { createProject } from '../lib/project';
import { listProjects } from '../lib/projects';
import { getProjectSync, listWsProjects, loadTree } from '../workspace/storage';
import { useDiagramStore } from '../store/diagramStore';
import { useEditorSession } from '../sync/status';

const user = { id: 'u1', email: 'a@b.co', name: 'Ada Lovelace', isAdmin: false };
const server = (over: Record<string, unknown> = {}) => useSession.setState({ mode: 'server', authMode: 'session', allowSignup: true, user: null, ...over } as never);
const go = (path: string) => window.history.replaceState({}, '', path);
const pmeta = (id: string, name = 'Remote', treeRev = 3) => ({ id, name, ownerId: 'u1', role: 'owner', treeRev, fileCount: 1, folderCount: 0, createdAt: 1, updatedAt: 5, updatedBy: 'u1' });
const fmeta = (id: string, projectId: string, name = 'Remote', version = 3) => ({ id, projectId, folderId: null, name, kind: 'sdd', position: 0, version, pageCount: 1, thumbnailUrl: null, createdAt: 1, updatedAt: 5, updatedBy: 'u1' });
const sfile = (id: string, projectId: string, name = 'Remote', role = 'owner', version = 3) => ({ ...fmeta(id, projectId, name, version), role, data: { ...createProject(name), id } });

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useEditorSession.getState().reset();
  openShared.mockReset();
  getShared.mockReset();
  getProject.mockReset();
  getTree.mockReset();
  getFile.mockReset();
  createProject_.mockReset();
});

describe('route guard', () => {
  it('sends anonymous visitors from /projects to /login?next=', async () => {
    server();
    go('/projects');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(new URLSearchParams(window.location.search).get('next')).toBe('/projects');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
  it('lets a logged-in user see /projects with the user menu', async () => {
    server({ user });
    go('/projects');
    render(<App />);
    expect(await screen.findByRole('button', { name: /Account: Ada Lovelace/ })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/projects');
  });
  it('bounces /login to the app when already logged in', async () => {
    server({ user });
    go('/login');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/projects'));
  });
  it('AUTH_MODE=none needs no login', async () => {
    server({ authMode: 'none' });
    go('/projects');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/projects');
    expect(screen.queryByRole('button', { name: /Account:/ })).toBeNull();
  });
  it('/register is closed when ALLOW_SIGNUP is off', async () => {
    server({ allowSignup: false });
    go('/register');
    render(<App />);
    expect(await screen.findByText('Sign-up is closed')).toBeInTheDocument();
  });
  it('local mode keeps working without an account', async () => {
    useSession.setState({ mode: 'local' });
    go('/projects');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/projects');
  });
});

describe('deep link to a server project that is not cached', () => {
  it('fetches the project and its tree, caches them locally and opens the first file in the editor', async () => {
    server({ user });
    getProject.mockResolvedValue(pmeta('srv1'));
    getTree.mockResolvedValue({ project: pmeta('srv1'), treeRev: 3, folders: [], files: [fmeta('fil_srv1', 'srv1')] });
    getFile.mockResolvedValue({ version: 3, file: sfile('fil_srv1', 'srv1') });
    go('/p/srv1');
    render(<App />);
    await waitFor(() => expect(listWsProjects(localStorage).map((p) => p.id)).toContain('srv1'));
    expect(getProject).toHaveBeenCalledWith('srv1');
    await waitFor(() => expect(window.location.pathname).toBe('/p/srv1/f/fil_srv1'));
    expect(await screen.findByLabelText('Account: Ada Lovelace')).toBeInTheDocument();
    expect(useDiagramStore.getState().projectId).toBe('fil_srv1');
    expect(getProjectSync(localStorage, 'srv1')).toMatchObject({ serverBacked: true, treeRev: 3 });
    expect(loadTree(localStorage, 'srv1').files.map((f) => f.id)).toEqual(['fil_srv1']);
  });
  it('a deep link to one file opens exactly that file', async () => {
    server({ user });
    getProject.mockResolvedValue(pmeta('srv1'));
    getTree.mockResolvedValue({ project: pmeta('srv1'), treeRev: 3, folders: [], files: [fmeta('fil_a', 'srv1', 'A'), fmeta('fil_b', 'srv1', 'B')] });
    getFile.mockImplementation(async (id: string) => ({ version: 3, file: sfile(id, 'srv1', id === 'fil_b' ? 'B' : 'A') }));
    go('/p/srv1/f/fil_b');
    render(<App />);
    await waitFor(() => expect(useDiagramStore.getState().projectName).toBe('B'));
    expect(window.location.pathname).toBe('/p/srv1/f/fil_b');
    expect((await screen.findByLabelText('File name')) as HTMLInputElement).toHaveValue('B'); // one open file: its name is in the breadcrumb, no tab bar
  });
  it('unknown project goes back to the list', async () => {
    server({ user });
    getProject.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    go('/p/nope');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/projects'));
  });
});

describe('/s/:token', () => {
  const shared = (role: 'viewer' | 'editor') => ({
    version: 2,
    share: { scope: 'file', role, fileId: 'shr1file' },
    project: { ...pmeta('shrP'), role },
    file: sfile('shr1file', 'shrP', 'Shared', role, 2),
  });
  it('opens a viewer link read-only without login and never adds it to the local list', async () => {
    server();
    openShared.mockResolvedValue(shared('viewer'));
    go('/s/tok-abc');
    render(<App />);
    expect(await screen.findByText(/View only/, { selector: '.readonly-banner' })).toBeInTheDocument();
    expect(openShared).toHaveBeenCalledWith('tok-abc');
    expect(window.location.pathname).toBe('/s/tok-abc');
    expect(useEditorSession.getState()).toMatchObject({ source: 'share', readOnly: true, role: 'viewer' });
    expect(screen.queryByTestId('workspace-bar')).toBeNull(); // no explorer / file tabs for a link
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600)); // past the autosave debounce
    });
    expect(listProjects(localStorage)).toEqual([]);
    expect(listWsProjects(localStorage)).toEqual([]);
  });
  it('a project link opens its first file and offers a file picker', async () => {
    server();
    openShared.mockResolvedValue({
      version: undefined,
      share: { scope: 'project', role: 'viewer', fileId: null },
      project: pmeta('shrP'),
      treeRev: 1,
      folders: [],
      files: [fmeta('f1', 'shrP', 'One'), fmeta('f2', 'shrP', 'Two')],
    });
    getShared.mockImplementation(async (_t: string, id: string) => ({ version: 1, file: sfile(id, 'shrP', id === 'f2' ? 'Two' : 'One', 'viewer', 1) }));
    go('/s/tok-proj');
    render(<App />);
    const picker = (await screen.findByLabelText('Shared file')) as HTMLSelectElement;
    expect(picker.value).toBe('f1');
    expect(useDiagramStore.getState().projectName).toBe('One');
    fireEvent.change(picker, { target: { value: 'f2' } });
    await waitFor(() => expect(useDiagramStore.getState().projectName).toBe('Two'));
    expect(getShared).toHaveBeenLastCalledWith('tok-proj', 'f2');
  });
  it('shows a friendly page for a revoked link', async () => {
    server();
    openShared.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    go('/s/dead');
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid, expired or was revoked');
  });
});

describe('new projects while logged in', () => {
  it('are uploaded with their own ids when opened, then synced', async () => {
    server({ user });
    createProject_.mockImplementation(async (body: { id: string; name: string; file: { id: string } }) => ({
      version: 1,
      project: { ...pmeta(body.id, body.name, 1) },
      file: sfile(body.file.id, body.id, body.name, 'owner', 1),
    }));
    getTree.mockImplementation(async () => ({ project: pmeta('x', 'x', 1), treeRev: 1, folders: [], files: [] }));
    getFile.mockImplementation(async (id: string) => ({ version: 1, file: sfile(id, 'x', 'x', 'owner', 1) }));
    go('/projects');
    render(<App />);
    fireEvent.click((await screen.findAllByRole('button', { name: /^Use template / }))[0]);
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/p\/prj_[^/]+\/f\/fil_/));
    expect(createProject_).toHaveBeenCalledTimes(1);
    const [body] = createProject_.mock.calls[0];
    expect(window.location.pathname).toBe(`/p/${body.id}/f/${body.file.id}`); // ids are kept: nothing is re-keyed
    expect(listWsProjects(localStorage).map((p) => p.id)).toEqual([body.id]);
    expect(getProjectSync(localStorage, body.id)).toMatchObject({ serverBacked: true });
  });
  it('stay local when the upload fails (offline)', async () => {
    server({ user });
    createProject_.mockRejectedValue(new ApiError(0, 'NETWORK', 'down'));
    go('/projects');
    render(<App />);
    fireEvent.click((await screen.findAllByRole('button', { name: /^Use template / }))[0]);
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/p\//));
    expect(listWsProjects(localStorage)).toHaveLength(1);
    expect(getProjectSync(localStorage, listWsProjects(localStorage)[0].id)).toBeNull();
  });
});
