import { z } from "zod";
import { http } from "@/shared/api";
import { ApiError, dataEnvelope, type Page, type PageRequest, pageEnvelope } from "@/shared/http";
import {
  createdFileSchema,
  createdSchema,
  createdShareSchema,
  type DiagramFile,
  type DiagramKind,
  type DiagramProject,
  type DiagramRole,
  type DiagramTemplate,
  type DiagramTree,
  diagramClapsSchema,
  diagramViewerSchema,
  type FileVersion,
  fileMetaSchema,
  fileVersionSchema,
  folderSchema,
  memberListSchema,
  type ProjectList,
  type ProjectMember,
  type Publication,
  type PublicDiagram,
  type PublishedList,
  type PublishVisibility,
  projectListSchema,
  projectSchema,
  publicationSchema,
  publicDiagramSchema,
  publishedListSchema,
  roleSchema,
  type ShareLink,
  type ShareRole,
  shareListSchema,
  templateSchema,
  treeSchema,
} from "../domain/diagram";

const importedSddSchema = z.object({
  kind: z.string(),
  project: projectSchema,
  file: fileMetaSchema.optional(),
  warnings: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
});
export type ImportedSdd = z.output<typeof importedSddSchema>;

/** 422 SDD_INVALID: the upload is not a usable .sdd; `message` is the server's reason. */
export class SddInvalidError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SddInvalidError";
  }
}

/** The diagram API (`/api/diagrams`): bare JSON bodies, camelCase, epoch-ms times. */
const base = "/diagrams";
const enc = encodeURIComponent;

