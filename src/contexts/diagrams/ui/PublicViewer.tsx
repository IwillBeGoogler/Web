import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CloudOffIcon, FileQuestionIcon, FlagIcon, LinkIcon } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
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
import { diagramRepository } from "../infrastructure/diagramRepository";
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
  const loaded = Boolean(d);
  useEffect(() => {
    if (loaded) void diagramRepository.viewDiagram(slug);
  }, [loaded, slug]);
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
      <header className="shrink-0 border-b border-line-strong bg-card px-3 py-1 md:px-4">
        {d ? (
          <div className="flex min-h-8 items-center gap-3">
            <h1 title={d.description || d.title} className="min-w-0 truncate font-display text-sm font-bold tracking-[-0.01em]">
              <Bio>{d.title}</Bio>
            </h1>
            <span className="flex shrink-0 items-center gap-1.5 text-xs max-sm:hidden" title={t("dg.view.updated", { date: shortDate(d.updated_at) })}>
              <Avatar name={d.author.display_name || d.author.username} src={d.author.avatar_url} size="xs" />
              <Link to="/@{$username}" params={{ username: d.author.username }} className="text-muted hover:underline">
                @{d.author.username}
              </Link>
            </span>
            <span className="min-w-0 flex-1" />
            <div className="flex shrink-0 items-center gap-1 [&_button]:h-7 [&_button]:px-2 [&_button]:text-xs">
              {/* the bar must leave the canvas its height, on phones too */}
              {d.tags.slice(0, 2).map((tag) => (
                <Link key={tag} to="/tag/$tag" params={{ tag }} className="tag text-xs max-lg:hidden">
                  <span className="truncate">#{tag}</span>
                </Link>
              ))}
              <DiagramEngagement d={d} />
              <Button variant="outline" size="sm" onClick={copy}>
                <LinkIcon className="size-3.5" aria-hidden /> <span className="max-md:sr-only">{t("dg.view.share")}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={requireAuth(() => setReporting(true))}>
                <FlagIcon className="size-3.5" aria-hidden /> <span className="max-md:sr-only">{t("dg.view.report")}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-8 items-center" aria-busy="true">
            <Bone className="h-4 w-1/3" />
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
