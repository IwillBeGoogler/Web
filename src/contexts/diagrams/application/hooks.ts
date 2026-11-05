import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { addClaps } from "@/contexts/engagement/domain/engagement";
import { nextPageRequest, type Page, type PageRequest } from "@/shared/http";
import {
  type DiagramKind,
  type DiagramViewer,
  NEW_DIAGRAMS,
  type NewDiagramKind,
  type PublicDiagram,
  type PublishedList,
  type PublishVisibility,
  type ShareRole,
} from "../domain/diagram";
import { diagramRepository, versionsRepository } from "../infrastructure/diagramRepository";

export const projectsQuery = (q: { q?: string; sort?: "updated" | "name" } = {}) =>
  queryOptions({ queryKey: ["diagrams", "projects", q.q ?? "", q.sort ?? "updated"], queryFn: ({ signal }) => diagramRepository.projects(q, signal) });
export const treeQuery = (projectId: string) =>
  queryOptions({ queryKey: ["diagrams", "tree", projectId], queryFn: ({ signal }) => diagramRepository.tree(projectId, signal) });

/**
 * What a new file starts with: a DB diagram one table, an OOD diagram one class (the editor's own template pipelines, loaded
 * on demand: a small chunk, not the editor). A system design starts empty. Failing to build one never blocks creating the file.
 */
async function starterDocument(kind: NewDiagramKind, name: string): Promise<unknown> {
  if (kind === "sdd") return undefined;
  try {
    const { starterProject } = await import("@diagram-starter");
    return starterProject(kind, name) ?? undefined;
  } catch {
    return undefined;
  }
}

const defaultName = (kind: NewDiagramKind) => NEW_DIAGRAMS.find((d) => d.kind === kind)?.name ?? "Diagram";

/**
 * Creates a project with its first file and returns the ids to open. The kind (DB / OOD) is set on the file after the
 * project exists: it is a hint for the explorer icon, so a failure there must not lose the new diagram.
 */
export function useCreateDiagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { kind: NewDiagramKind; name?: string }) => {
      const name = v.name?.trim() || defaultName(v.kind);
      const { project, file } = await diagramRepository.createProject(name, name, await starterDocument(v.kind, name));
      if (v.kind !== file.kind) await diagramRepository.setKind(file.id, v.kind as DiagramKind).catch(() => undefined);
      return { projectId: project.id, fileId: file.id };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["diagrams"] }),
  });
}

/** Imports a .sdd as a new project; returns the route to open (`/d/f/{id}` for a file or text, `/d/p/{id}` for a project) and the warnings. */
export function useImportSdd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const r = await diagramRepository.importSdd(file);
      const to =
        r.kind === "project" || !r.file
          ? ({ to: "/d/p/$projectId", params: { projectId: r.project.id } } as const)
          : ({ to: "/d/f/$fileId", params: { fileId: r.file.id } } as const);
      return { ...to, warnings: r.warnings };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["diagrams", "projects"] }),
  });
}

export function useProjectMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["diagrams"] });
  return {
    rename: useMutation({ mutationFn: (v: { id: string; name: string }) => diagramRepository.renameProject(v.id, v.name), onSuccess: refresh }),
    remove: useMutation({ mutationFn: diagramRepository.deleteProject, onSuccess: refresh }),
  };
}

export function useFileMutations(projectId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["diagrams"] });
  return {
    create: useMutation({
      mutationFn: (v: { name: string; kind?: DiagramKind; folderId?: string | null }) => diagramRepository.createFile(projectId, v),
      onSuccess: refresh,
    }),
    rename: useMutation({ mutationFn: (v: { id: string; name: string }) => diagramRepository.renameFile(v.id, v.name), onSuccess: refresh }),
    remove: useMutation({ mutationFn: diagramRepository.deleteFile, onSuccess: refresh }),
    move: useMutation({ mutationFn: (v: { id: string; folderId: string | null }) => diagramRepository.moveFile(v.id, v.folderId), onSuccess: refresh }),
    duplicate: useMutation({ mutationFn: diagramRepository.duplicateFile, onSuccess: refresh }),
  };
}

