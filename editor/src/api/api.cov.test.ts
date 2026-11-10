import { describe, expect, it, vi } from 'vitest';
import { BASE_URL, apiClient, configureApi, createApi, getClientId, onUnauthorized, setClientId } from './api';
import { ApiClient } from './client';

function rig(body: unknown = {}, headers: Record<string, string> = {}) {
  const calls: { url: string; method: string; body: unknown; headers: Headers }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: String(init.method), body: init.body, headers: new Headers(init.headers) });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
  });
  const client = new ApiClient({ fetch, baseUrl: '/api', sleep: async () => undefined, readCookie: () => 'csrf', uuid: () => 'r' });
  return { api: createApi(client), calls, client };
}
const sig = (c: { method: string; url: string }) => `${c.method} ${c.url}`;
const json = (c: { body: unknown }) => JSON.parse(c.body as string);
const blob = new Blob(['x']);

describe('createApi endpoints', () => {
  it('auth flow stores the csrf token', async () => {
    const r = rig({ user: { id: 'u' }, csrfToken: 'tok', features: {} });
    await r.api.authConfig();
    expect(await r.api.me()).toEqual({ id: 'u' });
    expect(r.client.csrfToken).toBe('tok');
    r.client.csrfToken = null;
    await r.api.login('a@b', 'pw');
    expect(r.client.csrfToken).toBe('tok');
    r.client.csrfToken = null;
    await r.api.register('a@b', 'pw', 'Ann');
    await r.api.register('a@b', 'pw');
    expect(json(r.calls[3])).toEqual({ email: 'a@b', password: 'pw', name: 'Ann' });
    expect(json(r.calls[4])).toEqual({ email: 'a@b', password: 'pw' });
    await r.api.logout();
    expect(r.client.csrfToken).toBeNull();
    expect(r.calls.map(sig)).toEqual(['GET /api/auth/config', 'GET /api/auth/me', 'POST /api/auth/login', 'POST /api/auth/register', 'POST /api/auth/register', 'POST /api/auth/logout']);
  });
  it('me keeps the csrf token when the server omits it', async () => {
    const r = rig({ user: { id: 'u' } });
    r.client.csrfToken = 'old';
    await r.api.me();
    expect(r.client.csrfToken).toBe('old');
  });

  it('projects, folders, files', async () => {
    const r = rig({ project: { id: 'p' }, file: { id: 'f', version: 4 }, folder: { id: 'd' }, items: [] }, { etag: '"9"' });
    const cp = await r.api.createProject({ name: 'N' });
    expect(cp.version).toBe(9);
    await r.api.createProject({ id: 'x', name: 'N', file: { name: 'a' } });
    await r.api.createFolder('p', { name: 'F' });
    await r.api.createFolder('p', { id: 'd', name: 'F', parentId: null });
    await r.api.patchFolder('d', { name: 'G' });
    await r.api.deleteFolder('d');
    const cf = await r.api.createFile('p', { name: 'a', kind: 'diagram' });
    expect(cf.version).toBe(9);
    await r.api.createFile('p', { id: 'f', name: 'a' });
    await r.api.getFile('f/1');
    await r.api.saveFile('f', { name: 'n' }, 3);
    await r.api.saveFile('f', { data: {} }, 3, { keepalive: true });
    await r.api.patchFile('f', { folderId: null });
    await r.api.deleteFile('f');
    await r.api.duplicateFile('f');
    await r.api.duplicateFile('f', 'd');
    expect(r.calls.map(sig)).toEqual([
      'POST /api/projects', 'POST /api/projects', 'POST /api/projects/p/folders', 'POST /api/projects/p/folders', 'PATCH /api/folders/d', 'DELETE /api/folders/d',
      'POST /api/projects/p/files', 'POST /api/projects/p/files', 'GET /api/files/f%2F1', 'PUT /api/files/f', 'PUT /api/files/f', 'PATCH /api/files/f', 'DELETE /api/files/f',
      'POST /api/files/f/duplicate', 'POST /api/files/f/duplicate',
    ]);
    expect(r.calls[9].headers.get('if-match')).toBeTruthy();
    expect(r.calls[13].body).toBeUndefined();
    expect(json(r.calls[14])).toEqual({ folderId: 'd' });
  });
  it('fl falls back to the file version when there is no etag', async () => {
    const r = rig({ file: { id: 'f', version: 4 } });
    expect((await r.api.getFile('f')).version).toBe(4);
  });

  it('assets, thumbnails, private', async () => {
    const r = rig({ asset: { hash: 'h' }, thumbnailUrl: 'u', nodes: [], edges: [] });
    expect(await r.api.uploadAsset(blob)).toEqual({ hash: 'h' });
    await r.api.uploadAsset(blob, 'n.png');
    expect(await r.api.putThumbnail('f', blob)).toEqual({ thumbnailUrl: 'u', nodes: [], edges: [], asset: { hash: 'h' } });
    await r.api.putThumbnail('f', blob, 'image/webp');
    expect(r.calls[2].headers.get('content-type')).toBe('image/png');
    expect(r.calls[3].headers.get('content-type')).toBe('image/webp');
    expect(r.calls[0].body).toBeInstanceOf(FormData);
  });

  it('imports and exports', async () => {
    const r = rig({ file: { id: 'f' }, project: { id: 'p' }, warnings: undefined });
    expect((await r.api.importSdd(blob)).warnings).toEqual([]);
    await r.api.importSdd(new File(['x'], 'a.sdd'), 'p 1', 'fo');
    await r.api.importSdd(blob, 'p', null);
    expect(r.calls.map((c) => c.url)).toEqual(['/api/projects/import', '/api/projects/p%201/import?folderId=fo', '/api/projects/p/import']);
    expect((await r.api.importAny(blob)).warnings).toEqual([]);
    await r.api.importAny(new File(['x'], 'z.sdd'));
    expect((await r.api.importProject(blob)).warnings).toEqual([]);
    await r.api.importProject(new File(['x'], 'z.sdd'));
    const rb = rig({});
    const orig = globalThis.Response;
    void orig;
    await rb.api.exportSdd('f');
    await rb.api.exportSdd('f', 'text');
    await rb.api.exportProject('p');
    expect(rb.calls.map((c) => c.url)).toEqual(['/api/files/f/export?type=file', '/api/files/f/export?type=text', '/api/projects/p/export']);
  });

  it('schema tools', async () => {
    const r = rig({ schema: {}, warnings: [], counts: {} });
    await r.api.introspectDb({ dialect: 'postgres', host: 'h', user: 'u', database: 'd' });
    await r.api.serverSchemaSql();
    await r.api.serverSchemaSql('a b');
    await r.api.introspectSqlite(blob);
    await r.api.introspectSqlite(new File(['x'], 'd.sqlite'));
    expect(r.calls.map(sig)).toEqual(['POST /api/schema/introspect', 'GET /api/schema', 'GET /api/schema?prefix=a%20b', 'POST /api/schema/introspect/sqlite', 'POST /api/schema/introspect/sqlite']);
  });

  it('versions, shares, members, overrides', async () => {
    const r = rig({ items: [], version: { version: 1 }, file: { id: 'f', version: 2 }, share: {}, token: 't', url: 'u', member: {}, data: 1 }, { etag: '"2"' });
    await r.api.listVersions('f');
    await r.api.getVersion('f', 2);
    await r.api.saveNamedVersion('f', 'rel');
    await r.api.restoreVersion('f', 2);
    await r.api.listShares('p');
    await r.api.createShare('p', 'viewer');
    await r.api.createShare('p', 'editor', { expiresInSeconds: 60, fileId: 'f' });
    await r.api.revokeShare('p', 's');
    const o = await r.api.openShared('tok');
    expect(o.version).toBe(2);
    await r.api.getPublic('slug');
    await r.api.getShared('t');
    await r.api.getShared('t', 'f');
    await r.api.saveShared('t', {}, 1);
    await r.api.saveShared('t', {}, 1, 'f', { keepalive: true });
    await r.api.listMembers('p');
    await r.api.addMember('p', 'a@b', 'editor');
    await r.api.setMemberRole('p', 'u', 'viewer');
    await r.api.removeMember('p', 'u');
    await r.api.listFileOverrides('f');
    await r.api.setFileOverride('f', 'u', 'viewer');
    await r.api.clearFileOverride('f', 'u');
    expect(json(r.calls[5])).toEqual({ role: 'viewer' });
    expect(json(r.calls[6])).toEqual({ role: 'editor', expiresInSeconds: 60, fileId: 'f' });
    expect(r.calls.map((c) => c.url).slice(10, 14)).toEqual(['/api/share/t', '/api/share/t/files/f', '/api/share/t', '/api/share/t/files/f']);
  });

  it('library, comments, notifications, config, prefs', async () => {
    const r = rig({ rev: 1, doc: {}, comment: {}, items: [], prefs: { a: 1 } });
    await r.api.getLibrary('p');
    await r.api.putLibrary('p', 1, {} as never);
    await r.api.listComments('f');
    await r.api.addComment('f', { body: 'hi' });
    await r.api.editComment('c', { body: 'x' });
    await r.api.resolveComment('c', true);
    await r.api.deleteComment('c');
    await r.api.markCommentsRead('f');
    await r.api.listNotifications();
    await r.api.listNotifications({ unreadOnly: true, limit: 5 });
    await r.api.markNotificationsRead({ all: true });
    await r.api.realtimeConfig();
    await r.api.realtimeConfig('share-tok');
    await r.api.rtcConfig();
    expect(await r.api.getPrefs()).toEqual({ a: 1 });
    expect(await r.api.patchPrefs({ a: 2 })).toEqual({ a: 1 });
    expect(r.calls[8].url).toBe('/api/notifications');
    expect(r.calls[9].url).toBe('/api/notifications?unread=1&limit=5');
    expect(r.calls[11].headers.get('x-share-token')).toBeNull();
    expect(r.calls[12].headers.get('x-share-token')).toBe('share-tok');
  });
});

describe('app-wide client helpers', () => {
  it('client id, unauthorized hook and configureApi', () => {
    setClientId('c1');
    expect(getClientId()).toBe('c1');
    setClientId(undefined);
    expect(getClientId()).toBeUndefined();
    const fn = vi.fn();
    onUnauthorized(fn);
    const spy = vi.spyOn(apiClient, 'configure');
    const before = BASE_URL;
    configureApi({});
    expect(spy).toHaveBeenLastCalledWith({ baseUrl: before });
    const headers = () => ({ a: 'b' });
    configureApi({ baseUrl: 'https://x.test/api///', headers });
    expect(spy).toHaveBeenLastCalledWith({ baseUrl: 'https://x.test/api', headers });
    configureApi({ baseUrl: before });
    spy.mockRestore();
  });
});
