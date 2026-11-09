import { z } from "zod";

/** The editor's file kinds: system design, DB (ER), UML / OOD, free-form board. */
export const diagramKindSchema = z.enum(["sdd", "erd", "uml", "board"]);
export type DiagramKind = z.infer<typeof diagramKindSchema>;

/** What the Write menu offers. `kind` is the file kind the new diagram starts as. */
export const NEW_DIAGRAMS = [
  { kind: "sdd", name: "System design" },
  { kind: "erd", name: "DB diagram" },
  { kind: "uml", name: "OOD diagram" },
] as const satisfies readonly { kind: DiagramKind; name: string }[];
export type NewDiagramKind = (typeof NEW_DIAGRAMS)[number]["kind"];

const role = z.enum(["viewer", "commenter", "editor", "owner"]);
export type DiagramRole = z.infer<typeof role>;

/** Times are epoch milliseconds, ids strings (the diagram API is a port of the editor's own server). */
export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: role.catch("viewer"),
  treeRev: z.number().default(0),
  fileCount: z.number().default(0),
  folderCount: z.number().default(0),
  thumbnailUrl: z.string().nullish(),
  ownerId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  updatedBy: z.string().nullish(),
});
export type DiagramProject = z.infer<typeof projectSchema>;

export const fileMetaSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  folderId: z.string().nullable(),
  name: z.string(),
  kind: diagramKindSchema.catch("sdd"),
  position: z.number().default(0),
  version: z.number().default(1),
  pageCount: z.number().default(1),
  thumbnailUrl: z.string().nullish(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type DiagramFile = z.infer<typeof fileMetaSchema>;

export const folderSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  position: z.number().default(0),
});
export type DiagramFolder = z.infer<typeof folderSchema>;

export const projectListSchema = z.object({ items: z.array(projectSchema), total: z.number(), page: z.number(), pageSize: z.number() });
export type ProjectList = z.infer<typeof projectListSchema>;

export const treeSchema = z.object({
  project: projectSchema,
  treeRev: z.number().default(0),
  folders: z.array(folderSchema).default([]),
  files: z.array(fileMetaSchema).default([]),
});
export type DiagramTree = z.infer<typeof treeSchema>;

