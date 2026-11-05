import { type UseInfiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { AlertCircleIcon, type LucideIcon, ShapesIcon } from "lucide-react";
import type { Page } from "@/shared/http";
import { useT } from "@/shared/i18n";
import { Stagger, StaggerItem } from "@/shared/motion";
import { Button } from "@/shared/ui/button";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import type { PublicDiagram } from "../domain/diagram";
import { DiagramCard } from "./DiagramCard";

type Q = UseInfiniteQueryOptions<Page<PublicDiagram>, Error, { pages: Page<PublicDiagram>[]; pageParams: unknown[] }, readonly unknown[], never>;

/** A card grid of published diagrams with "show more". `query` is one of the infinite queries of `application/hooks`. */
export function DiagramList({ query, empty, byline }: { query: unknown; empty: { icon?: LucideIcon; title: string }; byline?: boolean }) {
  const t = useT();
  const q = useInfiniteQuery(query as Q);
  if (q.isPending)
    return (
      <Loading>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <li key={i} className="tile space-y-3 p-4">
              <Bone className="aspect-[16/9] w-full" />
              <Bone className="h-5 w-2/3" />
            </li>
          ))}
        </ul>
      </Loading>
    );
  if (q.isError)
    return (
      <EmptyState
        icon={AlertCircleIcon}
        code="err · fetch failed"
        title={t("dg.loadError")}
        action={
          <Button variant="outline" onClick={() => void q.refetch()}>
            {t("page.tryAgain")}
          </Button>
        }
      />
    );
  const rows = q.data.pages.flatMap((p) => p.items);
  if (!rows.length) return <EmptyState icon={empty.icon ?? ShapesIcon} code="0 · diagrams" title={empty.title} />;
  return (
    <div>
      <Stagger as="ul" className="grid gap-3 sm:grid-cols-2" aria-label={t("dg.tab")}>
        {rows.map((d, i) => (
          <StaggerItem as="li" key={d.slug}>
            <DiagramCard d={d} index={i} {...(byline ? { byline } : {})} />
          </StaggerItem>
        ))}
      </Stagger>
      {q.hasNextPage ? (
        <div className="py-6 text-center">
          <Button variant="outline" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t("dg.search.more")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
