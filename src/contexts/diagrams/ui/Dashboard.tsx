import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CloudOffIcon, DownloadIcon, LayoutTemplateIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { type MessageKey, useT } from "@/shared/i18n";
import { timeAgo } from "@/shared/lib/format";
import { useDebounced } from "@/shared/lib/useDebounced";
import { Stagger, StaggerItem } from "@/shared/motion";
import { Button } from "@/shared/ui/button";
import { Lens } from "@/shared/ui/modal";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { projectsQuery, useImportSdd, useProjectMutations } from "../application/hooks";
import { canEditProject, type DiagramProject, type DiagramRole, iso, NEW_DIAGRAMS } from "../domain/diagram";
import { diagramRepository, SddInvalidError } from "../infrastructure/diagramRepository";
import { kindKey } from "./DiagramCard";
import { saveSdd } from "./download";
import { KindIcon } from "./KindIcon";
import { ConfirmModal, RenameModal } from "./Modals";
import { useStartDiagram } from "./WriteMenu";

export const h1 = "font-display text-[32px] leading-tight font-bold tracking-tight md:text-[42px]";

export const roleKey: Record<DiagramRole, MessageKey> = {
  owner: "dg.role.owner",
  editor: "dg.role.editor",
  commenter: "dg.role.commenter",
  viewer: "dg.role.viewer",
};

