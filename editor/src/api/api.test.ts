import { describe, expect, it, vi } from 'vitest';
import { createApi } from './api';
import { ApiClient } from './client';

function rig(body: unknown = {}, headers: Record<string, string> = {}) {
  const calls: { url: string; method: string; body?: string; headers: Headers }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: String(init.method), body: typeof init.body === 'string' ? init.body : undefined, headers: new Headers(init.headers) });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
  });
  const client = new ApiClient({ fetch, baseUrl: '/api', sleep: async () => undefined, readCookie: () => 'csrf', uuid: () => 'r' });
  return { api: createApi(client), calls };
}

describe('private stickies endpoints', () => {
  it('reads and replaces MY private stickies of a file', async () => {
    const { api, calls } = rig({ nodes: [], edges: [], updatedAt: 1 });
    await api.getPrivate('f 1');
    await api.putPrivate('f1', { nodes: [], edges: [] });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/files/f%201/private', 'PUT /api/files/f1/private']);
    expect(JSON.parse(calls[1].body!)).toEqual({ nodes: [], edges: [] });
  });
});

describe('workspace endpoints', () => {
  it('projects: list / get / rename / delete / tree', async () => {
    const { api, calls } = rig({ items: [], project: { id: 'p 1' }, folders: [], files: [] });
    await api.listProjects();
    await api.getProject('p 1');
    await api.renameProject('p1', 'New');
    await api.deleteProject('p1');
    await api.getTree('p1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/projects?pageSize=100', 'GET /api/projects/p%201', 'PATCH /api/projects/p1', 'DELETE /api/projects/p1', 'GET /api/projects/p1/tree',
    ]);
    expect(JSON.parse(calls[2].body!)).toEqual({ name: 'New' });
  });

  it('createProject sends client ids (idempotent creates may be retried)', async () => {
    const { api, calls } = rig({ project: { id: 'prj_1' }, file: { id: 'fil_1', version: 1 } }, { etag: '"1"' });
    const r = await api.createProject({ id: 'prj_1', name: 'P', file: { id: 'fil_1', name: 'F' } });
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/projects' });
    expect(JSON.parse(calls[0].body!)).toEqual({ id: 'prj_1', name: 'P', file: { id: 'fil_1', name: 'F' } });
    expect(r.version).toBe(1);
    expect(r.file.id).toBe('fil_1');
  });

  it('folders and files: create, patch (move / rename), delete', async () => {
    const { api, calls } = rig({ folder: {}, file: {} });
    await api.createFolder('p1', { id: 'fld_1', name: 'docs', parentId: null, position: 2 });
    await api.patchFolder('fld_1', { parentId: 'fld_2', position: 0.5 });
    await api.deleteFolder('fld_1');
    await api.createFile('p1', { id: 'fil_1', name: 'F', folderId: 'fld_1' });
    await api.patchFile('fil_1', { name: 'G', folderId: null });
    await api.deleteFile('fil_1');
    await api.duplicateFile('fil_1', 'fld_9');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /api/projects/p1/folders', 'PATCH /api/folders/fld_1', 'DELETE /api/folders/fld_1', 'POST /api/projects/p1/files', 'PATCH /api/files/fil_1', 'DELETE /api/files/fil_1', 'POST /api/files/fil_1/duplicate',
    ]);
    expect(JSON.parse(calls[1].body!)).toEqual({ parentId: 'fld_2', position: 0.5 });
    expect(JSON.parse(calls[6].body!)).toEqual({ folderId: 'fld_9' });
    expect(calls[1].headers.get('x-csrf-token')).toBe('csrf');
  });

  it('saveFile requires a version (If-Match) and returns the ETag version', async () => {
    const { api, calls } = rig({ file: { id: 'f', version: 4 } }, { etag: '"4"' });
    const r = await api.saveFile('f', { name: 'x', data: {} }, 3);
    expect(calls[0]).toMatchObject({ method: 'PUT', url: '/api/files/f' });
    expect(calls[0].headers.get('if-match')).toBe('"3"');
    expect(r.version).toBe(4);
  });

  it('versions, shares (file or project scope), overrides and prefs', async () => {
    const { api, calls } = rig({ items: [], version: {}, file: {}, share: {}, token: 't', url: 'u', member: {}, prefs: {} });
    await api.listVersions('f1');
    await api.getVersion('f1', 2);
    await api.restoreVersion('f1', 2);
    await api.createShare('p1', 'viewer', { fileId: 'f1', expiresInSeconds: 60 });
    await api.createShare('p1', 'editor');
    await api.setFileOverride('f1', 'u2', 'viewer');
    await api.clearFileOverride('f1', 'u2');
    await api.patchPrefs({ 'ws:p1': { a: 1 } });
    await api.getPrefs();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/files/f1/versions', 'GET /api/files/f1/versions/2', 'POST /api/files/f1/versions/2/restore', 'POST /api/projects/p1/shares', 'POST /api/projects/p1/shares',
      'PUT /api/files/f1/members/u2', 'DELETE /api/files/f1/members/u2', 'PATCH /api/me/prefs', 'GET /api/me/prefs',
    ]);
    expect(JSON.parse(calls[3].body!)).toEqual({ role: 'viewer', expiresInSeconds: 60, fileId: 'f1' });
    expect(JSON.parse(calls[4].body!)).toEqual({ role: 'editor' });
  });

  it('share access: file links use /share/:token, project links /share/:token/files/:id', async () => {
    const { api, calls } = rig({ file: { id: 'f', version: 1 }, share: { scope: 'file' } });
    await api.getShared('tok');
    await api.getShared('tok', 'f1');
    await api.saveShared('tok', { name: 'x' }, 2, 'f1');
    await api.openShared('tok');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/share/tok', 'GET /api/share/tok/files/f1', 'PUT /api/share/tok/files/f1', 'GET /api/share/tok']);
  });

  it('import / export: .sdd into a project (optionally a folder), whole project .sddproj', async () => {
    const { api, calls } = rig({ file: { id: 'f' }, project: { id: 'p' }, folders: [], files: [], warnings: [] });
    const blob = new Blob(['x']);
    await api.importSdd(blob);
    await api.importSdd(blob, 'p1', 'fld_1');
    await api.importProject(blob);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST /api/projects/import', 'POST /api/projects/p1/import?folderId=fld_1', 'POST /api/projects/import-project']);
  });
});

