import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CloudOffIcon, LayoutTemplateIcon } from "lucide-react";
import { useState } from "react";
import { requireAuth } from "@/contexts/identity/application/authDialog";
import { type MessageKey, useT } from "@/shared/i18n";
import { Stagger, StaggerItem } from "@/shared/motion";
import { Button } from "@/shared/ui/button";
import { Lens } from "@/shared/ui/modal";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import { toast } from "@/shared/ui/toast";
import { templatesQuery, useForkTemplate } from "../application/hooks";
import type { DiagramTemplate, TemplateKind } from "../domain/diagram";
import { h1 } from "./Dashboard";
import { Thumb } from "./DiagramCard";

type Filter = "all" | TemplateKind;
const kindLabel: Record<TemplateKind, MessageKey> = { system: "dg.templates.system", db: "dg.templates.db", ood: "dg.templates.ood" };

function TemplateCard({ tpl, index, busy, locked, onUse }: { tpl: DiagramTemplate; index: number; busy: boolean; locked: boolean; onUse: () => void }) {
  const t = useT();
  return (
    <article className="tile tile-hover relative flex h-full flex-col overflow-hidden">
      <header className="tile-head">
        <span className="idx text-fg">{String(index + 1).padStart(2, "0")}</span>
        <span className="min-w-0 truncate">{t(kindLabel[tpl.kind])}</span>
        <span className="ml-auto shrink-0 tabular-nums">{t("dg.pages", { n: tpl.page_count })}</span>
      </header>
      <Thumb src={tpl.thumbnail_url} />
      <div className="flex-1 p-4">
        <h2 className="line-clamp-2 font-display text-[19px] leading-6 font-bold tracking-[-0.02em]">{tpl.title}</h2>
        {tpl.description ? <p className="mt-2 line-clamp-3 text-[14px] leading-[22px] text-muted">{tpl.description}</p> : null}
      </div>
      <footer className="border-t border-line p-2">
        {/* the whole tile is the button (it lifts on hover like every card); `static` lets its hit area cover the tile */}
        <Button variant="outline" size="sm" className="static w-full after:absolute after:inset-0" loading={busy} disabled={locked} onClick={onUse}>
          {t("dg.templates.use")}
        </Button>
      </footer>
    </article>
  );
}

/** `/templates`: the gallery. "Use template" forks it into a new project of mine and opens the file. */
export function Templates() {
  const t = useT();
  const nav = useNavigate();
  const q = useQuery(templatesQuery());
  const fork = useForkTemplate();
  const [kind, setKind] = useState<Filter>("all");
  const [using, setUsing] = useState<string | null>(null);
  const items = (q.data ?? []).filter((x) => kind === "all" || x.kind === kind);
  const use = (id: string) =>
    requireAuth(() => {
      setUsing(id);
      fork.mutate(id, {
        onSuccess: ({ fileId }) => void nav({ to: "/d/f/$fileId", params: { fileId } }),
        onError: toast.error,
        onSettled: () => setUsing(null),
      });
    })();
  return (
    <div className="py-6">
      <h1 className={h1}>{t("dg.templates")}</h1>
      <p className="mt-2 max-w-prose text-muted">{t("dg.templates.lead")}</p>
      <div className="mt-8 mb-6">
        <Lens
          label={t("dg.templates.filter")}
          value={kind}
          onChange={setKind}
          items={[
            ["all", t("dg.templates.all")],
            ["system", t("dg.templates.system")],
            ["db", t("dg.templates.db")],
            ["ood", t("dg.templates.ood")],
          ]}
        />
      </div>
      {q.isPending ? (
        <Loading>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <li key={i} className="tile space-y-3 p-4">
                <Bone className="aspect-[16/9] w-full" />
                <Bone className="h-5 w-2/3" />
              </li>
            ))}
          </ul>
        </Loading>
      ) : q.isError ? (
        <EmptyState
          icon={CloudOffIcon}
          code="err · fetch failed"
          title={t("dg.loadError")}
          action={
            <Button variant="outline" loading={q.isFetching} onClick={() => void q.refetch()}>
              {t("page.tryAgain")}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState icon={LayoutTemplateIcon} code="0 · templates" title={t("dg.templates.empty")} />
      ) : (
        <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((x, i) => (
            <StaggerItem as="li" key={x.id}>
              <TemplateCard tpl={x} index={i} busy={using === x.id} locked={using !== null && using !== x.id} onUse={() => use(x.id)} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
