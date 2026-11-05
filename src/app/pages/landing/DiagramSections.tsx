import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, ImageOffIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { TemplateKind } from "@/contexts/diagrams/domain/diagram";
import { type MessageKey, useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { Magnetic, Reveal, Stagger, StaggerItem, Tilt } from "@/shared/motion";
import { Button } from "@/shared/ui/button";
import { landingRecentQuery, landingTemplatesQuery } from "./diagramQueries";

/* Illustrations: 160x96 line drawings in currentColor, so they follow the theme. */
const Art = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 160 96" role="img" aria-hidden className="h-24 w-full text-fg" fill="none" stroke="currentColor" strokeWidth="1.5">
    {children}
  </svg>
);

const SystemArt = () => (
  <Art>
    <rect x="6" y="36" width="30" height="24" rx="3" />
    <rect x="62" y="8" width="34" height="22" rx="3" />
    <rect x="62" y="66" width="34" height="22" rx="3" />
    <path d="M36 44 62 20M36 52 62 76" />
    <path d="M96 19h14M96 77h14" strokeDasharray="3 3" className="text-muted" />
    <ellipse cx="132" cy="19" rx="16" ry="5" />
    <path d="M116 19v16c0 3 7 5 16 5s16-2 16-5V19" />
    <ellipse cx="132" cy="77" rx="16" ry="5" className="text-accent" />
    <path d="M116 77v10c0 3 7 5 16 5s16-2 16-5V77" className="text-accent" />
  </Art>
);

const DbArt = () => (
  <Art>
    <rect x="8" y="12" width="52" height="40" rx="3" />
    <path d="M8 24h52M8 36h52" />
    <rect x="100" y="44" width="52" height="40" rx="3" />
    <path d="M100 56h52M100 68h52" />
    <path d="M60 30h20v32h20" className="text-accent" />
    <path d="M64 24v12M64 36h-4" strokeWidth="1" />
    <path d="M94 56l6 6-6 6" />
  </Art>
);

const OodArt = () => (
  <Art>
    <rect x="52" y="6" width="56" height="28" rx="3" />
    <path d="M52 17h56" />
    <rect x="8" y="62" width="48" height="28" rx="3" />
    <path d="M8 73h48" />
    <rect x="104" y="62" width="48" height="28" rx="3" />
    <path d="M104 73h48" />
    <path d="M32 62V48h48V34M128 62V48H80" />
    <path d="M74 34l6-8 6 8z" className="text-accent" fill="var(--card)" />
  </Art>
);

const blocks = [
  { id: "sdd", art: SystemArt, title: "land.dg.sdd.title", body: "land.dg.sdd.body" },
  { id: "erd", art: DbArt, title: "land.dg.erd.title", body: "land.dg.erd.body" },
  { id: "uml", art: OodArt, title: "land.dg.uml.title", body: "land.dg.uml.body" },
] as const satisfies readonly { id: string; art: () => ReactNode; title: MessageKey; body: MessageKey }[];

