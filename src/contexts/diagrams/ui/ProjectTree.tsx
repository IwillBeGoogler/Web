import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  CloudOffIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  FileQuestionIcon,
  FolderIcon,
  FolderInputIcon,
  FolderPlusIcon,
  HistoryIcon,
  PencilIcon,
  SearchIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { useHead } from "@/shared/head";
import { ApiError } from "@/shared/http";
import { useT } from "@/shared/i18n";
import { timeAgo } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { inputBoxCls } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { treeQuery, useFileMutations, useFolderMutations, useProjectMutations } from "../application/hooks";
import { buildTree, canEditProject, type DiagramFile, iso, NEW_DIAGRAMS, type TreeNode } from "../domain/diagram";
import { diagramRepository } from "../infrastructure/diagramRepository";
import { h1, roleKey } from "./Dashboard";
import { kindKey } from "./DiagramCard";
import { saveSdd } from "./download";
import { KindIcon } from "./KindIcon";
import { ConfirmModal, RenameModal } from "./Modals";
import { SharePanel } from "./SharePanel";
import { VersionsDialog } from "./VersionsDialog";

type Row = { file: DiagramFile; depth: number } | { folder: { id: string; name: string }; depth: number };

/** Rows in display order; the children of a collapsed folder are left out. */
const flatten = (nodes: TreeNode[], collapsed: ReadonlySet<string>, depth = 0, out: Row[] = []): Row[] => {
  for (const n of nodes) {
    if (n.kind === "file") out.push({ file: n.file, depth });
    else {
      out.push({ folder: n.folder, depth });
      if (!collapsed.has(n.folder.id)) flatten(n.children, collapsed, depth + 1, out);
    }
  }
  return out;
};

/** Every folder with its depth, for the "Move to…" list (all expanded). */
const folderChoices = (nodes: TreeNode[], depth = 0, out: { id: string; name: string; depth: number }[] = []) => {
  for (const n of nodes)
    if (n.kind === "folder") {
      out.push({ id: n.folder.id, name: n.folder.name, depth });
      folderChoices(n.children, depth + 1, out);
    }
  return out;
};

const menuItem =
  "flex h-9 cursor-pointer items-center gap-3 rounded-[var(--radius-xs)] px-2.5 text-[13px] text-fg outline-none data-[highlighted]:bg-inverse data-[highlighted]:text-on-inverse [&_svg]:size-4 [&_svg]:text-muted data-[highlighted]:[&_svg]:text-on-inverse";