export function useFolderMutations(projectId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["diagrams"] });
  return {
    create: useMutation({
      mutationFn: (v: { name: string; parentId?: string | null }) => diagramRepository.createFolder(projectId, v.name, v.parentId ?? null),
      onSuccess: refresh,
    }),
    rename: useMutation({ mutationFn: (v: { id: string; name: string }) => diagramRepository.renameFolder(v.id, v.name), onSuccess: refresh }),
    remove: useMutation({ mutationFn: diagramRepository.deleteFolder, onSuccess: refresh }),
  };
}

// ---- sharing ----

export const membersQuery = (projectId: string) =>
  queryOptions({ queryKey: ["diagrams", "members", projectId], queryFn: ({ signal }) => diagramRepository.members(projectId, signal) });
export const sharesQuery = (projectId: string) =>
  queryOptions({ queryKey: ["diagrams", "shares", projectId], queryFn: ({ signal }) => diagramRepository.shares(projectId, signal) });

export function useSharing(projectId: string) {
  const qc = useQueryClient();
  const members = () => qc.invalidateQueries({ queryKey: ["diagrams", "members", projectId] });
  const shares = () => qc.invalidateQueries({ queryKey: ["diagrams", "shares", projectId] });
  return {
    invite: useMutation({ mutationFn: (v: { login: string; role: ShareRole }) => diagramRepository.addMember(projectId, v.login, v.role), onSuccess: members }),
    setRole: useMutation({
      mutationFn: (v: { userId: string; role: ShareRole }) => diagramRepository.setMemberRole(projectId, v.userId, v.role),
      onSuccess: members,
    }),
    removeMember: useMutation({ mutationFn: (userId: string) => diagramRepository.removeMember(projectId, userId), onSuccess: members }),
    createShare: useMutation({
      mutationFn: (v: { role: ShareRole; expiresInSeconds?: number }) => diagramRepository.createShare(projectId, v),
      onSuccess: shares,
    }),
    revokeShare: useMutation({ mutationFn: (id: string) => diagramRepository.revokeShare(projectId, id), onSuccess: shares }),
    /** Leaving drops my access: every cached project list/tree is stale. */
    leave: useMutation({
      mutationFn: (myId: string) => diagramRepository.removeMember(projectId, myId),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["diagrams"] }),
    }),
  };
}

// ---- publishing, public pages, templates ----

export const publicationQuery = (fileId: string) =>
  queryOptions({ queryKey: ["diagrams", "publication", fileId], queryFn: ({ signal }) => diagramRepository.publication(fileId, signal) });

export function usePublishing(fileId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["diagrams", "publication", fileId] });
    void qc.invalidateQueries({ queryKey: ["diagrams", "public"] });
    void qc.invalidateQueries({ queryKey: ["diagrams", "published"] });
  };
  return {
    publish: useMutation({
      mutationFn: (v: { visibility: PublishVisibility; title: string; description: string; tags: string[] }) => diagramRepository.publish(fileId, v),
      onSuccess: (p) => {
        qc.setQueryData(["diagrams", "publication", fileId], p);
        refresh();
      },
    }),
    unpublish: useMutation({ mutationFn: () => diagramRepository.unpublish(fileId), onSuccess: refresh }),
  };
}

const LIMIT = 12;
const pagedPublic = (queryKey: readonly unknown[], fetch: (r: PageRequest, s: AbortSignal) => Promise<Page<PublicDiagram>>) =>
  infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam, signal }) => fetch(pageParam, signal),
    initialPageParam: { limit: LIMIT } as PageRequest,
    getNextPageParam: (l: Page<PublicDiagram>) => nextPageRequest(l.meta, LIMIT),
  });

export const publicDiagramQuery = (slug: string) =>
  queryOptions({ queryKey: ["diagrams", "public", "one", slug], queryFn: ({ signal }) => diagramRepository.publicDiagram(slug, signal) });
export const publicDiagramsQuery = (q: { q?: string; tag?: string } = {}) =>
  pagedPublic(["diagrams", "public", "list", q.q ?? "", q.tag ?? ""], (r, s) => diagramRepository.publicDiagrams(q, r, s));
export const userDiagramsQuery = (username: string) =>
  pagedPublic(["diagrams", "public", "user", username], (r, s) => diagramRepository.userDiagrams(username, r, s));
