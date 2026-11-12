import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FolderTreeIcon } from "lucide-react";
import { topicsQuery } from "@/contexts/reading/application/queries";
import { pathTo, type TopicNode, topicName } from "@/contexts/reading/domain/topic";
import { Feed } from "@/contexts/reading/ui/Feed";
import { useHead } from "@/shared/head";
import { useLang, useT } from "@/shared/i18n";
import { compact } from "@/shared/lib/format";
import { Bone, EmptyState, Loading } from "@/shared/ui/states";
import { HomeGrid } from "./HomePage";

const card = "block rounded-[var(--radius-md)] border border-line-strong bg-card p-4 hover:border-fg hover:shadow-[3px_3px_0_0_var(--fg)]";

function Count({ n }: { n: number }) {
  const t = useT();
  return (
    <span className="font-mono text-[11px] text-muted tabular-nums">
      {compact(n)} {t("topics.stories")}
    </span>
  );
}

function Skeleton() {
  return (
    <Loading>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-40" />
        ))}
      </div>
    </Loading>
  );
}

/** /topics: every root topic with its subtopics, a story count on each. */
export function TopicsPage() {
  const t = useT();
  const lang = useLang();
  const q = useQuery(topicsQuery());
  useHead({ title: t("topics.title"), description: t("topics.lead") });
  return (
    <main id="main" className="mx-auto max-w-shell px-4 pb-24 md:px-6">
      <header className="py-8 text-center">
        <p className="text-sm text-muted">{t("topics.lead")}</p>
        <h1 className="mt-2 font-display text-[32px] font-bold tracking-tight md:text-[42px]">{t("topics.title")}</h1>
      </header>
      {q.isPending ? <Skeleton /> : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((root) => (
          <li key={root.id} className={card}>
            <Link to="/topics/$slug" params={{ slug: root.slug }} className="block">
              <h2 className="font-display text-lg font-bold tracking-tight">{topicName(root, lang)}</h2>
              <Count n={root.total} />
            </Link>
            {root.children.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {root.children.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <Link to="/topics/$slug" params={{ slug: c.slug }} className="tag">
                      <span className="min-w-0 truncate">{topicName(c, lang)}</span>
                    </Link>
                  </li>
                ))}
                {root.children.length > 8 ? <li className="self-center font-mono text-[11px] text-muted">+{root.children.length - 8}</li> : null}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}

function Branch({ node, lang }: { node: TopicNode; lang: ReturnType<typeof useLang> }) {
  return (
    <li>
      <Link to="/topics/$slug" params={{ slug: node.slug }} className={card}>
        <span className="block font-display font-bold tracking-tight">{topicName(node, lang)}</span>
        <Count n={node.total} />
      </Link>
    </li>
  );
}

/** /topics/:slug: breadcrumb, subtopics and the stories filed under this topic or any below it. */
export function TopicPage({ slug }: { slug: string }) {
  const t = useT();
  const lang = useLang();
  const q = useQuery(topicsQuery());
  const chain = q.data ? pathTo(q.data, slug) : [];
  const node = chain.at(-1);
  useHead({ title: node ? topicName(node, lang) : t("topics.title"), description: node?.description ?? t("topics.lead") });
  if (q.isPending)
    return (
      <HomeGrid>
        <Skeleton />
      </HomeGrid>
    );
  if (!node)
    return (
      <EmptyState
        icon={FolderTreeIcon}
        title={t("topics.notFound")}
        action={
          <Link to="/topics" className="underline">
            {t("topics.title")}
          </Link>
        }
      />
    );
  return (
    <HomeGrid>
      <header className="py-8 text-center">
        <nav aria-label="Breadcrumb" className="font-mono text-[12px] text-muted">
          <Link to="/topics" className="hover:text-fg">
            {t("topics.title")}
          </Link>
          {chain.slice(0, -1).map((p) => (
            <span key={p.id}>
              {" / "}
              <Link to="/topics/$slug" params={{ slug: p.slug }} className="hover:text-fg">
                {topicName(p, lang)}
              </Link>
            </span>
          ))}
        </nav>
        <h1 className="mt-2 font-display text-[32px] font-bold tracking-tight md:text-[42px]">{topicName(node, lang)}</h1>
        {node.description ? <p className="mx-auto mt-2 max-w-prose text-sm text-muted">{node.description}</p> : null}
        <p className="mt-2">
          <Count n={node.total} />
        </p>
      </header>
      {node.children.length ? (
        <section aria-label={t("topics.sub")} className="mb-8">
          <h2 className="kicker mb-3">{t("topics.sub")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {node.children.map((c) => (
              <Branch key={c.id} node={c} lang={lang} />
            ))}
          </ul>
        </section>
      ) : null}
      <Feed source={{ kind: "topic", id: node.id }} empty={{ title: t("topics.empty") }} />
    </HomeGrid>
  );
}