/** Three diagram kinds, one card each. */
export function DiagramKinds() {
  const t = useT();
  return (
    <section aria-labelledby="diagrams" className="mx-auto max-w-shell px-4 py-20 md:px-6">
      <Reveal>
        <p className="kicker">{t("land.dg.kicker")}</p>
        <h2 id="diagrams" className="mt-3 max-w-2xl font-display text-4xl leading-tight font-bold tracking-[-0.04em] md:text-6xl">
          {t("land.dg.title")} <span className="text-gradient font-extrabold">{t("land.dg.titleAccent")}</span>
        </h2>
      </Reveal>
      <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
        {blocks.map((b) => (
          <StaggerItem key={b.id} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className="panel ring-grad p-6">
            <Tilt>
              <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3">
                <b.art />
              </div>
            </Tilt>
            <h3 className="mt-5 text-lg font-bold">{t(b.title)}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{t(b.body)}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

const steps = ["land.dg.wd.s1", "land.dg.wd.s2", "land.dg.wd.s3"] as const;

/** How a diagram lands inside a story. */
export function WriteAndDraw({ onStart }: { onStart: () => void }) {
  const t = useT();
  return (
    <section aria-labelledby="write-draw" className="border-y border-line">
      <div className="mx-auto grid max-w-shell items-center gap-10 px-4 py-20 md:px-6 lg:grid-cols-2">
        <Reveal>
          <p className="kicker">{t("land.dg.wd.kicker")}</p>
          <h2 id="write-draw" className="mt-3 font-display text-4xl leading-tight font-bold tracking-[-0.04em] md:text-5xl">
            {t("land.dg.wd.title")} <span className="text-gradient font-extrabold">{t("land.dg.wd.titleAccent")}</span>
          </h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted">{t("land.dg.wd.body")}</p>
          <ol className="mt-6 space-y-2 font-mono text-[13px]">
            {steps.map((s, i) => (
              <li key={s} className="flex items-baseline gap-3">
                <span className="idx text-fg">{String(i + 1).padStart(2, "0")}</span>
                <span>{t(s)}</span>
              </li>
            ))}
          </ol>
          <Magnetic className="mt-8 inline-block">
            <Button size="lg" variant="outline" className="h-12 px-7" onClick={onStart}>
              {t("land.dg.wd.cta")}
            </Button>
          </Magnetic>
        </Reveal>
        <Reveal>
          <Tilt>
            <div className="tile overflow-hidden">
              <p className="tile-head" aria-hidden>
                <span className="idx text-fg">01</span>
                <span>{t("land.dg.wd.kicker")}</span>
              </p>
              <div className="space-y-3 p-5">
                <div className="h-3 w-2/3 rounded-[var(--radius-xs)] bg-surface-2" aria-hidden />
                <div className="h-3 w-full rounded-[var(--radius-xs)] bg-surface-2" aria-hidden />
                <div className="rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 p-3">
                  <SystemArt />
                  <p className="mt-2 font-mono text-[11px] text-muted">::diagram&#123;slug=url-shortener&#125;</p>
                </div>
                <div className="h-3 w-5/6 rounded-[var(--radius-xs)] bg-surface-2" aria-hidden />
              </div>
            </div>
          </Tilt>
        </Reveal>
      </div>
    </section>
  );
}

function Thumb({ src }: { src: string | null | undefined }) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden border-b border-line bg-surface-2">
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

type Filter = "all" | TemplateKind;
const FILTERS: readonly { id: Filter; label: MessageKey }[] = [
  { id: "all", label: "dg.templates.all" },
  { id: "system", label: "dg.templates.system" },
  { id: "db", label: "dg.templates.db" },
  { id: "ood", label: "dg.templates.ood" },
];
const kindLabel: Record<TemplateKind, MessageKey> = { system: "dg.templates.system", db: "dg.templates.db", ood: "dg.templates.ood" };

/** Up to six published templates with kind chips. Renders nothing while loading, on error or when empty. */
export function TemplatesTeaser() {
  const t = useT();
  const q = useQuery(landingTemplatesQuery());
  const [filter, setFilter] = useState<Filter>("all");
  const all = q.data ?? [];
  if (q.isError || all.length === 0) return null;
  const shown = all.filter((x) => filter === "all" || x.kind === filter).slice(0, 6);
  return (
    <section aria-labelledby="templates" className="border-b border-line">
      <div className="mx-auto max-w-shell px-4 py-16 md:px-6">
        <Reveal>
          <h2 id="templates" className="kicker flex items-center gap-2">
            <span aria-hidden className="grid size-6 place-items-center rounded-[var(--radius-xs)] bg-inverse text-[11px] text-on-inverse">
              ▦
            </span>{" "}
            {t("land.dg.tpl.title")}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">{t("land.dg.tpl.lead")}</p>
        </Reveal>
        <div role="group" aria-label={t("dg.templates.filter")} className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-[var(--radius-sm)] border px-3 py-1.5 font-mono text-[13px] transition-colors",
                filter === f.id ? "border-fg bg-inverse text-on-inverse" : "border-line bg-card hover:border-fg",
              )}
            >
              {t(f.label)}
            </button>
          ))}
        </div>
        <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((tpl, i) => (
            <StaggerItem key={tpl.id}>
              <article className="tile tile-hover relative flex h-full flex-col overflow-hidden">
                <p className="tile-head" aria-hidden>
                  <span className="idx text-fg">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 truncate">{t(kindLabel[tpl.kind])}</span>
                  <span className="ml-auto shrink-0 tabular-nums">{t("dg.pages", { n: tpl.page_count })}</span>
                </p>
                <Thumb src={tpl.thumbnail_url} />
                <div className="p-4">
                  <h3 className="line-clamp-2 font-display text-base leading-5 font-bold tracking-[-0.02em]">
                    <Link to="/templates" className="after:absolute after:inset-0">
                      {tpl.title}
                    </Link>
                  </h3>
                  {tpl.description ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{tpl.description}</p> : null}
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
        <Reveal className="mt-8">
          <Button variant="link" asChild>
            <Link to="/templates">
              {t("land.dg.tpl.all")} <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

/** The newest public diagrams. Hidden unless there are some. */
export function RecentDiagrams() {
  const t = useT();
  const q = useQuery(landingRecentQuery());
  const items = q.data ?? [];
  if (q.isError || items.length === 0) return null;
  return (
    <section aria-labelledby="recent-diagrams" className="border-b border-line">
      <div className="mx-auto max-w-shell px-4 py-16 md:px-6">
        <Reveal>
          <h2 id="recent-diagrams" className="kicker flex items-center gap-2">
            <span aria-hidden className="grid size-6 place-items-center rounded-[var(--radius-xs)] bg-inverse text-[11px] text-on-inverse">
              ◇
            </span>{" "}
            {t("land.dg.recent")}
          </h2>
        </Reveal>
        <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((d) => (
            <StaggerItem key={d.slug}>
              <article className="tile tile-hover relative flex h-full flex-col overflow-hidden">
                <Thumb src={d.thumbnail_url} />
                <div className="min-w-0 p-4">
                  <h3 className="line-clamp-2 font-display text-base leading-5 font-bold tracking-[-0.02em]">
                    <Link to="/d/v/$slug" params={{ slug: d.slug }} className="after:absolute after:inset-0">
                      {d.title}
                    </Link>
                  </h3>
                  <p className="mt-2 font-mono text-[11px] text-muted">@{d.author.username}</p>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
