import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getFile = vi.fn();
const getProject = vi.fn();
const getTree = vi.fn();
const openShared = vi.fn();
const getShared = vi.fn();
const getPublic = vi.fn();
vi.mock('./api/api', async (orig) => {
  const m = await orig<typeof import('./api/api')>();
  return {
    ...m,
    api: {
      ...m.api,
      getFile: (...a: unknown[]) => getFile(...a),
      getProject: (...a: unknown[]) => getProject(...a),
      getTree: (...a: unknown[]) => getTree(...a),
      openShared: (...a: unknown[]) => openShared(...a),
      getShared: (...a: unknown[]) => getShared(...a),
      getPublic: (...a: unknown[]) => getPublic(...a),
      getPrefs: async () => ({}),
      patchPrefs: async () => ({}),
      listProjects: async () => ({ items: [], total: 0, page: 1, pageSize: 100 }),
    },
  };
});
import { DiagramEditor, EMBED_FEATURES, toTarget, type EmbedTarget } from './embed';
import { ApiError } from './api/client';
import { useSession } from './api/session';
import { features, resetFeatures } from './lib/features';
import { createProject } from './lib/project';
import { currentPath, navigate, setEmbeddedRouter } from './lib/router';
import { adoptServerFile } from './sync/runtime';
import { useCommentsStore } from './comments/store';
import { useDiagramStore } from './store/diagramStore';
import { useEditorSession } from './sync/status';
import { useWorkspace } from './workspace/store';
import { setMqttConnect } from './realtime/link';
import { createMockMqtt } from './realtime/mockMqtt';

const pmeta = (id: string, name = 'Remote') => ({ id, name, ownerId: '7', role: 'owner', treeRev: 3, fileCount: 1, folderCount: 0, createdAt: 1, updatedAt: 5, updatedBy: '7' });
const fmeta = (id: string, projectId: string, name = 'Remote') => ({ id, projectId, folderId: null, name, kind: 'sdd', position: 0, version: 3, pageCount: 1, thumbnailUrl: null, createdAt: 1, updatedAt: 5, updatedBy: '7' });
const sfile = (id: string, projectId: string, role = 'owner') => ({ ...fmeta(id, projectId), role, data: { ...createProject('Remote'), id } });
const me = { id: '7', name: 'Ada' };

const empty = JSON.stringify({ threads: [], unread: 0, readAt: 0, items: [] });
const openFile = () => {
  getFile.mockResolvedValue({ version: 3, file: sfile('fil1', 'prj1') });
  getProject.mockResolvedValue(pmeta('prj1'));
  getTree.mockResolvedValue({ project: pmeta('prj1'), treeRev: 3, folders: [], files: [fmeta('fil1', 'prj1')] });
};

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useEditorSession.getState().reset();
  [getFile, getProject, getTree, openShared, getShared, getPublic].forEach((f) => f.mockReset());
  window.history.replaceState({}, '', '/d/f/fil1');
});
afterEach(() => {
  useSession.getState().reset();
  resetFeatures();
  setEmbeddedRouter(null);
});

describe('toTarget', () => {
  it('maps editor routes to host targets', () => {
    expect(toTarget('/projects')).toEqual({ to: 'home' });
    expect(toTarget('/')).toEqual({ to: 'home' });
    expect(toTarget('/p/a')).toEqual({ to: 'project', projectId: 'a' });
    expect(toTarget('/p/a/f/b')).toEqual({ to: 'file', projectId: 'a', fileId: 'b' });
    expect(toTarget('/login?next=/x')).toEqual({ to: 'login' });
  });
});

describe('embedded router', () => {
  it('keeps the route in memory, never touches the address bar and reports moves', () => {
    const seen: string[] = [];
    setEmbeddedRouter({ path: '/projects', onNavigate: (p, o) => seen.push(`${p}|${o.replace}`) });
    navigate('/p/a/f/b', { replace: true });
    expect(currentPath()).toBe('/p/a/f/b');
    expect(window.location.pathname).toBe('/d/f/fil1');
    expect(seen).toEqual(['/p/a/f/b|true']);
    navigate('/p/a/f/b'); // no change: no echo
    expect(seen).toHaveLength(1);
  });
});