/** Diagrams I saved, newest saved first (the Saved page's Diagrams tab). */
export const bookmarkedDiagramsQuery = () => pagedPublic(["diagrams", "bookmarks"], (r, s) => diagramRepository.bookmarkedDiagrams(r, s));

const viewerKey = (slug: string) => ["diagrams", "viewer", slug] as const;
const viewerZero: DiagramViewer = { my_claps: 0, bookmarked: false };
/** What I did to one published diagram; off (zeros) for an anonymous reader. */
export const diagramViewerQuery = (slug: string, enabled: boolean) =>
  queryOptions({ queryKey: viewerKey(slug), queryFn: ({ signal }) => diagramRepository.diagramViewer(slug, signal), enabled });

/** Clapping a diagram as for a story: the count rises at once, taps within 600ms go out as one POST (max 50 per reader). */
export function useDiagramClap(d: Pick<PublicDiagram, "slug" | "claps">, mine: number) {
  const qc = useQueryClient();
  const pending = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setClaps = (claps: number, myClaps: number) => {
    qc.setQueryData<PublicDiagram>(["diagrams", "public", "one", d.slug], (p) => (p ? { ...p, claps } : p));
    qc.setQueryData<DiagramViewer>(viewerKey(d.slug), (v) => ({ ...(v ?? viewerZero), my_claps: myClaps }));
  };
  const send = useMutation({
    mutationFn: (n: number) => diagramRepository.clapDiagram(d.slug, n),
    onSuccess: (r) => setClaps(r.claps, r.my_claps),
  });
  return () => {
    const r = addClaps({ claps: d.claps, myClaps: mine }, 1);
    if (!r.added) return false;
    pending.current += 1;
    setClaps(r.claps, r.myClaps);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const n = pending.current;
      pending.current = 0;
      send.mutate(n);
    }, 600);
    return true;
  };
}

export function useDiagramBookmark(slug: string) {
  const qc = useQueryClient();
  const set = (on: boolean) => qc.setQueryData<DiagramViewer>(viewerKey(slug), (v) => ({ ...(v ?? viewerZero), bookmarked: on }));
  return useMutation({
    mutationFn: (on: boolean) => diagramRepository.bookmarkDiagram(slug, on),
    onMutate: set,
    onError: (_e, on) => set(!on),
    onSettled: () => qc.invalidateQueries({ queryKey: ["diagrams", "bookmarks"] }),
  });
}

/** My own unlisted and public diagrams, newest first (the story editor's picker). */
export const publishedQuery = () =>
  infiniteQueryOptions({
    queryKey: ["diagrams", "published"],
    queryFn: ({ pageParam, signal }) => diagramRepository.published(pageParam, LIMIT, signal),
    initialPageParam: 1,
    getNextPageParam: (l: PublishedList) => (l.page * (l.pageSize || LIMIT) < l.total ? l.page + 1 : undefined),
  });
export const templatesQuery = () =>
  queryOptions({ queryKey: ["diagrams", "templates"], queryFn: ({ signal }) => diagramRepository.templates(signal), staleTime: 60_000 });

/** Copies a template into a new project of mine; resolves to the file to open. */
export function useForkTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { project, file } = await diagramRepository.forkTemplate(id);
      return { projectId: project.id, fileId: file.id };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["diagrams", "projects"] }),
  });
}

export const fileVersionsQuery = (fileId: string) =>
  queryOptions({ queryKey: ["diagrams", "versions", fileId], queryFn: ({ signal }) => versionsRepository.list(fileId, signal) });
export const fileRoleQuery = (fileId: string) =>
  queryOptions({ queryKey: ["diagrams", "file-role", fileId], queryFn: ({ signal }) => versionsRepository.role(fileId, signal), staleTime: 60_000 });

/** Save-as-named and restore for a file's versions; both refresh the list. */
export function useVersionMutations(fileId: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["diagrams", "versions", fileId] });
  return {
    saveNamed: useMutation({ mutationFn: (name: string) => versionsRepository.saveNamed(fileId, name), onSuccess: refresh }),
    restore: useMutation({
      mutationFn: (version: number) => versionsRepository.restore(fileId, version),
      onSuccess: () => {
        refresh();
        void qc.invalidateQueries({ queryKey: ["diagrams", "tree"] });
      },
    }),
  };
}