export const diagramRepository = {
  projects: (q: { q?: string; sort?: "updated" | "name"; page?: number } = {}, signal?: AbortSignal): Promise<ProjectList> =>
    http(`${base}/projects`, { query: { pageSize: 100, ...q }, schema: projectListSchema, signal }),
  project: async (id: string, signal?: AbortSignal): Promise<DiagramProject> =>
    (await http(`${base}/projects/${enc(id)}`, { schema: z.object({ project: projectSchema }), signal })).project,
  tree: (id: string, signal?: AbortSignal): Promise<DiagramTree> => http(`${base}/projects/${enc(id)}/tree`, { schema: treeSchema, signal }),
  /** A project always starts with one file. */
  createProject: (name: string, fileName?: string, data?: unknown) =>
    http(`${base}/projects`, { method: "POST", body: { name, file: { name: fileName ?? name, ...(data ? { data } : {}) } }, schema: createdSchema }),
  renameProject: (id: string, name: string) => http(`${base}/projects/${enc(id)}`, { method: "PATCH", body: { name } }).then(() => undefined),
  deleteProject: (id: string) => http(`${base}/projects/${enc(id)}`, { method: "DELETE" }).then(() => undefined),
  createFile: async (projectId: string, body: { name: string; kind?: DiagramKind; folderId?: string | null }): Promise<DiagramFile> =>
    (await http(`${base}/projects/${enc(projectId)}/files`, { method: "POST", body, schema: createdFileSchema })).file,
  setKind: (fileId: string, kind: DiagramKind) => http(`${base}/files/${enc(fileId)}`, { method: "PATCH", body: { kind } }).then(() => undefined),
  renameFile: (id: string, name: string) => http(`${base}/files/${enc(id)}`, { method: "PATCH", body: { name } }).then(() => undefined),
  deleteFile: (id: string) => http(`${base}/files/${enc(id)}`, { method: "DELETE" }).then(() => undefined),
  /** Moves a file into a folder (`null` = project root). */
  moveFile: (id: string, folderId: string | null) => http(`${base}/files/${enc(id)}`, { method: "PATCH", body: { folderId } }).then(() => undefined),
  duplicateFile: (id: string) => http(`${base}/files/${enc(id)}/duplicate`, { method: "POST", body: {} }).then(() => undefined),

  // ---- folders ----
  createFolder: async (projectId: string, name: string, parentId: string | null = null) =>
    (await http(`${base}/projects/${enc(projectId)}/folders`, { method: "POST", body: { name, parentId }, schema: z.object({ folder: folderSchema }) })).folder,
  renameFolder: (id: string, name: string) => http(`${base}/folders/${enc(id)}`, { method: "PATCH", body: { name } }).then(() => undefined),
  deleteFolder: (id: string) => http(`${base}/folders/${enc(id)}`, { method: "DELETE" }).then(() => undefined),

  // ---- sharing (owner; members may leave) ----
  members: async (projectId: string, signal?: AbortSignal): Promise<ProjectMember[]> =>
    (await http(`${base}/projects/${enc(projectId)}/members`, { schema: memberListSchema, signal })).items,
  /** `login` is an email or a username. Inviting someone again changes the role. */
  addMember: (projectId: string, login: string, role: ShareRole) =>
    http(`${base}/projects/${enc(projectId)}/members`, { method: "POST", body: { email: login, role } }).then(() => undefined),
  setMemberRole: (projectId: string, userId: string, role: ShareRole) =>
    http(`${base}/projects/${enc(projectId)}/members/${enc(userId)}`, { method: "PATCH", body: { role } }).then(() => undefined),
  removeMember: (projectId: string, userId: string) =>
    http(`${base}/projects/${enc(projectId)}/members/${enc(userId)}`, { method: "DELETE" }).then(() => undefined),
  shares: async (projectId: string, signal?: AbortSignal): Promise<ShareLink[]> =>
    (await http(`${base}/projects/${enc(projectId)}/shares`, { schema: shareListSchema, signal })).items,
  createShare: (projectId: string, body: { role: ShareRole; expiresInSeconds?: number }) =>
    http(`${base}/projects/${enc(projectId)}/shares`, { method: "POST", body, schema: createdShareSchema }),
  revokeShare: (projectId: string, shareId: string) =>
    http(`${base}/projects/${enc(projectId)}/shares/${enc(shareId)}`, { method: "DELETE" }).then(() => undefined),

  // ---- publishing (owner) ----
  publication: (fileId: string, signal?: AbortSignal): Promise<Publication> =>
    http(`${base}/files/${enc(fileId)}/publish`, { schema: publicationSchema, signal }),
  publish: (fileId: string, body: { visibility: PublishVisibility; title: string; description: string; tags: string[] }): Promise<Publication> =>
    http(`${base}/files/${enc(fileId)}/publish`, { method: "POST", body, schema: publicationSchema }),
  unpublish: (fileId: string) => http(`${base}/files/${enc(fileId)}/publish`, { method: "DELETE" }).then(() => undefined),

  // ---- public reads (the blog's dialect) ----
  publicDiagram: async (slug: string, signal?: AbortSignal): Promise<PublicDiagram> =>
    (await http(`${base}/public/${enc(slug)}`, { schema: dataEnvelope(publicDiagramSchema), signal })).data,
  /** Claps and bookmarks (signed-in readers; the viewer read answers zeros to anyone else). */
  diagramViewer: async (slug: string, signal?: AbortSignal) =>
    (await http(`${base}/public/${enc(slug)}/me`, { schema: dataEnvelope(diagramViewerSchema), signal })).data,
  clapDiagram: async (slug: string, count: number) =>
    (await http(`${base}/public/${enc(slug)}/clap`, { method: "POST", body: { count }, schema: dataEnvelope(diagramClapsSchema) })).data,
  bookmarkDiagram: async (slug: string, on: boolean): Promise<void> => {
    await http(`${base}/public/${enc(slug)}/bookmark`, { method: on ? "POST" : "DELETE" });
  },
  /** Counts one unique view of a published diagram; the cached page can't. Best effort. */
  viewDiagram: async (slug: string): Promise<void> => {
    await http(`${base}/public/${enc(slug)}/view`, { method: "POST" }).catch(() => undefined);
  },
  bookmarkedDiagrams: (r: PageRequest = {}, signal?: AbortSignal): Promise<Page<PublicDiagram>> =>
    http("/me/diagram-bookmarks", { query: { page: r.page, limit: r.limit }, schema: pageEnvelope(publicDiagramSchema), signal }),
  publicDiagrams: (q: { q?: string; tag?: string } = {}, r: PageRequest = {}, signal?: AbortSignal): Promise<Page<PublicDiagram>> =>
    http(`${base}/public`, { query: { q: q.q, tag: q.tag, page: r.page, limit: r.limit }, schema: pageEnvelope(publicDiagramSchema), signal }),
  published: (page: number, pageSize: number, signal?: AbortSignal): Promise<PublishedList> =>
    http(`${base}/published`, { query: { page, pageSize }, schema: publishedListSchema, signal }),
  userDiagrams: (username: string, r: PageRequest = {}, signal?: AbortSignal): Promise<Page<PublicDiagram>> =>
    http(`/users/${enc(username)}/diagrams`, { query: { page: r.page, limit: r.limit }, schema: pageEnvelope(publicDiagramSchema), signal }),

  // ---- templates ----
  templates: async (signal?: AbortSignal): Promise<DiagramTemplate[]> =>
    (
      await http(`${base}/templates`, {
        schema: dataEnvelope(
          z
            .array(templateSchema)
            .nullish()
            .transform((v) => v ?? []),
        ),
        signal,
      })
    ).data,
  /** POST /import (multipart "file"): any .sdd container becomes a NEW project. A bad file is 422 SDD_INVALID, thrown as `SddInvalidError`. */
  importSdd: async (file: File, signal?: AbortSignal): Promise<ImportedSdd> => {
    const fd = new FormData();
    fd.set("file", file);
    try {
      return await http(`${base}/import`, { method: "POST", body: fd, schema: importedSddSchema, timeoutMs: 120_000, signal });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const err = (e.problem as { error?: { code?: string; message?: string; details?: { reason?: string } } }).error;
        if (err?.code === "SDD_INVALID") throw new SddInvalidError(err.details?.reason || err.message || "Invalid .sdd file");
      }
      throw e;
    }
  },
  /** GET /files/:id/export: the file as a .sdd container (viewers and up). */
  exportFile: (id: string) => http(`${base}/files/${enc(id)}/export`, { blob: true, timeoutMs: 120_000 }) as Promise<Blob>,
  /** GET /projects/:id/export: the whole project (folders and files) as one .sdd container. */
  exportProject: (id: string) => http(`${base}/projects/${enc(id)}/export`, { blob: true, timeoutMs: 120_000 }) as Promise<Blob>,
  forkTemplate: (id: string) => http(`${base}/templates/${enc(id)}/fork`, { method: "POST", schema: createdSchema }),
};

