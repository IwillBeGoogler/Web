import type { Project } from '../types';

/** viewer < commenter (can comment, cannot edit) < editor < owner */
export type Role = 'viewer' | 'commenter' | 'editor' | 'owner';
export interface ApiUser { id: string; email: string; name: string; isAdmin: boolean }
export interface AuthConfig { authMode: 'session' | 'none'; allowSignup: boolean; /** live co-editing (Yjs) is available */ collab?: boolean; /** audio rooms are available */ rtc?: boolean; /** single sign-on (OpenID Connect) is configured */ oidc?: { label: string; loginUrl: string }; /** single sign-on (SAML 2.0) is configured */ saml?: { label: string; loginUrl: string } }

export type FileKind = 'sdd' | 'erd' | 'uml' | 'board';

/** a project (container of folders and files): `GET /projects`, `GET /projects/:id` */
export interface ServerProjectMeta {
  id: string;
  name: string;
  ownerId?: string;
  role: Role;
  treeRev: number;
  fileCount?: number;
  folderCount?: number;
  thumbnailUrl?: string | null;
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
}
export interface ServerFolder { id: string; projectId: string; parentId: string | null; name: string; position: number; createdAt: number; updatedAt: number }
/** a file without its document (tree listings) */
export interface ServerFileMeta {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  kind: FileKind;
  position: number;
  version: number;
  pageCount: number;
  thumbnailUrl: string | null;
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
  role?: Role;
}
/** `GET /files/:id` etc. (`data` = the frontend file document "Project v2"; the server overwrites id / name / timestamps in it) */
export interface ServerFile extends ServerFileMeta {
  role: Role;
  data: Project;
}
export interface ServerTree {
  project: ServerProjectMeta;
  treeRev: number;
  folders: ServerFolder[];
  files: ServerFileMeta[];
}
export interface ShareLink { id: string; role: 'viewer' | 'commenter' | 'editor'; fileId: string | null; expiresAt: number | null; revokedAt: number | null; createdAt: number; createdBy: string }
export interface Member { userId: string; email: string; name: string; role: Role; isOriginalOwner?: boolean; createdAt?: number }
export interface VersionMeta { version: number; name: string; label: string | null; /** saved by a person with a name ("Save version…"): never pruned */ named?: boolean; createdBy: string; createdAt: number }
export interface VersionFull extends VersionMeta { data: Project }
/** `GET /public/:slug`: a published diagram with its document (the blog's snake_case envelope) */
export interface PublicDiagramDoc {
  file_id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  kind: string;
  author: { id: number; username: string; display_name: string; avatar_url: string };
  data: Project;
}
/** `GET /share/:token`: file links carry the file, project links the tree */
export interface SharedOpen {
  share: { scope: 'file' | 'project'; role: 'viewer' | 'commenter' | 'editor'; fileId: string | null };
  project: ServerProjectMeta;
  file?: ServerFile;
  treeRev?: number;
  folders?: ServerFolder[];
  files?: ServerFileMeta[];
}

// ---- comments, notifications, audio rooms ---------------------------------------------------
export type CommentAnchor = { type: 'point'; x: number; y: number } | { type: 'node'; nodeId: string; dx: number; dy: number };
export interface CommentUser { id: string; name: string }
export interface ApiComment {
  id: string;
  fileId: string;
  parentId: string | null;
  author: CommentUser;
  body: string;
  anchor: CommentAnchor | null;
  resolved: boolean;
  resolvedAt: number | null;
  resolvedBy: CommentUser | null;
  /** ids of the project members mentioned with @[Name](user:id) */
  mentions: string[];
  createdAt: number;
  updatedAt: number;
}
export interface CommentThread { root: ApiComment; replies: ApiComment[] }
export interface CommentList { threads: CommentThread[]; unread: number; readAt: number }
export interface ApiNotification {
  id: string;
  kind: 'mention' | 'reply' | string;
  projectId: string;
  fileId: string;
  commentId: string | null;
  actor: CommentUser | null;
  text: string;
  createdAt: number;
  read: boolean;
}
export interface IceServer { urls: string[]; username?: string; credential?: string }
export interface RtcConfig { enabled: boolean; maxPeers: number; iceServers: IceServer[] }
