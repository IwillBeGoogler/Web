import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "@/shared/i18n";
import { timeAgo } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { inputBoxCls, inputCls } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";
import { Bone, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { fileRoleQuery, fileVersionsQuery, useVersionMutations } from "../application/hooks";
import { canEditProject, type FileVersion, iso } from "../domain/diagram";
import { type DiffGroup, diffDocuments } from "../domain/versionDiff";
import { versionsRepository } from "../infrastructure/diagramRepository";
import { ConfirmModal } from "./Modals";

type Msg = ReturnType<typeof useT>;

function DiffList({ title, g, t }: { title: string; g: DiffGroup; t: Msg }) {
  const rows = [
    ["added", "+", g.added],
    ["removed", "−", g.removed],
    ["changed", "~", g.changed],
  ] as const;
  if (rows.every(([, , l]) => l.length === 0)) return null;
  return (
    <section>
      <h4 className="font-mono text-[11px] tracking-wide text-muted uppercase">{title}</h4>
      <ul className="mt-1 space-y-0.5 text-sm">
        {rows.flatMap(([kind, sign, list]) =>
          list.map((it) => (
            <li key={`${kind}${it.id}`} className="flex gap-2">
              <span aria-hidden className={kind === "added" ? "text-success" : kind === "removed" ? "text-danger" : "text-muted"}>
                {sign}
              </span>
              <span className="sr-only">{t(`dg.ver.${kind}`)}:</span>
              <span className="min-w-0 break-words">{it.label}</span>
            </li>
          )),
        )}
      </ul>
    </section>
  );
}

function Compare({ fileId, a, b, t }: { fileId: string; a: number; b: number; t: Msg }) {
  const q = useQuery({
    queryKey: ["diagrams", "versions-diff", fileId, a, b],
    queryFn: async ({ signal }) => {
      const [x, y] = await Promise.all([versionsRepository.get(fileId, a, signal), versionsRepository.get(fileId, b, signal)]);
      return diffDocuments(x.data, y.data);
    },
  });
  return (
    <div className="mt-4 border-t border-line pt-4" aria-live="polite">
      <h3 className="font-display text-base font-bold">{t("dg.ver.comparing", { a, b })}</h3>
      {q.isPending ? (
        <Loading>
          <Bone className="mt-3 h-4 w-2/3" />
        </Loading>
      ) : q.isError ? (
        <p className="mt-2 text-sm text-danger">{t("dg.ver.diffError")}</p>
      ) : q.data.empty ? (
        <p className="mt-2 text-sm text-muted">{t("dg.ver.diffNone")}</p>
      ) : (
        <div className="mt-2 space-y-3">
          <DiffList title={t("dg.ver.nodes")} g={q.data.nodes} t={t} />
          <DiffList title={t("dg.ver.edges")} g={q.data.edges} t={t} />
        </div>
      )}
    </div>
  );
}

const author = (v: FileVersion, t: Msg) => (v.createdBy?.startsWith("share:") ? t("dg.ver.share") : v.createdByName || t("dg.ver.unknown"));

/** A file's version history: save a named version, restore one, or compare two. */
export function VersionsDialog({ fileId, open, onOpenChange }: { fileId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const versions = useQuery({ ...fileVersionsQuery(fileId), enabled: open });
  const role = useQuery({ ...fileRoleQuery(fileId), enabled: open });
  const m = useVersionMutations(fileId);
  const editable = role.data ? canEditProject(role.data) : false;
  const [name, setName] = useState("");
  const [naming, setNaming] = useState(false);
  const [restoring, setRestoring] = useState<FileVersion | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const items = versions.data ?? [];
  const toggle = (v: number) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v].slice(-2)));
  const [a, b] = picked.length === 2 ? [...picked].sort((x, y) => x - y) : [];

  const save = () => {
    const n = name.trim();
    if (!n) return;
    m.saveNamed.mutate(n, {
      onSuccess: () => {
        toast.ok(t("dg.ver.saved"));
        setName("");
        setNaming(false);
      },
      onError: toast.error,
    });
  };

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange} title={t("dg.ver.title")} description={t("dg.ver.desc")} className="md:w-[620px]">
        {editable ? (
          naming ? (
            <form
              className="mb-4 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <label className={`${inputBoxCls} min-w-0 flex-1`}>
                <span className="sr-only">{t("dg.ver.nameLabel")}</span>
                <input
                  autoFocus
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("dg.ver.nameLabel")}
                  className={inputCls}
                />
              </label>
              <Button type="submit" variant="accent" size="sm" loading={m.saveNamed.isPending} disabled={!name.trim()}>
                {t("dg.form.save")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setNaming(false)}>
                {t("dg.form.cancel")}
              </Button>
            </form>
          ) : (
            <Button variant="outline" size="sm" className="mb-4" onClick={() => setNaming(true)}>
              {t("dg.ver.save")}
            </Button>
          )
        ) : null}
        {versions.isPending ? (
          <Loading>
            <Bone className="h-10 w-full" />
            <Bone className="mt-2 h-10 w-full" />
          </Loading>
        ) : versions.isError ? (
          <p className="text-sm text-danger">{t("dg.ver.loadError")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">{t("dg.ver.empty")}</p>
        ) : (
          <>
            <p className="mb-2 font-mono text-[12px] text-muted">{t("dg.ver.compareHint")}</p>
            <ul className="max-h-[40dvh] divide-y divide-line overflow-y-auto border border-line">
              {items.map((v) => (
                <li key={v.version} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--accent)]"
                    checked={picked.includes(v.version)}
                    onChange={() => toggle(v.version)}
                    aria-label={`${t("dg.ver.compare")} v${v.version}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="font-mono">v{v.version}</span>
                      <span className="min-w-0 break-words">{v.label || v.name || ""}</span>
                      {v.named ? <span className="border border-line-strong px-1 font-mono text-[10px] uppercase">{t("dg.ver.named")}</span> : null}
                    </p>
                    <p className="font-mono text-[12px] text-muted">
                      {t("dg.ver.by", { who: author(v, t) })} · {timeAgo(iso(v.createdAt))}
                    </p>
                  </div>
                  {editable && v !== items[0] ? (
                    <Button variant="ghost" size="sm" onClick={() => setRestoring(v)}>
                      {t("dg.ver.restore")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {a !== undefined && b !== undefined ? <Compare fileId={fileId} a={a} b={b} t={t} /> : null}
          </>
        )}
      </Modal>
      <ConfirmModal
        open={!!restoring}
        title={t("dg.ver.restoreTitle", { v: restoring?.version ?? 0 })}
        body={t("dg.ver.restoreBody")}
        confirm={t("dg.ver.restore")}
        pending={m.restore.isPending}
        onClose={() => setRestoring(null)}
        onConfirm={() =>
          restoring &&
          m.restore.mutate(restoring.version, {
            onSuccess: () => {
              toast.ok(t("dg.ver.restored"));
              setRestoring(null);
            },
            onError: toast.error,
          })
        }
      />
    </>
  );
}
