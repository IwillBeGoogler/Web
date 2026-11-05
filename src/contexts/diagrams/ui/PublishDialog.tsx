import { useQuery } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, ExternalLinkIcon, GlobeIcon } from "lucide-react";
import { useState } from "react";
import { useT } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Field, inputCls } from "@/shared/ui/form";
import { Lens, Modal } from "@/shared/ui/modal";
import { Bone } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { publicationQuery, usePublishing } from "../application/hooks";
import { isPublished, normalizeTags, PUBLISH_LIMITS, type Publication, type PublishVisibility } from "../domain/diagram";

const area = "block min-h-20 w-full resize-y bg-transparent py-1 text-[15px] leading-6 text-fg outline-none placeholder:text-muted";

/** The absolute address of a published page, for copying. */
const absolute = (url: string) => new URL(url, window.location.origin).href;

function PublishForm({ fileId, current, onClose }: { fileId: string; current: Publication; onClose: () => void }) {
  const t = useT();
  const { publish, unpublish } = usePublishing(fileId);
  const live = isPublished(current);
  const [visibility, setVisibility] = useState<PublishVisibility>(current.visibility === "unlisted" ? "unlisted" : "public");
  const [title, setTitle] = useState(current.title);
  const [description, setDescription] = useState(current.description);
  const [tags, setTags] = useState(current.tags.join(", "));
  const link = live && current.url ? absolute(current.url) : null;
  const copy = () => navigator.clipboard?.writeText(link ?? "").then(() => toast.ok(t("dg.copied")), toast.error);
  const busy = publish.isPending || unpublish.isPending;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        publish.mutate(
          { visibility, title: title.trim(), description: description.trim(), tags: normalizeTags(tags) },
          { onSuccess: () => toast.ok(t("dg.publish.done")), onError: toast.error },
        );
      }}
    >
      <p className="text-sm text-muted">{t("dg.publish.lead")}</p>
      <div>
        <p id="dg-vis" className="kicker mb-2">
          {t("dg.publish.visibility")}
        </p>
        <Lens
          label={t("dg.publish.visibility")}
          value={visibility}
          onChange={setVisibility}
          items={[
            ["unlisted", t("dg.vis.unlisted")],
            ["public", t("dg.vis.public")],
          ]}
        />
        <p className="mt-2 font-mono text-[11px] text-muted">{visibility === "public" ? t("dg.vis.publicHint") : t("dg.vis.unlistedHint")}</p>
      </div>
      <Field label={t("dg.publish.titleLabel")}>
        {(a) => <input {...a} className={inputCls} value={title} maxLength={PUBLISH_LIMITS.title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <Field label={t("dg.publish.descLabel")}>
        {(a) => (
          <textarea {...a} className={area} value={description} maxLength={PUBLISH_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
        )}
      </Field>
      <Field label={t("dg.publish.tagsLabel")} hint={t("dg.publish.tagsHint")}>
        {(a) => <input {...a} className={inputCls} value={tags} placeholder="system-design, kafka" onChange={(e) => setTags(e.target.value)} />}
      </Field>
      {link ? (
        <div>
          <p className="kicker mb-2">{t("dg.publish.link")}</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label={t("dg.publish.link")}
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 font-mono text-[12px] outline-none focus:border-fg"
            />
            <Button variant="outline" size="sm" onClick={copy}>
              <CopyIcon className="size-3.5" aria-hidden /> {t("dg.copy")}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={current.url ?? "#"} target="_blank" rel="noreferrer" aria-label={t("dg.publish.open")}>
                <ExternalLinkIcon className="size-3.5" aria-hidden />
              </a>
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" variant="accent" loading={publish.isPending} disabled={busy}>
          {live ? t("dg.publish.update") : t("dg.publish.submit")}
        </Button>
        {live ? (
          <Button
            variant="outline"
            className="hover:text-danger"
            loading={unpublish.isPending}
            disabled={busy}
            onClick={() => unpublish.mutate(undefined, { onSuccess: () => toast.ok(t("dg.publish.removed")), onError: toast.error })}
          >
            {t("dg.publish.unpublish")}
          </Button>
        ) : null}
        <Button variant="ghost" className="ml-auto" onClick={onClose}>
          OK
        </Button>
      </div>
    </form>
  );
}

export function PublishDialog({ fileId, open, onOpenChange }: { fileId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const q = useQuery({ ...publicationQuery(fileId), enabled: open });
  const p = q.data;
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t("dg.publish.title")}>
      {p ? (
        // keyed on what the server holds, so a publish / unpublish shows the new state (link, labels) with the fields kept in step
        <PublishForm key={`${p.visibility}:${p.slug ?? ""}:${p.publishedAt ?? 0}`} fileId={fileId} current={p} onClose={() => onOpenChange(false)} />
      ) : q.isError ? (
        <p className="font-mono text-[12px] text-danger" role="alert">
          {t("page.pleaseRetry")}
        </p>
      ) : (
        <Bone className="h-40 w-full" />
      )}
    </Modal>
  );
}

/**
 * The editor's "Publish" button (owner only: the host passes it through `hostActions`). It reads the file's page lazily, so the label
 * says whether it is already live.
 */
export function PublishButton({ fileId }: { fileId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const q = useQuery(publicationQuery(fileId));
  const live = isPublished(q.data);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {live ? <CheckIcon className="size-3.5" aria-hidden /> : <GlobeIcon className="size-3.5" aria-hidden />}
        {live ? t("dg.publish.live") : t("dg.publish")}
      </Button>
      {open ? <PublishDialog fileId={fileId} open onOpenChange={setOpen} /> : null}
    </>
  );
}