describe('<DiagramEditor fileId>', () => {
  it('resolves the project of the file, opens it in the editor and shows no login or account menu', async () => {
    openFile();
    const { container } = render(<DiagramEditor fileId="fil1" user={me} theme="dark" />);
    await waitFor(() => expect(useDiagramStore.getState().projectId).toBe('fil1'));
    expect(getFile).toHaveBeenCalledWith('fil1');
    const root = container.querySelector('.sdd-root.sdd-embed') as HTMLElement;
    expect(root.dataset.theme).toBe('dark');
    expect(screen.queryByRole('button', { name: /Account:/ })).toBeNull();
    expect(window.location.pathname).toBe('/d/f/fil1'); // the host owns the URL
    expect(useSession.getState()).toMatchObject({ mode: 'server', user: { id: '7', name: 'Ada' }, collab: true, rtc: true });
  });

  it('switches off what the diagram API does not serve, and lets the host switch things back on', async () => {
    openFile();
    const { rerender } = render(<DiagramEditor fileId="fil1" user={me} />);
    await waitFor(() => expect(useDiagramStore.getState().projectId).toBe('fil1'));
    expect(features()).toEqual(EMBED_FEATURES);
    expect(features()).toMatchObject({ realtime: true, collab: true, rtc: true, comments: true, accounts: false, schemaTools: false, sharing: true, privateNotes: true, library: true, thumbnails: true });
    rerender(<DiagramEditor fileId="fil1" user={me} features={{ comments: false }} />);
    expect(features().comments).toBe(false);
  });

  it('normalizes numeric host user ids, builds share links with the host address and accepts SVG but not GIF', async () => {
    openFile();
    render(<DiagramEditor fileId="fil1" user={{ id: 7, name: 'Ada' }} shareUrl={(t) => `https://h.io/d/s/${t}`} />);
    await waitFor(() => expect(useDiagramStore.getState().projectId).toBe('fil1'));
    expect(useSession.getState().user?.id).toBe('7');
    const { shareUrl } = await import('./components/sync/syncDialogs');
    expect(shareUrl('tok')).toBe('https://h.io/d/s/tok');
    const { isAllowedIconMime } = await import('./lib/sdd/assets');
    expect(isAllowedIconMime('image/svg+xml')).toBe(true);
    expect(isAllowedIconMime('image/gif')).toBe(false);
    expect(isAllowedIconMime('image/webp')).toBe(true);
  });

  it('connects over MQTT with a fresh single-use ticket from the host each time, and does not touch /rtc until an audio room is joined', async () => {
    openFile();
    adoptServerFile(localStorage, sfile('fil1', 'prj1') as never); // a synced file: the project connection opens
    const mock = createMockMqtt();
    setMqttConnect(mock.connect);
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(u); return new Response(empty, { status: 200, headers: { 'content-type': 'application/json' } }); }));
    let n = 0;
    const getTicket = vi.fn(async () => `tk${++n}`);
    try {
      render(<DiagramEditor fileId="fil1" user={me} getTicket={getTicket} />);
      await waitFor(() => expect(useDiagramStore.getState().projectId).toBe('fil1'));
      await waitFor(() => expect(mock.clients.length).toBeGreaterThan(0));
      expect(mock.clients.some((c) => c.subs.includes('dg/p/prj1/events') || c.opts.clientId.startsWith('u7.'))).toBe(true);
      expect(mock.clients.every((c) => c.opts.username === 'ticket' && /^u7\.[A-Za-z0-9_-]{8,48}$/.test(c.opts.clientId))).toBe(true);
      expect(new Set(mock.clients.map((c) => c.opts.password)).size).toBe(mock.clients.length); // never the same ticket twice
      expect(getTicket).toHaveBeenCalledTimes(mock.clients.length);
      expect(calls.filter((u) => /\/rtc(\/|$|\?)/.test(u))).toEqual([]);
    } finally {
      setMqttConnect(null);
      vi.unstubAllGlobals();
    }
  });

  it('without a host ticket function a signed-in editor opens no MQTT connection (the broker cannot read cookies)', async () => {
    openFile();
    adoptServerFile(localStorage, sfile('fil1', 'prj1') as never);
    const mock = createMockMqtt();
    setMqttConnect(mock.connect);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(empty, { status: 200, headers: { 'content-type': 'application/json' } })));
    try {
      render(<DiagramEditor fileId="fil1" user={me} />);
      await waitFor(() => expect(useDiagramStore.getState().projectId).toBe('fil1'));
      await new Promise((r) => setTimeout(r, 50));
      expect(mock.clients).toEqual([]);
    } finally {
      setMqttConnect(null);
      vi.unstubAllGlobals();
    }
  });

  it('mqttUrl overrides the broker address', async () => {
    openFile();
    adoptServerFile(localStorage, sfile('fil1', 'prj1') as never);
    const mock = createMockMqtt();
    setMqttConnect(mock.connect);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(empty, { status: 200, headers: { 'content-type': 'application/json' } })));
    try {
      render(<DiagramEditor fileId="fil1" user={me} getTicket={async () => 'tk'} mqttUrl="wss://broker.example/mqtt" />);
      await waitFor(() => expect(mock.clients.length).toBeGreaterThan(0));
      expect(mock.clients.every((c) => c.url === 'wss://broker.example/mqtt')).toBe(true);
    } finally {
      setMqttConnect(null);
      vi.unstubAllGlobals();
    }
  });

  it('loads the comments of the file (and its members) and opens the thread named by commentId', async () => {
    openFile();
    adoptServerFile(localStorage, sfile('fil1', 'prj1') as never); // a file already synced: the editor treats it as server-backed
    const calls: string[] = [];
    const root = { id: '5', fileId: 'fil1', parentId: null, author: { id: '', name: 'Someone' }, body: 'hi', anchor: { type: 'point', x: 0, y: 0 }, resolved: true, resolvedAt: 2, resolvedBy: { id: '7', name: 'Ada' }, mentions: [], createdAt: 1, updatedAt: 1 };
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      calls.push(u);
      const body = /\/files\/fil1\/comments$/.test(u) ? { threads: [{ root, replies: [] }], unread: 1, readAt: 0 } : /\/members$/.test(u) ? { items: [] } : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    try {
      render(<DiagramEditor fileId="fil1" user={me} commentId="5" />);
      await waitFor(() => expect(useCommentsStore.getState().activeId).toBe('5'));
      expect(useCommentsStore.getState()).toMatchObject({ panelOpen: true, filter: 'all', unread: 0 });
      expect(calls.some((u) => /\/projects\/prj1\/members$/.test(u))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders the host\'s toolbar actions for a synced file, with the file and the role', async () => {
    openFile();
    adoptServerFile(localStorage, sfile('fil1', 'prj1') as never);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(empty, { status: 200, headers: { 'content-type': 'application/json' } })));
    try {
      const { unmount } = render(<DiagramEditor fileId="fil1" user={me} hostActions={(c) => <i data-testid="host-action">{`${c.fileId}:${c.projectId}:${c.role}`}</i>} />);
      expect(await screen.findByTestId('host-action')).toHaveTextContent('fil1:prj1:owner');
      unmount();
      expect(screen.queryByTestId('host-action')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends the host auth headers and calls onUnauthorized on a 401', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'no' } }), { status: 401, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { apiClient } = await vi.importActual<typeof import('./api/api')>('./api/api');
      const onUnauthorized = vi.fn();
      getFile.mockImplementation(() => apiClient.get('/files/fil1').then(() => undefined));
      render(<DiagramEditor fileId="fil1" user={me} apiBase="/api/diagrams" getAuthHeaders={() => ({ Authorization: 'Bearer tok' })} onUnauthorized={onUnauthorized} />);
      await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
      // other requests (the project library ...) may race ahead of the file: look at the one this test is about
      const [url, init] = fetchMock.mock.calls.find((c) => (c as unknown as [string])[0] === '/api/diagrams/files/fil1') as unknown as [string, RequestInit];
      expect(url).toBe('/api/diagrams/files/fil1');
      expect((init.headers as Headers).get('authorization')).toBe('Bearer tok');
      expect(init.credentials).toBe('include');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows a message when the file is gone, and Back goes to the host', async () => {
    getFile.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'nope'));
    const nav = vi.fn<(t: EmbedTarget, o: { replace: boolean }) => void>();
    render(<DiagramEditor fileId="gone" user={me} onNavigate={nav} />);
    const back = await screen.findByRole('button', { name: 'Back to projects' });
    expect(screen.getByText('File not found')).toBeInTheDocument();
    act(() => back.click());
    expect(nav).toHaveBeenCalledWith({ to: 'home' }, { replace: false });
  });

  it('tells the host when the editor moves to another file', async () => {
    openFile();
    const nav = vi.fn<(t: EmbedTarget, o: { replace: boolean }) => void>();
    render(<DiagramEditor fileId="fil1" user={me} onNavigate={nav} />);
    await waitFor(() => expect(useDiagramStore.getState().projectId).toBe('fil1'));
    act(() => navigate('/p/prj1/f/other'));
    expect(nav).toHaveBeenLastCalledWith({ to: 'file', projectId: 'prj1', fileId: 'other' }, { replace: false });
  });

  it('leaves nothing behind when it unmounts', async () => {
    openFile();
    const { unmount } = render(<DiagramEditor fileId="fil1" user={me} />);
    await waitFor(() => expect(useDiagramStore.getState().projectId).toBe('fil1'));
    unmount();
    expect(useWorkspace.getState().projectId).toBeNull();
    expect(features().comments).toBe(true); // standalone defaults restored
    expect(currentPath()).toBe('/d/f/fil1'); // back on the address bar
  });
});