/** A file row's actions on phones, as one "more" key (the WriteMenu's menu style). */
function FileMenu(p: {
  name: string;
  editable: boolean;
  onDownload: () => void;
  onHistory: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost-icon" className="relative z-10 size-8 sm:hidden" aria-label={t("dg.file.actions", { name: p.name })}>
          <EllipsisIcon aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="menu-pop z-50 w-56 overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-card p-1 shadow-[3px_3px_0_0_var(--fg)]"
        >
          <DropdownMenu.Item className={menuItem} onSelect={p.onDownload}>
            <DownloadIcon aria-hidden /> {t("dg.file.downloadShort")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItem} onSelect={p.onHistory}>
            <HistoryIcon aria-hidden /> {t("dg.file.historyShort")}
          </DropdownMenu.Item>
          {p.editable ? (
            <>
              <DropdownMenu.Item className={menuItem} onSelect={p.onDuplicate}>
                <CopyIcon aria-hidden /> {t("dg.file.duplicateShort")}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem} onSelect={p.onMove}>
                <FolderInputIcon aria-hidden /> {t("dg.file.move")}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem} onSelect={p.onRename}>
                <PencilIcon aria-hidden /> {t("dg.rename")}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item className={`${menuItem} text-danger`} onSelect={p.onDelete}>
                <Trash2Icon aria-hidden /> {t("dg.delete")}
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** `/d/p/$projectId`: the folders and files of one project. */
export function ProjectTree({ projectId }: { projectId: string }) {
  const t = useT();
  const nav = useNavigate();
  const q = useQuery(treeQuery(projectId));
  useHead({ title: q.data?.project.name ?? t("dg.tab"), noindex: true });
  const files = useFileMutations(projectId);
  const folders = useFolderMutations(projectId);
  const project = useProjectMutations();
  const [renaming, setRenaming] = useState<DiagramFile | "project" | null>(null);
  const [deleting, setDeleting] = useState<DiagramFile | "project" | null>(null);
  const [newFolder, setNewFolder] = useState<{ parentId: string | null } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; name: string } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<{ id: string; name: string } | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const [moving, setMoving] = useState<DiagramFile | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const download = (key: string, load: () => Promise<Blob>, name: string) => {
    setDownloading(key);
    saveSdd(load, name)
      .catch(toast.error)
      .finally(() => setDownloading(null));
  };

  if (q.isPending)
    return (
      <div className="py-6">
        <Loading>
          <Bone className="h-10 w-1/2" />
          <Bone className="mt-8 h-40 w-full" />
        </Loading>
      </div>
    );
  if (q.isError) {
    const gone = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 403);
    return (
      <EmptyState
        icon={gone ? FileQuestionIcon : CloudOffIcon}
        code={gone ? "404 · not found" : "err · fetch failed"}
        title={gone ? t("dg.project.missing") : t("dg.project.loadError")}
        body={gone ? t("dg.project.missingBody") : t("dg.retryBody")}
        action={
          gone ? (
            <Button variant="outline" asChild>
              <Link to="/d">{t("dg.project.all")}</Link>
            </Button>
          ) : (
            <Button variant="outline" loading={q.isFetching} onClick={() => void q.refetch()}>
              {t("page.tryAgain")}
            </Button>
          )
        }
      />
    );
  }
  const tree = q.data;
  const editable = canEditProject(tree.project.role);
  const nodes = buildTree(tree);
  const needle = search.trim().toLowerCase();
  const rows: Row[] = needle ? tree.files.filter((f) => f.name.toLowerCase().includes(needle)).map((file) => ({ file, depth: 0 })) : flatten(nodes, collapsed);
  const fileCount = tree.files.length;
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const moveTo = (fileId: string, folderId: string | null) => {
    const f = tree.files.find((x) => x.id === fileId);
    if (!f || f.folderId === folderId) return;
    files.move.mutate({ id: fileId, folderId }, { onSuccess: () => toast.ok(t("dg.file.moved")), onError: toast.error });
  };
  const dropOn = (folderId: string | null) => (e: React.DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    moveTo(dragId, folderId);
    setDragId(null);
    setOverId(null);
  };
  const dragOver = (key: string) => (e: React.DragEvent) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    if (overId !== key) setOverId(key);
  };
  const creating = files.create.isPending ? (files.create.variables?.kind ?? null) : null;
  const newFile = (kind: (typeof NEW_DIAGRAMS)[number]["kind"], name: string) =>
    files.create.mutate({ name, kind }, { onSuccess: (f) => void nav({ to: "/d/f/$fileId", params: { fileId: f.id } }), onError: toast.error });
  return (
    <div className="py-6">
      <nav aria-label="Breadcrumb" className="mb-3 font-mono text-[12px] text-muted">
        <Link to="/d" className="hover:text-fg hover:underline">
          {t("dg.tab")}
        </Link>
        <span aria-hidden> / </span>
        <span className="text-fg" aria-current="page">
          {tree.project.name}
        </span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={h1}>{tree.project.name}</h1>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            {NEW_DIAGRAMS.map((d, i) => (
              <Button
                key={d.kind}
                variant={i === 0 ? "accent" : "outline"}
                size="sm"
                loading={creating === d.kind}
                disabled={creating !== null}
                onClick={() => newFile(d.kind, d.name)}
              >
                <KindIcon kind={d.kind} className="size-4" /> {t(kindKey[d.kind])}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {editable ? (
          <Button variant="ghost" size="sm" onClick={() => setRenaming("project")}>
            <PencilIcon className="size-3.5" aria-hidden /> {t("dg.project.rename")}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          loading={downloading === "project"}
          onClick={() => download("project", () => diagramRepository.exportProject(projectId), tree.project.name)}
        >
          <DownloadIcon className="size-3.5" aria-hidden /> {t("dg.project.download")}
        </Button>
        {editable ? (
          <Button variant="ghost" size="sm" onClick={() => setNewFolder({ parentId: null })}>
            <FolderPlusIcon className="size-3.5" aria-hidden /> {t("dg.folder.new")}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => setSharing(true)}>
          <Share2Icon className="size-3.5" aria-hidden /> {t("dg.share.open")}
        </Button>
        {tree.project.role === "owner" ? (
          <Button variant="ghost" size="sm" className="hover:text-danger" onClick={() => setDeleting("project")}>
            <Trash2Icon className="size-3.5" aria-hidden /> {t("dg.project.delete")}
          </Button>
        ) : null}
      </div>

      <div className="relative mt-6">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          className={`${inputBoxCls} h-10 pl-9 text-[14px]`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("dg.project.search")}
          aria-label={t("dg.project.search")}
        />
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: HTML5 drop zone; the per-file "Move to…" dialog is the keyboard path */}
      <div
        className={`tile mt-4 overflow-hidden ${dragId && overId === "root" ? "outline-2 outline-accent" : ""}`}
        onDragOver={dragOver("root")}
        onDragLeave={() => setOverId(null)}
        onDrop={dropOn(null)}
      >
        <div className="tile-head">
          <span aria-hidden className="size-1.5 bg-fg" />
          <span>{fileCount === 1 ? t("dg.files.one") : t("dg.files.many", { n: fileCount })}</span>
          <span className="ml-auto">{t(roleKey[tree.project.role])}</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-center font-mono text-[12px] text-muted">{needle ? t("dg.project.noMatch") : t("dg.project.noFiles")}</p>
        ) : (
          <ul>
            {rows.map((r) =>
              "folder" in r ? (
                <li
                  key={`d:${r.folder.id}`}
                  className={`flex h-10 items-center gap-1 border-b border-line pr-2 font-mono text-[12px] text-muted last:border-b-0 ${dragId && overId === r.folder.id ? "bg-surface-2 outline-2 -outline-offset-2 outline-accent" : ""}`}
                  style={{ paddingLeft: `${0.25 + r.depth * 1.25}rem` }}
                  onDragOver={dragOver(r.folder.id)}
                  onDrop={dropOn(r.folder.id)}
                >
                  <button
                    type="button"
                    className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left outline-none hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    aria-expanded={!collapsed.has(r.folder.id)}
                    aria-label={t("dg.folder.toggle", { name: r.folder.name })}
                    onClick={() => toggle(r.folder.id)}
                  >
                    <ChevronRightIcon className={`size-3.5 shrink-0 transition-transform ${collapsed.has(r.folder.id) ? "" : "rotate-90"}`} aria-hidden />
                    <FolderIcon className="size-4 shrink-0" aria-hidden strokeWidth={1.5} />
                    <span className="truncate">{r.folder.name}</span>
                  </button>
                  {editable ? (
                    <span className="flex shrink-0">
                      <Button
                        variant="ghost-icon"
                        className="size-8"
                        aria-label={t("dg.folder.newIn", { name: r.folder.name })}
                        onClick={() => setNewFolder({ parentId: r.folder.id })}
                      >
                        <FolderPlusIcon aria-hidden />
                      </Button>
                      <Button
                        variant="ghost-icon"
                        className="size-8"
                        aria-label={t("dg.folder.renameNamed", { name: r.folder.name })}
                        onClick={() => setRenamingFolder(r.folder)}
                      >
                        <PencilIcon aria-hidden />
                      </Button>
                      <Button
                        variant="ghost-icon"
                        className="size-8 hover:text-danger"
                        aria-label={t("dg.folder.deleteNamed", { name: r.folder.name })}
                        onClick={() => setDeletingFolder(r.folder)}
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    </span>
                  ) : null}
                </li>
              ) : (
                <li
                  key={`f:${r.file.id}`}
                  className={`group relative flex h-12 items-center gap-3 border-b border-line px-3 last:border-b-0 hover:bg-surface-2 ${dragId === r.file.id ? "opacity-50" : ""}`}
                  style={{ paddingLeft: `${0.75 + r.depth * 1.25}rem` }}
                  draggable={editable}
                  onDragStart={(e) => {
                    setDragId(r.file.id);
                    e.dataTransfer.setData("text/plain", r.file.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                >
                  <KindIcon kind={r.file.kind} className="size-4 shrink-0 text-muted" />
                  <Link
                    to="/d/f/$fileId"
                    params={{ fileId: r.file.id }}
                    className="min-w-0 flex-1 truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-accent"
                  >
                    {r.file.name}
                  </Link>
                  <span className="hidden font-mono text-[12px] text-muted sm:inline">{t(kindKey[r.file.kind])}</span>
                  <span className="hidden w-24 text-right font-mono text-[12px] text-muted md:inline">{timeAgo(iso(r.file.updatedAt))}</span>
                  <FileMenu
                    name={r.file.name}
                    editable={editable}
                    onDownload={() => {
                      const f = r.file;
                      download(f.id, () => diagramRepository.exportFile(f.id), f.name);
                    }}
                    onHistory={() => setHistory(r.file.id)}
                    onDuplicate={() => files.duplicate.mutate(r.file.id, { onError: toast.error })}
                    onMove={() => setMoving(r.file)}
                    onRename={() => setRenaming(r.file)}
                    onDelete={() => setDeleting(r.file)}
                  />
                  {/* phones get the menu above: six icons would squeeze the file name to a few letters */}
                  <span className="relative z-10 hidden shrink-0 sm:flex">
                    <Button
                      variant="ghost-icon"
                      className="size-8"
                      aria-label={t("dg.file.download", { name: r.file.name })}
                      loading={downloading === r.file.id}
                      onClick={() => {
                        const f = r.file;
                        download(f.id, () => diagramRepository.exportFile(f.id), f.name);
                      }}
                    >
                      <DownloadIcon aria-hidden />
                    </Button>
                    <Button
                      variant="ghost-icon"
                      className="size-8"
                      aria-label={t("dg.file.history", { name: r.file.name })}
                      onClick={() => setHistory(r.file.id)}
                    >
                      <HistoryIcon aria-hidden />
                    </Button>
                    {editable ? (
                      <>
                        <Button
                          variant="ghost-icon"
                          className="size-8"
                          aria-label={t("dg.file.duplicate", { name: r.file.name })}
                          disabled={files.duplicate.isPending}
                          onClick={() => {
                            files.duplicate.mutate(r.file.id, { onError: toast.error });
                          }}
                        >
                          <CopyIcon aria-hidden />
                        </Button>
                        <Button
                          variant="ghost-icon"
                          className="size-8"
                          aria-label={t("dg.file.moveNamed", { name: r.file.name })}
                          onClick={() => setMoving(r.file)}
                        >
                          <FolderInputIcon aria-hidden />
                        </Button>
                        <Button
                          variant="ghost-icon"
                          className="size-8"
                          aria-label={t("dg.renameNamed", { name: r.file.name })}
                          onClick={() => setRenaming(r.file)}
                        >
                          <PencilIcon aria-hidden />
                        </Button>
                        <Button
                          variant="ghost-icon"
                          className="size-8 hover:text-danger"
                          aria-label={t("dg.deleteNamed", { name: r.file.name })}
                          onClick={() => setDeleting(r.file)}
                        >
                          <Trash2Icon aria-hidden />
                        </Button>
                      </>
                    ) : null}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <RenameModal
        open={!!renaming}
        title={renaming === "project" ? t("dg.project.rename") : t("dg.file.rename")}
        initial={renaming === "project" ? tree.project.name : (renaming?.name ?? "")}
        pending={files.rename.isPending || project.rename.isPending}
        onClose={() => setRenaming(null)}
        onSubmit={(name) => {
          const done = { onSuccess: () => setRenaming(null), onError: toast.error };
          if (renaming === "project") project.rename.mutate({ id: projectId, name }, done);
          else if (renaming) files.rename.mutate({ id: renaming.id, name }, done);
        }}
      />
      <RenameModal
        open={!!newFolder}
        title={t("dg.folder.new")}
        initial=""
        pending={folders.create.isPending}
        onClose={() => setNewFolder(null)}
        onSubmit={(name) =>
          folders.create.mutate({ name, parentId: newFolder?.parentId ?? null }, { onSuccess: () => setNewFolder(null), onError: toast.error })
        }
      />
      <RenameModal
        open={!!renamingFolder}
        title={t("dg.folder.rename")}
        initial={renamingFolder?.name ?? ""}
        pending={folders.rename.isPending}
        onClose={() => setRenamingFolder(null)}
        onSubmit={(name) =>
          renamingFolder && folders.rename.mutate({ id: renamingFolder.id, name }, { onSuccess: () => setRenamingFolder(null), onError: toast.error })
        }
      />
      <ConfirmModal
        open={!!deletingFolder}
        title={t("dg.folder.delete")}
        body={t("dg.folder.deleteBody", { name: deletingFolder?.name ?? "" })}
        confirm={t("dg.delete")}
        pending={folders.remove.isPending}
        onClose={() => setDeletingFolder(null)}
        onConfirm={() => deletingFolder && folders.remove.mutate(deletingFolder.id, { onSuccess: () => setDeletingFolder(null), onError: toast.error })}
      />
      <Modal open={!!moving} onOpenChange={(o) => !o && setMoving(null)} title={t("dg.file.moveNamed", { name: moving?.name ?? "" })}>
        <ul className="border border-line">
          {[{ id: null as string | null, name: t("dg.file.moveRoot"), depth: 0 }, ...folderChoices(nodes)].map((c) => (
            <li key={c.id ?? "root"} className="border-b border-line last:border-b-0">
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm outline-none hover:bg-surface-2 focus-visible:bg-surface-2 disabled:opacity-50"
                style={{ paddingLeft: `${0.75 + c.depth * 1.25}rem` }}
                disabled={moving?.folderId === c.id}
                onClick={() => {
                  if (moving) moveTo(moving.id, c.id);
                  setMoving(null);
                }}
              >
                <FolderIcon className="size-4 shrink-0 text-muted" aria-hidden strokeWidth={1.5} /> <span className="truncate">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      {history ? <VersionsDialog fileId={history} open onOpenChange={(o) => !o && setHistory(null)} /> : null}
      <SharePanel
        projectId={projectId}
        projectName={tree.project.name}
        role={tree.project.role}
        open={sharing}
        onOpenChange={setSharing}
        onLeft={() => void nav({ to: "/d" })}
      />
      <ConfirmModal
        open={!!deleting}
        title={deleting === "project" ? t("dg.project.delete") : t("dg.file.delete")}
        body={
          deleting === "project"
            ? t("dg.project.deleteBody", { name: tree.project.name })
            : t("dg.file.deleteBody", { name: typeof deleting === "object" && deleting ? deleting.name : "" })
        }
        confirm={t("dg.delete")}
        pending={files.remove.isPending || project.remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting === "project") project.remove.mutate(projectId, { onSuccess: () => void nav({ to: "/d" }), onError: toast.error });
          else if (deleting) files.remove.mutate(deleting.id, { onSuccess: () => setDeleting(null), onError: toast.error });
        }}
      />
    </div>
  );
}