/** Roles an owner can hand out (never "owner"). */
export const SHARE_ROLES = ["viewer", "commenter", "editor"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

export const memberSchema = z.object({
  userId: z.string(),
  email: z.string().default(""),
  name: z.string().default(""),
  role: role.catch("viewer"),
  createdAt: z.number().default(0),
  isOriginalOwner: z.boolean().optional(),
});
export type ProjectMember = z.infer<typeof memberSchema>;
export const memberListSchema = z.object({
  items: z
    .array(memberSchema)
    .nullish()
    .transform((v) => v ?? []),
});

export const shareLinkSchema = z.object({
  id: z.string(),
  role: role.catch("viewer"),
  fileId: z.string().nullish(),
  expiresAt: z.number().nullish(),
  revokedAt: z.number().nullish(),
  createdAt: z.number().default(0),
});
export type ShareLink = z.infer<typeof shareLinkSchema>;
export const shareListSchema = z.object({
  items: z
    .array(shareLinkSchema)
    .nullish()
    .transform((v) => v ?? []),
});
export const createdShareSchema = z.object({ share: shareLinkSchema, token: z.string() });

/** The link people open for a share token. */
export const shareUrl = (token: string, origin = typeof window === "undefined" ? "" : window.location.origin): string => `${origin}/d/s/${token}`;

export const createdSchema = z.object({ project: projectSchema, file: fileMetaSchema });
export const createdFileSchema = z.object({ file: fileMetaSchema });

/** A node of the project tree: folders first, then files, both by position then name. */
export type TreeNode = { kind: "folder"; folder: DiagramFolder; children: TreeNode[] } | { kind: "file"; file: DiagramFile };

export function buildTree(t: Pick<DiagramTree, "folders" | "files">): TreeNode[] {
  const byName = (a: { name: string; position: number }, b: { name: string; position: number }) => a.position - b.position || a.name.localeCompare(b.name);
  const known = new Set(t.folders.map((f) => f.id));
  const at = (parent: string | null): TreeNode[] => [
    ...t.folders
      .filter((f) => (f.parentId && known.has(f.parentId) ? f.parentId : null) === parent)
      .sort(byName)
      .map((folder): TreeNode => ({ kind: "folder", folder, children: at(folder.id) })),
    ...t.files
      .filter((f) => (f.folderId && known.has(f.folderId) ? f.folderId : null) === parent)
      .sort(byName)
      .map((file): TreeNode => ({ kind: "file", file })),
  ];
  return at(null);
}

/** epoch ms -> ISO, for the shared date helpers */
export const iso = (ms: number): string => new Date(ms).toISOString();

export const canEditProject = (r: DiagramRole): boolean => r === "owner" || r === "editor";

// ---- publishing: the blog page of a file, the public reads and the template gallery ----

export const visibilitySchema = z.enum(["private", "unlisted", "public"]);
export type Visibility = z.infer<typeof visibilitySchema>;
/** what the owner can choose (private = unpublish) */
export type PublishVisibility = Exclude<Visibility, "private">;

/** The owner's view of a file's page (diagram API dialect: bare camelCase, epoch ms). `url` is null while private. */
export const publicationSchema = z.object({
  fileId: z.string(),
  visibility: visibilitySchema.catch("private"),
  slug: z.string().nullish(),
  url: z.string().nullish(),
  title: z.string().default(""),
  description: z.string().default(""),
  tags: z
    .array(z.string())
    .nullish()
    .transform((t) => t ?? []),
  publishedAt: z.number().nullish(),
});
export type Publication = z.infer<typeof publicationSchema>;
export const isPublished = (p: Pick<Publication, "visibility"> | undefined): boolean => p?.visibility === "public" || p?.visibility === "unlisted";
export const PUBLISH_LIMITS = { title: 120, description: 500, tags: 10 } as const;

/** A published diagram on the public side (the blog's dialect: `{data}` envelope, snake_case, RFC 3339). */
export const publicAuthorSchema = z.object({
  id: z.number(),
  username: z.string(),
  display_name: z.string().default(""),
  avatar_url: z.string().default(""),
});
export const publicDiagramSchema = z.object({
  file_id: z.string(),
  slug: z.string(),
  url: z.string().optional(),
  title: z.string(),
  description: z.string().default(""),
  tags: z
    .array(z.string())
    .nullish()
    .transform((t) => t ?? []),
  visibility: visibilitySchema.catch("public"),
  kind: diagramKindSchema.catch("sdd"),
  page_count: z.number().default(1),
  thumbnail_url: z.string().nullish(),
  claps: z.number().default(0),
  views: z.number().default(0),
  published_at: z.string(),
  updated_at: z.string(),
  author: publicAuthorSchema,
});
export type PublicDiagram = z.infer<typeof publicDiagramSchema>;

/** What the signed-in reader did to a published diagram (`GET /api/diagrams/public/{slug}/me`, apart from the cacheable page). */
export const diagramViewerSchema = z.object({ my_claps: z.number().default(0), bookmarked: z.boolean().default(false) });
export type DiagramViewer = z.infer<typeof diagramViewerSchema>;
export const diagramClapsSchema = z.object({ claps: z.number(), my_claps: z.number() });

/** One of my own published files (`GET /api/diagrams/published`): unlisted and public, newest first. */
export const publishedItemSchema = z.object({
  fileId: z.string(),
  slug: z.string(),
  title: z.string().default(""),
  visibility: visibilitySchema.catch("unlisted"),
  thumbnailUrl: z.string().nullish(),
  publishedAt: z.number().nullish(),
});
export type PublishedItem = z.infer<typeof publishedItemSchema>;
export const publishedListSchema = z.object({
  items: z
    .array(publishedItemSchema)
    .nullish()
    .transform((v) => v ?? []),
  total: z.number().default(0),
  page: z.number().default(1),
  pageSize: z.number().default(0),
});
export type PublishedList = z.infer<typeof publishedListSchema>;

/** The gallery's kinds: system design, DB (ER), OOD (UML). */
export const templateKindSchema = z.enum(["system", "db", "ood"]);
export type TemplateKind = z.infer<typeof templateKindSchema>;
export const templateSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: templateKindSchema.catch("system"),
  description: z.string().default(""),
  thumbnail_url: z.string().nullish(),
  page_count: z.number().default(1),
});
export type DiagramTemplate = z.infer<typeof templateSchema>;

/** `::diagram{slug=...}`: the line a story holds to embed a published diagram. */
export const diagramEmbedLine = (slug: string): string => `::diagram{slug=${slug}}`;

/** A slug from what the person pasted: a `/d/v/slug` link (any origin) or the slug itself. */
export function slugFromInput(input: string): string | null {
  const m = /\/d\/v\/([A-Za-z0-9_-]{6,128})(?:[/?#]|$)/.exec(input.trim());
  const slug = m?.[1] ?? (/^[A-Za-z0-9_-]{6,128}$/.test(input.trim()) ? input.trim() : null);
  return slug;
}

/** Tags the way the blog writes them: lower case, no `#`, no spaces, unique, at most 10. */
export function normalizeTags(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const t = part.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-");
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, PUBLISH_LIMITS.tags);
}

/** A saved snapshot of a file. `createdBy` is a user id, `share:<id>` for a share link, or null. */
export const fileVersionSchema = z.object({
  version: z.number(),
  name: z.string().default(""),
  label: z.string().nullish(),
  named: z.boolean().default(false),
  createdBy: z.string().nullish(),
  createdByName: z.string().nullish(),
  createdAt: z.number(),
  data: z.unknown().optional(),
});
export type FileVersion = z.infer<typeof fileVersionSchema>;

export const roleSchema = role;
