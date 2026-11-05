import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { inputBoxCls } from "@/shared/ui/form";
import { Modal } from "@/shared/ui/modal";
import { Bone } from "@/shared/ui/states";
import { publishedQuery } from "../application/hooks";
import { diagramEmbedLine, slugFromInput } from "../domain/diagram";

/**
 * Story editor: pick one of my published diagrams (unlisted or public) and hand back the `::diagram{slug=...}` line.
 * The paste field stays as a fallback (a link to someone else's diagram).
 */
export function DiagramPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (line: string) => void }) {
  const t = useT();
  const q = useInfiniteQuery({ ...publishedQuery(), enabled: open });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const pick = (slug: string) => {
    onPick(diagramEmbedLine(slug));
    onOpenChange(false);
    setText("");
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t("dg.insert.title")} description={t("dg.insert.lead")}>
      <p className="kicker mb-2">{t("dg.insert.mine")}</p>
      {q.isPending ? (
        <Bone className="h-16 w-full" />
      ) : rows.length ? (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-[var(--radius-sm)] border border-line-strong">
          {rows.map((d) => (
            <li key={d.fileId}>
              <button
                type="button"
                onClick={() => pick(d.slug)}
                className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.title}</span>
                </span>
                <span className="shrink-0 rounded-[var(--radius-xs)] border border-line-strong px-1.5 py-0.5 font-mono text-[10px] text-muted uppercase">
                  {t(d.visibility === "public" ? "dg.vis.public" : "dg.vis.unlisted")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-mono text-[12px] text-muted">{t("dg.insert.empty")}</p>
      )}
      {q.hasNextPage ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => void q.fetchNextPage()}>
          {t("dg.search.more")}
        </Button>
      ) : null}
      <form
        className="mt-5 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const slug = slugFromInput(text);
          if (slug) pick(slug);
          else setBad(true);
        }}
      >
        <label htmlFor="dg-paste" className="kicker block">
          {t("dg.insert.paste")}
        </label>
        <div className="flex gap-2">
          <input
            id="dg-paste"
            className={inputBoxCls}
            value={text}
            placeholder="https://…/d/v/checkout-1a2b3c4d"
            aria-invalid={bad}
            onChange={(e) => {
              setText(e.target.value);
              setBad(false);
            }}
          />
          <Button type="submit" variant="accent" disabled={!text.trim()}>
            {t("dg.insert.add")}
          </Button>
        </div>
        <p className={bad ? "font-mono text-[12px] text-danger" : "font-mono text-[11px] text-muted"} role={bad ? "alert" : undefined}>
          {bad ? t("dg.insert.invalid") : t("dg.insert.pasteHint")}
        </p>
      </form>
    </Modal>
  );
}
