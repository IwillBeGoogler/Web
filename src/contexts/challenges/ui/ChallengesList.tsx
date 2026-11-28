import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FlameIcon } from "lucide-react";
import { useState } from "react";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { useMe } from "@/contexts/identity/application/session";
import { useT } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Tabs } from "@/shared/ui/modal";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import { challengesQuery } from "../application/hooks";
import type { Tab } from "../infrastructure/challengesRepository";

export function ChallengesList() {
  const t = useT();
  const { me } = useMe();
  const [picked, setTab] = useState<Tab>("active");
  const tab: Tab = me ? picked : "active";
  const q = useInfiniteQuery(challengesQuery(tab));
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[32px] font-bold tracking-tight md:text-[42px]">{t("challenge.heading")}</h1>
        {me ? (
          <Button asChild size="sm">
            <Link to="/challenges/new">{t("challenge.new")}</Link>
          </Button>
        ) : (
          <Button size="sm" onClick={() => authDialog.open("signin")}>
            {t("challenge.new")}
          </Button>
        )}
      </header>
      <p className="mt-2 text-sm text-muted">{t("challenge.lead")}</p>
      {me ? (
        <Tabs
          className="mt-5"
          value={tab}
          onChange={setTab}
          items={[
            ["active", t("challenge.tab.active")],
            ["following", t("challenge.tab.following")],
            ["mine", t("challenge.tab.mine")],
          ]}
        />
      ) : null}
      {q.isPending ? (
        <Loading>
          <Bone className="mt-6 h-20 w-full" />
        </Loading>
      ) : q.isError && !items.length ? (
        <EmptyState icon={FlameIcon} title={t("page.error")} action={<Button onClick={() => q.refetch()}>{t("page.tryAgain")}</Button>} />
      ) : items.length ? (
        <ul className="mt-4">
          {items.map((c) => (
            <li key={c.id} className="border-b border-line py-5">
              <Link to="/challenges/$id" params={{ id: String(c.id) }} className="text-lg font-bold hover:underline">
                {c.title}
              </Link>
              {c.description ? <p className="mt-1 line-clamp-2 font-serif text-muted">{c.description}</p> : null}
              <p className="mt-1 font-mono text-[12px] text-muted">
                @{c.author} · {t("challenge.progress", { done: c.days_done, of: c.days })} · {c.start_date}
                {c.visibility === "private" ? ` · ${t("challenge.private")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={FlameIcon} title={t("challenge.empty")} />
      )}
      {q.hasNextPage ? (
        <div className="mt-4 text-center">
          <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {t("challenge.more")}
          </Button>
        </div>
      ) : null}
    </>
  );
}
