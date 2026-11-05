import { Link } from "@tanstack/react-router";
import { ImageOffIcon, ZapIcon } from "lucide-react";
import type { MessageKey } from "@/shared/i18n";
import { useT } from "@/shared/i18n";
import { compact, shortDate } from "@/shared/lib/format";
import type { DiagramKind, PublicDiagram } from "../domain/diagram";

export const kindKey: Record<DiagramKind, MessageKey> = { sdd: "dg.kind.sdd", erd: "dg.kind.erd", uml: "dg.kind.uml", board: "dg.kind.board" };

/** A preview picture, or a hatched placeholder while a diagram has none. */
export function Thumb({ src, className = "" }: { src: string | null | undefined; className?: string }) {
  return (
    <div className={`relative aspect-[16/9] overflow-hidden border-b border-line bg-surface-2 ${className}`}>
      {src ? (
        <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-contain" />
      ) : (
        <span className="hatch absolute inset-0 grid place-items-center text-muted">
          <ImageOffIcon className="size-5" aria-hidden />
        </span>
      )}
    </div>
  );
}

/** Bento tile for a published diagram (the story card's strip, body and tag footer). */
export function DiagramCard({ d, index, byline }: { d: PublicDiagram; index?: number; byline?: boolean }) {
  const t = useT();
  return (
    <article className="tile tile-hover group relative flex h-full flex-col overflow-hidden">
      <header className="tile-head">
        {index !== undefined ? <span className="idx text-fg">{String(index + 1).padStart(2, "0")}</span> : null}
        <span className="min-w-0 truncate">{t(kindKey[d.kind])}</span>
        {d.claps > 0 ? (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 tabular-nums" role="img" aria-label={t("dg.claps", { n: d.claps })}>
            <ZapIcon className="size-3" aria-hidden />
            <span aria-hidden>{compact(d.claps)}</span>
          </span>
        ) : null}
        <time className={d.claps > 0 ? "shrink-0 tabular-nums" : "ml-auto shrink-0 tabular-nums"} dateTime={d.published_at}>
          {shortDate(d.published_at)}
        </time>
      </header>
      <Link
        to="/d/v/$slug"
        params={{ slug: d.slug }}
        className="block outline-none after:absolute after:inset-0 after:z-0 focus-visible:after:outline-2 focus-visible:after:outline-accent"
      >
        <Thumb src={d.thumbnail_url} />
        <div className="p-4">
          <h2 className="line-clamp-2 font-display text-[19px] leading-6 font-bold tracking-[-0.02em]">{d.title}</h2>
          {d.description ? <p className="mt-2 line-clamp-2 text-[14px] leading-[22px] text-muted">{d.description}</p> : null}
        </div>
      </Link>
      {byline || d.tags.length ? (
        <footer className="relative z-10 mt-auto flex flex-wrap items-center gap-2 border-t border-line px-2 py-1.5">
          {byline ? (
            <Link to="/@{$username}" params={{ username: d.author.username }} className="mr-auto truncate px-1 font-mono text-[12px] text-muted hover:text-fg">
              @{d.author.username}
            </Link>
          ) : null}
          {d.tags.slice(0, 2).map((tag) => (
            <Link key={tag} to="/tag/$tag" params={{ tag }} className="tag">
              <span className="truncate">#{tag}</span>
            </Link>
          ))}
        </footer>
      ) : null}
    </article>
  );
}
