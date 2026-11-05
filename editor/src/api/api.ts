import { ApiClient, type ApiResponse } from './client';
import type { LibraryDoc } from '../lib/library/types';
import type { ApiComment, ApiNotification, ApiUser, AuthConfig, CommentAnchor, CommentList, RtcConfig, FileKind, Member, PublicDiagramDoc, ServerFile, ServerFileMeta, ServerFolder, ServerProjectMeta, ServerTree, ShareLink, SharedOpen, VersionFull, VersionMeta } from './types';

/** the app-wide client: same-origin `/api` (Vite proxies it in dev; the server serves both in single-container mode) */
export let BASE_URL = (import.meta.env?.VITE_API_URL as string | undefined) || '/api';
let clientId: string | undefined;
export const setClientId = (id: string | undefined) => {
  clientId = id;
};
export const getClientId = () => clientId;
let unauthorized: () => void = () => undefined;
export const onUnauthorized = (fn: () => void) => {
  unauthorized = fn;
};
export interface IntrospectResult { schema: import('@core/schema/types').Schema; warnings: string[]; counts: { tables: number; views: number; columns: number; enums: number } }
export const apiClient = new ApiClient({ baseUrl: BASE_URL, clientId: () => clientId, onUnauthorized: () => unauthorized() });
/** embedding: re-point the app-wide client (base URL, host auth headers). The 401 handler is `onUnauthorized(fn)` above. */
export function configureApi(o: { baseUrl?: string; headers?: () => Record<string, string | undefined> }): void {
  if (o.baseUrl) BASE_URL = o.baseUrl.replace(/\/+$/, '');
  apiClient.configure({ baseUrl: BASE_URL, ...(o.headers ? { headers: o.headers } : {}) });
}

