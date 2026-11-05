import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, BookOpenTextIcon, LayersIcon, PaletteIcon, UsersIcon, ZapIcon } from "lucide-react";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { PALETTES, TYPEFACES } from "@/contexts/preferences/domain/reading";
import { Bio } from "@/contexts/preferences/ui/BionicText";
import { feedQuery, tagsQuery, trendingQuery } from "@/contexts/reading/application/queries";
import { postPath, readTime } from "@/contexts/reading/domain/post";
import { useT } from "@/shared/i18n";
import { shortDate } from "@/shared/lib/format";
import { CountUp, ease, Magnetic, motion, Reveal, RotatingWord, Stagger, StaggerItem, useReducedMotion } from "@/shared/motion";
import { Button } from "@/shared/ui/button";
import { Carousel } from "@/shared/ui/carousel";
import { BRAND } from "../layout/Logo";
import { DiagramKinds, RecentDiagrams, TemplatesTeaser, WriteAndDraw } from "./landing/DiagramSections";

const words = ["Ideas", "worth"];

function Headline() {
  const reduce = useReducedMotion();
  return (
    <h1 aria-label="Ideas worth shipping" className="font-display text-[clamp(3.5rem,9vw,8rem)] leading-[0.88] font-extrabold tracking-[-0.055em] text-fg">
      <span aria-hidden>
        {words.map((w, i) => (
          <motion.span
            key={w}
            className="mr-[0.22em] inline-block"
            initial={reduce ? false : { opacity: 0, y: "0.6em", filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.08 * i, ease }}
          >
            {w}
          </motion.span>
        ))}
        <br />
        <RotatingWord words={["shipping", "sharing", "reading", "keeping"]} className="text-gradient font-extrabold" />
      </span>
    </h1>
  );
}

const features = [
  {
    icon: PaletteIcon,
    title: "Reading, your way",
    body: `${PALETTES.length} palettes, ${TYPEFACES.length} typefaces, size, margin and bold — remembered on every device you use.`,
  },
  { icon: ZapIcon, title: "Bionic & focus modes", body: "Guide your eye through dense prose, or strip everything away but the story." },
  { icon: LayersIcon, title: "Series & lists", body: "Write in parts readers can follow, and keep the stories you love in lists." },
  { icon: UsersIcon, title: "Publications", body: "Start a team blog with editors and writers, and publish together." },
];