describe('<DiagramEditor shareToken>', () => {
  it('opens a share link with no signed-in user', async () => {
    openShared.mockResolvedValue({ share: { scope: 'file', role: 'viewer', fileId: 'fil9' }, project: pmeta('prj9'), file: sfile('fil9', 'prj9', 'viewer'), version: 2 });
    render(<DiagramEditor shareToken="tok123" />);
    await waitFor(() => expect(openShared).toHaveBeenCalledWith('tok123'));
    await waitFor(() => expect(useDiagramStore.getState().projectId).toBe('fil9'));
    expect(useEditorSession.getState()).toMatchObject({ source: 'share', readOnly: true });
    expect(useSession.getState().user).toBeNull();
  });
});

describe('<DiagramEditor slug>', () => {
  const doc = { file_id: 'fil7', slug: 'checkout-1a2b', title: 'Checkout', description: '', tags: [], kind: 'sdd', author: { id: 1, username: 'ada', display_name: 'Ada', avatar_url: '' }, data: { ...createProject('Remote'), id: 'fil7' } };

  it('opens a published diagram read-only for an anonymous visitor: no sockets, no sync, nothing saved', async () => {
    getPublic.mockResolvedValue(doc);
    const mock = createMockMqtt();
    setMqttConnect(mock.connect);
    try {
      render(<DiagramEditor slug="checkout-1a2b" />);
      await waitFor(() => expect(getPublic).toHaveBeenCalledWith('checkout-1a2b'));
      await waitFor(() => expect(useDiagramStore.getState().projectId).toBe('fil7'));
      expect(useDiagramStore.getState().projectName).toBe('Checkout');
      await waitFor(() => expect(useEditorSession.getState()).toMatchObject({ source: 'share', role: 'viewer', readOnly: true, shareToken: null }));
      expect(useSession.getState().user).toBeNull();
      expect(mock.clients).toEqual([]);
      expect(getFile).not.toHaveBeenCalled();
      expect(openShared).not.toHaveBeenCalled();
    } finally {
      setMqttConnect(null);
      vi.unstubAllGlobals();
    }
  });

  it('says so when the diagram is not published', async () => {
    getPublic.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'nope'));
    render(<DiagramEditor slug="gone" />);
    expect(await screen.findByText('Diagram unavailable')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('not published');
  });
});