function ProjectTile({ p, onRename, onDelete }: { p: DiagramProject; onRename: () => void; onDelete: () => void }) {
  const t = useT();
  const [saving, setSaving] = useState(false);
  const editable = canEditProject(p.role);
  return (
    <StaggerItem as="li" className="min-w-0">
      <div className="tile tile-hover relative flex h-full flex-col overflow-hidden">
        <div className="tile-head">
          <span aria-hidden className="size-1.5 bg-fg" />
          <span>{p.fileCount === 1 ? t("dg.files.one") : t("dg.files.many", { n: p.fileCount })}</span>
          <span className="ml-auto">{t(roleKey[p.role])}</span>
        </div>
        <Link
          to="/d/p/$projectId"
          params={{ projectId: p.id }}
          className="flex-1 p-4 outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:outline-accent"
        >
          <h2 className="line-clamp-2 font-display text-xl font-bold tracking-[-0.02em]">{p.name}</h2>
          <p className="mt-2 font-mono text-[12px] text-muted">{t("dg.updated", { when: timeAgo(iso(p.updatedAt)) })}</p>
        </Link>
        <div className="relative z-10 flex flex-wrap gap-1 border-t border-line p-1.5">
          {editable ? (
            <Button variant="ghost" size="sm" onClick={onRename} aria-label={t("dg.renameNamed", { name: p.name })}>
              <PencilIcon className="size-3.5" aria-hidden /> {t("dg.rename")}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            loading={saving}
            onClick={() => {
              setSaving(true);
              saveSdd(() => diagramRepository.exportProject(p.id), p.name)
                .catch(toast.error)
                .finally(() => setSaving(false));
            }}
            aria-label={t("dg.downloadNamed", { name: p.name })}
          >
            <DownloadIcon className="size-3.5" aria-hidden /> .sdd
          </Button>
          {editable && p.role === "owner" ? (
            <Button variant="ghost" size="sm" className="ml-auto hover:text-danger" onClick={onDelete} aria-label={t("dg.deleteNamed", { name: p.name })}>
              <Trash2Icon className="size-3.5" aria-hidden /> {t("dg.delete")}
            </Button>
          ) : null}
        </div>
      </div>
    </StaggerItem>
  );
}

export function NewDiagramButtons({ templates = false }: { templates?: boolean }) {
  const { start, pending } = useStartDiagram();
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {NEW_DIAGRAMS.map((d, i) => (
        <Button
          key={d.kind}
          variant={i === 0 ? "accent" : "outline"}
          size="sm"
          loading={pending === d.kind}
          disabled={pending !== null}
          onClick={() => start(d.kind)}
        >
          <KindIcon kind={d.kind} className="size-4" /> {t(kindKey[d.kind])}
        </Button>
      ))}
      {templates ? (
        <Button variant="outline" size="sm" asChild>
          <Link to="/templates">
            <LayoutTemplateIcon className="size-4" aria-hidden /> {t("nav.templates")}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

const SDD_ACCEPT = ".sdd,.sddproj,.sddt,application/vnd.sdd+zip,text/vnd.sdd";

/** Uploads a .sdd and opens what it made. */
function ImportButton() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const imp = useImportSdd();
  const pick = (file: File | undefined) => {
    if (!file) return;
    imp.mutate(file, {
      onSuccess: ({ warnings, ...to }) => {
        if (warnings.length) toast.ok(`${t("dg.import.warnings")}: ${warnings.join("; ")}`);
        void navigate(to);
      },
      onError: (e) => toast.error(e instanceof SddInvalidError ? `${t("dg.import.invalid")}: ${e.message}` : e),
    });
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept={SDD_ACCEPT}
        data-testid="import-sdd-input"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" loading={imp.isPending} onClick={() => input.current?.click()}>
        <UploadIcon className="size-4" aria-hidden /> {t("dg.import")}
      </Button>
    </>
  );
}

/** `/d`: my diagram projects. */
export function Dashboard() {
  const t = useT();
  const [sort, setSort] = useState<"updated" | "name">("updated");
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const projects = useQuery(projectsQuery({ ...(q ? { q } : {}), sort }));
  const m = useProjectMutations();
  const [renaming, setRenaming] = useState<DiagramProject | null>(null);
  const [deleting, setDeleting] = useState<DiagramProject | null>(null);
  const items = projects.data?.items ?? [];
  return (
    <div className="py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={h1}>{t("dg.tab")}</h1>
        <div className="flex flex-wrap gap-2">
          <NewDiagramButtons templates />
          <ImportButton />
        </div>
      </div>
      <div className="mt-8 mb-6 flex flex-wrap items-center gap-3">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-2.5 font-mono text-[12px] text-muted focus-within:border-fg focus-within:bg-card focus-within:shadow-[2px_2px_0_0_var(--fg)] sm:max-w-xs">
          <SearchIcon className="size-4 shrink-0" aria-hidden />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full min-w-0 bg-transparent text-fg outline-none placeholder:text-muted"
            placeholder={t("dg.dash.search")}
            aria-label={t("dg.dash.search")}
          />
        </label>
        <Lens
          label={t("dg.dash.sort")}
          value={sort}
          onChange={setSort}
          items={[
            ["updated", t("dg.dash.recent")],
            ["name", t("dg.dash.byName")],
          ]}
        />
      </div>
      {projects.isPending ? (
        <Loading>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <li key={i} className="tile space-y-3 p-4">
                <Bone className="h-5 w-2/3" />
                <Bone className="h-3.5 w-1/3" />
              </li>
            ))}
          </ul>
        </Loading>
      ) : projects.isError ? (
        <EmptyState
          icon={CloudOffIcon}
          code="err · fetch failed"
          title={t("dg.dash.loadError")}
          body={t("dg.retryBody")}
          action={
            <Button variant="outline" loading={projects.isFetching} onClick={() => void projects.refetch()}>
              {t("page.tryAgain")}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={q ? SearchIcon : PlusIcon}
          code={q ? "0 · no match" : "0 · no diagrams"}
          title={q ? t("dg.dash.noMatch") : t("dg.dash.empty")}
          body={q ? t("dg.dash.noMatchBody") : t("dg.dash.emptyBody")}
          action={q ? undefined : <NewDiagramButtons />}
        />
      ) : (
        <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <ProjectTile key={p.id} p={p} onRename={() => setRenaming(p)} onDelete={() => setDeleting(p)} />
          ))}
        </Stagger>
      )}
      <RenameModal
        open={!!renaming}
        title={t("dg.project.rename")}
        initial={renaming?.name ?? ""}
        pending={m.rename.isPending}
        onClose={() => setRenaming(null)}
        onSubmit={(name) => renaming && m.rename.mutate({ id: renaming.id, name }, { onSuccess: () => setRenaming(null), onError: toast.error })}
      />
      <ConfirmModal
        open={!!deleting}
        title={t("dg.project.delete")}
        body={t("dg.project.deleteBody", { name: deleting?.name ?? "" })}
        confirm={t("dg.delete")}
        pending={m.remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && m.remove.mutate(deleting.id, { onSuccess: () => setDeleting(null), onError: toast.error })}
      />
    </div>
  );
}