export function LandingPage() {
  const t = useT();
  const trending = useQuery(trendingQuery());
  const tags = useQuery(tagsQuery());
  const latest = useInfiniteQuery(feedQuery({ kind: "latest" }));
  const stories = latest.data?.pages[0]?.meta.total ?? 0;
  const topics = (tags.data ?? []).map((t) => t.name);
  const marquee = topics.length ? [...topics, ...topics, ...topics].slice(0, Math.max(24, topics.length * 2)) : [];

  return (
    <main id="main" className="overflow-x-clip">
      <section className="grain relative isolate overflow-hidden border-b border-line">
        <div className="relative mx-auto grid max-w-shell items-center gap-10 px-4 pt-14 pb-16 md:px-6 md:pt-20 md:pb-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <motion.p
              className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-card px-2.5 py-1 font-mono text-[12px] tracking-[0.12em] text-muted uppercase"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
            >
              <span aria-hidden className="size-1.5 bg-fg" /> New on {BRAND}: series, lists & publications
            </motion.p>
            <div className="mt-6">
              <Headline />
            </div>
            <motion.p
              className="mt-8 max-w-lg text-lg leading-7 text-muted md:text-xl md:leading-8"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease }}
            >
              Long-form writing for builders and curious minds. Tuned for focus, made to feel fast.
            </motion.p>
            <motion.div
              className="mt-10 flex flex-wrap items-center gap-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease }}
            >
              <Magnetic>
                <Button size="lg" className="group h-12 px-7" asChild>
                  <Link to="/" search={{ tab: "latest" }}>
                    Open the stream <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </Button>
              </Magnetic>
              <Magnetic>
                <Button size="lg" variant="outline" className="h-12 px-7" onClick={() => authDialog.open("signup")}>
                  Start a draft
                </Button>
              </Magnetic>
              <Magnetic>
                <Button size="lg" variant="ghost" className="h-12 px-5" onClick={() => authDialog.open("signup")}>
                  {t("land.dg.draw")}
                </Button>
              </Magnetic>
            </motion.div>
            <motion.dl
              className="mt-12 grid grid-cols-2 divide-x divide-line border-y border-line"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.7 }}
            >
              {(
                [
                  ["Stories", stories],
                  ["Topics", topics.length],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex flex-col-reverse px-4 py-4 first:pl-0">
                  <dt className="kicker mt-1">{k}</dt>
                  <dd className="font-mono text-3xl font-medium tabular-nums">
                    <CountUp value={v} />
                  </dd>
                </div>
              ))}
            </motion.dl>
          </div>
        </div>
      </section>

      {marquee.length ? (
        <section
          aria-label="Topics"
          className="relative border-b border-line py-5 [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]"
        >
          <div
            style={{ animationDuration: `${marquee.length * 8}s` }}
            className="flex w-max animate-marquee gap-3 hover:[animation-play-state:paused] motion-reduce:animate-none"
          >
            {[...marquee, ...marquee].map((t, i) => (
              <Link
                // biome-ignore lint/suspicious/noArrayIndexKey: marquee repeats topics on purpose
                key={`${t}-${i}`}
                to="/tag/$tag"
                params={{ tag: t }}
                tabIndex={i >= marquee.length ? -1 : undefined}
                aria-hidden={i >= marquee.length || undefined}
                className="shrink-0 rounded-[var(--radius-sm)] border border-line bg-card px-4 py-2 font-mono text-[13px] transition-colors hover:border-fg hover:text-fg"
              >
                {t}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {trending.data?.length ? (
        <section aria-labelledby="trending" className="border-b border-line">
          <div className="mx-auto max-w-shell px-4 py-16 md:px-6">
            <Reveal>
              <h2 id="trending" className="kicker flex items-center gap-2">
                <span aria-hidden className="grid size-6 place-items-center rounded-[var(--radius-xs)] bg-inverse text-[11px] text-on-inverse">
                  ↗
                </span>{" "}
                Rising this week
              </h2>
            </Reveal>
            <Carousel label="Rising this week" slide="basis-[85%] sm:basis-1/2 lg:basis-1/3" autoplay={9000} className="mt-8">
              {trending.data.slice(0, 6).map((p, i) => (
                <div key={p.id} className="h-full p-[3px]">
                  <div className="tile tile-hover relative flex h-full flex-col overflow-hidden">
                    <p className="tile-head" aria-hidden>
                      <span className="idx text-fg">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 truncate">@{p.author}</span>
                      <span className="ml-auto shrink-0">{readTime(p.reading_time)}</span>
                    </p>
                    <div className="min-w-0 p-4">
                      <a
                        href={postPath(p)}
                        className="line-clamp-2 block font-display text-base leading-5 font-bold tracking-[-0.02em] after:absolute after:inset-0"
                      >
                        <Bio>{p.title}</Bio>
                      </a>
                      <p className="mt-2 font-mono text-[11px] text-muted">
                        @{p.author} · {shortDate(p.published_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </Carousel>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="why" className="mx-auto max-w-shell px-4 py-20 md:px-6">
        <Reveal>
          <h2 id="why" className="max-w-2xl font-display text-4xl leading-tight font-bold tracking-[-0.04em] md:text-6xl">
            Built for <span className="text-gradient font-extrabold">deep reading</span>, not doomscrolling.
          </h2>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <StaggerItem key={f.title} whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className="panel ring-grad p-6">
              <span className="grid size-10 place-items-center rounded-[var(--radius-sm)] bg-inverse text-on-inverse">
                <f.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{f.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <DiagramKinds />
      <WriteAndDraw onStart={() => authDialog.open("signup")} />
      <TemplatesTeaser />
      <RecentDiagrams />

      <section className="px-4 py-20 md:px-6">
        <Reveal className="relative isolate mx-auto max-w-shell overflow-hidden rounded-[var(--radius-xl)] border border-line-strong bg-card/60 px-8 py-16 text-center text-fg shadow-[0_0_80px_-20px_var(--accent)] backdrop-blur-md md:py-24">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_50%_120%,color-mix(in_srgb,var(--accent)_30%,transparent),transparent_70%)]"
          />
          <BookOpenTextIcon className="mx-auto size-10 opacity-90" aria-hidden />
          <h2 className="mx-auto mt-6 max-w-2xl font-display text-4xl leading-tight font-bold tracking-[-0.04em] md:text-6xl">
            Your next favourite story is one tap away.
          </h2>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Magnetic>
              <Button size="lg" className="h-12 bg-accent px-7 text-on-accent hover:bg-accent-hover" asChild>
                <Link to="/" search={{ tab: "latest" }}>
                  Browse newest
                </Link>
              </Button>
            </Magnetic>
            <Magnetic>
              <Button
                size="lg"
                variant="outline"
                className="h-12 border-line-strong bg-transparent px-7 text-fg hover:border-fg hover:bg-fg/10"
                onClick={() => authDialog.open("signup")}
              >
                Create your account
              </Button>
            </Magnetic>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
