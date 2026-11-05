import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CloudOffIcon, FileQuestionIcon, FlagIcon, LinkIcon } from "lucide-react";
import { lazy, Suspense, useCallback, useState } from "react";
import { ReportDialog } from "@/contexts/engagement/ui/ReportDialog";
import { requireAuth } from "@/contexts/identity/application/authDialog";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { useHead } from "@/shared/head";
import { isApiError } from "@/shared/http";
import { useLang, useT } from "@/shared/i18n";
import { shortDate } from "@/shared/lib/format";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { Bone, EmptyState } from "@/shared/ui/states";
import { useDark } from "@/shared/ui/theme";
import { toast } from "@/shared/ui/toast";
import { publicDiagramQuery } from "../application/hooks";
import { kindKey } from "./DiagramCard";
import { DiagramEngagement } from "./DiagramEngagement";
import { Booting } from "./EditorHost";

// the same lazy chunk as the file editor: nothing of it loads until a diagram page is opened
const DiagramEditor = lazy(() => import("@diagram-editor").then((m) => ({ default: m.DiagramEditor })));

// a published diagram is shown read-only: no comments, sharing, sockets, library or previews of its own
const VIEWER_FEATURES = { comments: false, sharing: false, realtime: false, collab: false, rtc: false, privateNotes: false, library: false, thumbnails: false };
const anonymous = (): Record<string, string> => ({});

/** `/d/v/$slug`: a published diagram, open to anyone. Byline and tags above, the editor in viewer mode below. */
export function PublicViewer({ slug }: { slug: string }) {
  const t = useT();
  const nav = useNavigate();
  const dark = useDark();
  const lang = useLang();
  const [reporting, setReporting] = useState(false);
  const q = useQuery(publicDiagramQuery(slug));
  const d = q.data;
  useHead({
    title: d?.title,
    description: d ? d.description || `${t(kindKey[d.kind])} · @${d.author.username}` : undefined,
    canonical: `/d/v/${slug}`,
    image: d?.thumbnail_url || undefined,
    type: d ? "article" : undefined,
    noindex: d ? d.visibility !== "public" : true,
  });
  const goHome = useCallback(() => void nav({ to: "/" }), [nav]);
  const copy = () => navigator.clipboard?.writeText(new URL(`/d/v/${slug}`, location.origin).href).then(() => toast.ok(t("dg.copied")), toast.error);

  if (q.isError)
    return isApiError(q.error) && q.error.status >= 400 && q.error.status < 500 ? (
      <EmptyState
        icon={FileQuestionIcon}
        code="404 · not found"
        title={t("dg.view.missing")}
        body={t("dg.view.missingBody")}
        action={
          <Button asChild>
            <Link to="/">{t("page.backHome")}</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={CloudOffIcon}
        code="err · offline"
        title={t("dg.loadError")}
        action={
          <Button variant="outline" loading={q.isFetching} onClick={() => q.refetch()}>
            {t("page.tryAgain")}
          </Button>
        }
      />
    );

  return (
    <main className="flex h-[calc(100dvh-3.5rem)] flex-col" id="main">
      <header className="shrink-0 border-b border-line-strong bg-card px-4 py-3 md:px-6">
        {d ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="min-w-0 flex-1 basis-64">
              <p className="kicker truncate">
                {t(kindKey[d.kind])} · {t("dg.view.readOnly")}
              </p>
              <h1 title={d.title} className="truncate font-display text-xl leading-7 font-bold tracking-[-0.02em] md:text-2xl">
                <Bio>{d.title}</Bio>
              </h1>
              {d.description ? <p className="line-clamp-1 hidden text-sm text-muted md:block">{d.description}</p> : null}
            </div>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Avatar name={d.author.display_name || d.author.username} src={d.author.avatar_url} size="xs" />
              <span className="min-w-0">
                <span className="text-muted">{t("dg.view.by")} </span>
                <Link to="/@{$username}" params={{ username: d.author.username }} className="font-medium hover:underline">
                  @{d.author.username}
                </Link>
                <span className="block font-mono text-[11px] text-muted">{t("dg.view.updated", { date: shortDate(d.updated_at) })}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* three at most: the bar must leave the canvas its height, on phones too */}
              {d.tags.slice(0, 3).map((tag) => (
                <Link key={tag} to="/tag/$tag" params={{ tag }} className="tag max-sm:hidden">
                  <span className="truncate">#{tag}</span>
                </Link>
              ))}
              <DiagramEngagement d={d} />
              <Button variant="outline" size="sm" onClick={copy}>
                <LinkIcon className="size-3.5" aria-hidden /> {t("dg.view.share")}
              </Button>
              <Button variant="outline" size="sm" onClick={requireAuth(() => setReporting(true))}>
                <FlagIcon className="size-3.5" aria-hidden /> {t("dg.view.report")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2" aria-busy="true">
            <Bone className="h-3 w-24" />
            <Bone className="h-6 w-1/3" />
          </div>
        )}
      </header>
      <ReportDialog target={reporting && d ? { type: "diagram", fileId: d.file_id } : null} onClose={() => setReporting(false)} />
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <Suspense fallback={<Booting className="size-full" />}>
            <DiagramEditor
              slug={slug}
              theme={dark ? "dark" : "light"}
              lang={lang}
              user={null}
              getAuthHeaders={anonymous}
              features={VIEWER_FEATURES}
              onNavigate={goHome}
            />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