describe('unified .sdd import / export', () => {
  it('importAny posts to /import; exports pick ?type=', async () => {
    const { api, calls } = rig({ kind: 'file', project: { id: 'p' }, file: { id: 'f' }, warnings: [] });
    await api.importAny(new Blob(['x']));
    await api.exportSdd('f1');
    await api.exportSdd('f1', 'text');
    await api.exportProject('p1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST /api/import', 'GET /api/files/f1/export?type=file', 'GET /api/files/f1/export?type=text', 'GET /api/projects/p1/export']);
  });
});

describe('collaboration endpoints (Phase 3)', () => {
  it('comments: list / add / reply / edit / resolve / delete / mark read', async () => {
    const { api, calls } = rig({ threads: [], unread: 0, comment: { id: 'c1' } });
    await api.listComments('f 1');
    await api.addComment('f1', { body: 'hi', anchor: { type: 'point', x: 1, y: 2 } });
    await api.addComment('f1', { body: 'reply', parentId: 'c1' });
    await api.editComment('c1', { body: 'edited' });
    await api.resolveComment('c1', true);
    await api.deleteComment('c1');
    await api.markCommentsRead('f1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/files/f%201/comments', 'POST /api/files/f1/comments', 'POST /api/files/f1/comments', 'PATCH /api/comments/c1', 'PATCH /api/comments/c1', 'DELETE /api/comments/c1', 'POST /api/files/f1/comments/read',
    ]);
    expect(JSON.parse(calls[1].body!)).toEqual({ body: 'hi', anchor: { type: 'point', x: 1, y: 2 } });
    expect(JSON.parse(calls[4].body!)).toEqual({ resolved: true });
  });

  it('notifications and the rtc config', async () => {
    const { api, calls } = rig({ items: [], unread: 0, iceServers: [], maxPeers: 6, enabled: true });
    await api.listNotifications({ unreadOnly: true });
    await api.markNotificationsRead({ all: true });
    await api.markNotificationsRead({ ids: ['n1'] });
    const cfg = await api.rtcConfig();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/notifications?unread=1', 'POST /api/notifications/read', 'POST /api/notifications/read', 'GET /api/rtc/config']);
    expect(JSON.parse(calls[1].body!)).toEqual({ all: true });
    expect(cfg.maxPeers).toBe(6);
  });

  it('named versions', async () => {
    const { api, calls } = rig({ version: { version: 5, label: 'Release', named: true } });
    const v = await api.saveNamedVersion('f1', 'Release');
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/files/f1/versions' });
    expect(JSON.parse(calls[0].body!)).toEqual({ name: 'Release' });
    expect(v.named).toBe(true);
  });

  it('share links and members accept the commenter role', async () => {
    const { api, calls } = rig({ share: {}, token: 't', url: 'u', member: {} });
    await api.createShare('p1', 'commenter', { fileId: 'f1' });
    await api.addMember('p1', 'a@b.c', 'commenter');
    expect(JSON.parse(calls[0].body!)).toEqual({ role: 'commenter', fileId: 'f1' });
    expect(JSON.parse(calls[1].body!)).toEqual({ email: 'a@b.c', role: 'commenter' });
  });
});