/** typed endpoints on top of a client (pass a fake in tests) */
export function createApi(c: ApiClient) {
  const enc = encodeURIComponent;
  /** a saved file + its version (ETag) */
  const fl = (r: ApiResponse<{ file: ServerFile }>) => ({ file: r.data.file, version: r.etag ?? r.data.file.version });
  const q = (path: string) => path;
  void q;
  return {
    client: c,
    authConfig: async () => (await c.get<AuthConfig>('/auth/config', { retries: 0, timeoutMs: 4000 })).data,
    me: async () => {
      const r = (await c.get<{ user: ApiUser; csrfToken: string }>('/auth/me', { retries: 0, timeoutMs: 6000 })).data;
      if (r.csrfToken) c.csrfToken = r.csrfToken;
      return r.user;
    },
    login: async (email: string, password: string) => {
      const r = (await c.post<{ user: ApiUser; csrfToken: string }>('/auth/login', { email, password })).data;
      c.csrfToken = r.csrfToken;
      return r.user;
    },
    register: async (email: string, password: string, name?: string) => {
      const r = (await c.post<{ user: ApiUser; csrfToken: string }>('/auth/register', { email, password, ...(name ? { name } : {}) })).data;
      c.csrfToken = r.csrfToken;
      return r.user;
    },
    logout: async () => {
      await c.post('/auth/logout', undefined, { retries: 0 });
      c.csrfToken = null;
    },

    // ---- projects (containers) ---------------------------------------------------------------
    listProjects: async (query?: { page?: number; pageSize?: number; q?: string; sort?: 'updated' | 'name' }) =>
      (await c.get<{ items: ServerProjectMeta[]; total: number; page: number; pageSize: number }>('/projects', { query: { pageSize: 100, ...query } })).data,
    getProject: async (id: string) => (await c.get<{ project: ServerProjectMeta }>(`/projects/${enc(id)}`)).data.project,
    /** creates the project AND its first file; client-chosen ids make the call idempotent (offline queue replay) */
    createProject: async (body: { id?: string; name: string; file?: { id?: string; name?: string; data?: unknown } }) => {
      const r = await c.post<{ project: ServerProjectMeta; file: ServerFile }>('/projects', body, { retry: !!body.id });
      return { project: r.data.project, file: r.data.file, version: r.etag ?? r.data.file.version };
    },
    renameProject: async (id: string, name: string) => (await c.patch<{ project: ServerProjectMeta }>(`/projects/${enc(id)}`, { name })).data.project,
    deleteProject: async (id: string) => void (await c.delete(`/projects/${enc(id)}`)),
    getTree: async (id: string) => (await c.get<ServerTree>(`/projects/${enc(id)}/tree`)).data,

    // ---- folders -------------------------------------------------------------------------------
    createFolder: async (projectId: string, body: { id?: string; name: string; parentId?: string | null; position?: number }) =>
      (await c.post<{ folder: ServerFolder }>(`/projects/${enc(projectId)}/folders`, body, { retry: !!body.id })).data.folder,
    patchFolder: async (id: string, body: { name?: string; parentId?: string | null; position?: number }) => (await c.patch<{ folder: ServerFolder }>(`/folders/${enc(id)}`, body)).data.folder,
    deleteFolder: async (id: string) => (await c.delete<{ deletedFolders: number; deletedFiles: number }>(`/folders/${enc(id)}`)).data,

    // ---- files ---------------------------------------------------------------------------------
    createFile: async (projectId: string, body: { id?: string; name: string; kind?: FileKind; folderId?: string | null; position?: number; data?: unknown }) =>
      fl(await c.post(`/projects/${enc(projectId)}/files`, body, { retry: !!body.id })),
    getFile: async (id: string) => fl(await c.get(`/files/${enc(id)}`)),
    saveFile: async (id: string, body: { name?: string; data?: unknown }, version: number, o?: { keepalive?: boolean }) => fl(await c.put(`/files/${enc(id)}`, body, { ifMatch: version, ...(o?.keepalive ? { keepalive: true } : {}) })),
    patchFile: async (id: string, body: { name?: string; folderId?: string | null; position?: number; kind?: FileKind }) => (await c.patch<{ file: ServerFileMeta }>(`/files/${enc(id)}`, body)).data.file,
    deleteFile: async (id: string) => void (await c.delete(`/files/${enc(id)}`)),
    duplicateFile: async (id: string, folderId?: string | null) => fl(await c.post(`/files/${enc(id)}/duplicate`, folderId === undefined ? undefined : { folderId })),
    // private stickies: mine only, outside the shared document
    getPrivate: async (fileId: string) => (await c.get<{ nodes: unknown[]; edges: unknown[]; updatedAt?: number }>(`/files/${enc(fileId)}/private`)).data,
    putPrivate: async (fileId: string, p: { nodes: unknown[]; edges: unknown[] }) => (await c.put<{ nodes: unknown[]; edges: unknown[]; updatedAt?: number }>(`/files/${enc(fileId)}/private`, p)).data,
    putThumbnail: async (fileId: string, image: Blob, type: 'image/png' | 'image/webp' = 'image/png') => (await c.put<{ thumbnailUrl: string }>(`/files/${enc(fileId)}/thumbnail`, undefined, { body: image, headers: { 'content-type': type } })).data,

    /** content-addressed image store (PNG, JPEG, WebP, SVG sanitized by the server); `hash` is of the stored bytes (an SVG's differs from the upload) */
    uploadAsset: async (image: Blob, name = 'image') => {
      const fd = new FormData();
      fd.append('file', image, name);
      return (await c.post<{ asset: { hash: string; mime: string; size: number; url: string } }>('/assets', undefined, { body: fd, timeoutMs: 60000 })).data.asset;
    },

    // ---- import / export -----------------------------------------------------------------------
    /** any .sdd (the server sniffs: file container, project container or text) -> a new file in the project (or a new project when projectId is omitted) */
    importSdd: async (file: Blob, projectId?: string, folderId?: string | null) => {
      const fd = new FormData();
      fd.append('file', file, (file as File).name || 'file.sdd');
      const path = projectId ? `/projects/${enc(projectId)}/import` : '/projects/import';
      const r = await c.post<{ project?: ServerProjectMeta; file: ServerFile; warnings: string[] }>(path, undefined, { body: fd, timeoutMs: 60000, query: { folderId: folderId ?? undefined } });
      return { project: r.data.project, file: r.data.file, warnings: r.data.warnings ?? [] };
    },
    /** `type: 'file'` (default) = the ZIP container, `'text'` = the "#!sdd" text of the active page */
    exportSdd: async (fileId: string, type: 'file' | 'text' = 'file') => (await c.get<Blob>(`/files/${enc(fileId)}/export`, { as: 'blob', timeoutMs: 60000, query: { type } })).data,
    exportProject: async (projectId: string) => (await c.get<Blob>(`/projects/${enc(projectId)}/export`, { as: 'blob', timeoutMs: 120000 })).data,
    /** POST /import: the server sniffs the content; `kind` says what it was */
    importAny: async (file: Blob) => {
      const fd = new FormData();
      fd.append('file', file, (file as File).name || 'import.sdd');
      const r = await c.post<{ kind: 'file' | 'text' | 'project'; project: ServerProjectMeta; file?: ServerFile; folders?: ServerFolder[]; files?: ServerFileMeta[]; warnings: string[] }>('/import', undefined, { body: fd, timeoutMs: 120000 });
      return { ...r.data, warnings: r.data.warnings ?? [] };
    },
    importProject: async (file: Blob) => {
      const fd = new FormData();
      fd.append('file', file, (file as File).name || 'project.sdd');
      const r = await c.post<{ project: ServerProjectMeta; folders: ServerFolder[]; files: ServerFileMeta[]; warnings: string[] }>('/projects/import-project', undefined, { body: fd, timeoutMs: 120000 });
      return { ...r.data, warnings: r.data.warnings ?? [] };
    },

    // ---- schema tools: reverse-engineer a live database (read-only; the credentials are not stored) ------
    introspectDb: async (body: { dialect: 'postgres' | 'mysql'; host: string; port?: number; user: string; password?: string; database: string; ssl?: boolean; schema?: string }) =>
      (await c.post<IntrospectResult>('/schema/introspect', body, { timeoutMs: 30000 })).data,
    /** the app's own database schema as SQL DDL (admins only) */
    serverSchemaSql: async (prefix?: string) =>
      (await c.get<string>(`/schema${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`, { as: 'text', timeoutMs: 30000 })).data,
    introspectSqlite: async (file: Blob) => {
      const fd = new FormData();
      fd.append('file', file, (file as File).name || 'db.sqlite');
      return (await c.post<IntrospectResult>('/schema/introspect/sqlite', undefined, { body: fd, timeoutMs: 60000 })).data;
    },

    // ---- history / sharing / members ---------------------------------------------------------
    listVersions: async (fileId: string) => (await c.get<{ items: VersionMeta[] }>(`/files/${enc(fileId)}/versions`)).data.items,
    getVersion: async (fileId: string, v: number) => (await c.get<{ version: VersionFull }>(`/files/${enc(fileId)}/versions/${v}`)).data.version,
    /** "Save version…": name the file as it is now (named versions are never pruned) */
    saveNamedVersion: async (fileId: string, name: string) => (await c.post<{ version: VersionMeta }>(`/files/${enc(fileId)}/versions`, { name })).data.version,
    restoreVersion: async (fileId: string, v: number) => fl(await c.post(`/files/${enc(fileId)}/versions/${v}/restore`)),

    listShares: async (projectId: string) => (await c.get<{ items: ShareLink[] }>(`/projects/${enc(projectId)}/shares`)).data.items,
    /** fileId set = a link to that file only, omitted = the whole project */
    createShare: async (projectId: string, role: 'viewer' | 'commenter' | 'editor', opts: { expiresInSeconds?: number; fileId?: string } = {}) =>
      (await c.post<{ share: ShareLink; token: string; url: string }>(`/projects/${enc(projectId)}/shares`, { role, ...(opts.expiresInSeconds ? { expiresInSeconds: opts.expiresInSeconds } : {}), ...(opts.fileId ? { fileId: opts.fileId } : {}) })).data,
    revokeShare: async (projectId: string, shareId: string) => void (await c.delete(`/projects/${enc(projectId)}/shares/${enc(shareId)}`)),
    openShared: async (token: string) => {
      const r = await c.get<SharedOpen>(`/share/${enc(token)}`);
      return { ...r.data, version: r.etag };
    },
    /** a published diagram by slug (anonymous): `{data: {..., author, data: <document>}}`, the blog's envelope */
    getPublic: async (slug: string) => (await c.get<{ data: PublicDiagramDoc }>(`/public/${enc(slug)}`)).data.data,
    getShared: async (token: string, fileId?: string) => fl(await c.get(fileId ? `/share/${enc(token)}/files/${enc(fileId)}` : `/share/${enc(token)}`, { })),
    saveShared: async (token: string, body: { name?: string; data?: unknown }, version: number, fileId?: string, o?: { keepalive?: boolean }) =>
      fl(await c.put(fileId ? `/share/${enc(token)}/files/${enc(fileId)}` : `/share/${enc(token)}`, body, { ifMatch: version, ...(o?.keepalive ? { keepalive: true } : {}) })),

    listMembers: async (projectId: string) => (await c.get<{ items: Member[] }>(`/projects/${enc(projectId)}/members`)).data.items,
    addMember: async (projectId: string, email: string, role: Member['role']) => (await c.post<{ member: Member }>(`/projects/${enc(projectId)}/members`, { email, role })).data.member,
    setMemberRole: async (projectId: string, userId: string, role: Member['role']) => void (await c.patch(`/projects/${enc(projectId)}/members/${enc(userId)}`, { role })),
    removeMember: async (projectId: string, userId: string) => void (await c.delete(`/projects/${enc(projectId)}/members/${enc(userId)}`)),
    listFileOverrides: async (fileId: string) => (await c.get<{ items: Member[] }>(`/files/${enc(fileId)}/members`)).data.items,
    setFileOverride: async (fileId: string, userId: string, role: 'viewer' | 'commenter' | 'editor') => void (await c.put(`/files/${enc(fileId)}/members/${enc(userId)}`, { role })),
    clearFileOverride: async (fileId: string, userId: string) => void (await c.delete(`/files/${enc(fileId)}/members/${enc(userId)}`)),

    // ---- project library (components, styles, tokens) -------------------------------------------
    getLibrary: async (projectId: string) => (await c.get<{ rev: number; doc: LibraryDoc }>(`/projects/${enc(projectId)}/library`, { retries: 1, timeoutMs: 8000 })).data,
    putLibrary: async (projectId: string, baseRev: number, doc: LibraryDoc) => (await c.put<{ rev: number; doc: LibraryDoc }>(`/projects/${enc(projectId)}/library`, { baseRev, doc }, { retries: 0, timeoutMs: 15000 })).data,

    // ---- comments / notifications / audio rooms -----------------------------------------------
    listComments: async (fileId: string) => (await c.get<CommentList>(`/files/${enc(fileId)}/comments`)).data,
    addComment: async (fileId: string, body: { body: string; anchor?: CommentAnchor; parentId?: string }) => (await c.post<{ comment: ApiComment }>(`/files/${enc(fileId)}/comments`, body)).data.comment,
    editComment: async (id: string, patch: { body: string }) => (await c.patch<{ comment: ApiComment }>(`/comments/${enc(id)}`, patch)).data.comment,
    resolveComment: async (id: string, resolved: boolean) => (await c.patch<{ comment: ApiComment }>(`/comments/${enc(id)}`, { resolved })).data.comment,
    deleteComment: async (id: string) => void (await c.delete(`/comments/${enc(id)}`)),
    markCommentsRead: async (fileId: string) => void (await c.post(`/files/${enc(fileId)}/comments/read`)),
    listNotifications: async (o: { unreadOnly?: boolean; limit?: number } = {}) =>
      (await c.get<{ items: ApiNotification[]; unread: number }>('/notifications', { retries: 0, timeoutMs: 6000, query: { ...(o.unreadOnly ? { unread: 1 } : {}), ...(o.limit ? { limit: o.limit } : {}) } })).data,
    markNotificationsRead: async (o: { ids?: string[]; all?: boolean }) => void (await c.post('/notifications/read', o)),
    /** the MQTT broker's path and limits (`GET /realtime/config`; session or `X-Share-Token`) */
    realtimeConfig: async (shareToken?: string | null) => (await c.get<unknown>('/realtime/config', { retries: 0, timeoutMs: 6000, ...(shareToken ? { headers: { 'x-share-token': shareToken } } : {}) })).data,
    rtcConfig: async () => (await c.get<RtcConfig>('/rtc/config', { retries: 0, timeoutMs: 6000 })).data,

    // ---- per-user preferences (open tabs, starred files ...) ---------------------------------
    getPrefs: async () => (await c.get<{ prefs: Record<string, unknown> }>('/me/prefs', { retries: 0, timeoutMs: 6000 })).data.prefs,
    patchPrefs: async (patch: Record<string, unknown>) => (await c.patch<{ prefs: Record<string, unknown> }>('/me/prefs', patch, { retries: 0, timeoutMs: 8000 })).data.prefs,
  };
}
export type Api = ReturnType<typeof createApi>;
export const api: Api = createApi(apiClient);