/** Version history of a file (`/files/:id/versions`). */
export const versionsRepository = {
  list: async (fileId: string, signal?: AbortSignal): Promise<FileVersion[]> =>
    (await http(`${base}/files/${enc(fileId)}/versions`, { schema: z.object({ items: z.array(fileVersionSchema).nullish() }), signal })).items ?? [],
  get: async (fileId: string, version: number, signal?: AbortSignal): Promise<FileVersion> =>
    (await http(`${base}/files/${enc(fileId)}/versions/${version}`, { schema: z.object({ version: fileVersionSchema }), signal })).version,
  saveNamed: async (fileId: string, name: string): Promise<FileVersion> =>
    (await http(`${base}/files/${enc(fileId)}/versions`, { method: "POST", body: { name }, schema: z.object({ version: fileVersionSchema }) })).version,
  restore: (fileId: string, version: number) => http(`${base}/files/${enc(fileId)}/versions/${version}/restore`, { method: "POST" }).then(() => undefined),
  /** The caller's role on the file (the file read also carries its document; only the role is used). */
  role: async (fileId: string, signal?: AbortSignal): Promise<DiagramRole> =>
    (await http(`${base}/files/${enc(fileId)}`, { schema: z.object({ file: z.object({ role: roleSchema.catch("viewer") }) }), signal })).file.role,
};
