import { useHead } from "@/shared/head";
import { certificates, education, jobs, profile, projects, skills } from "./about-me/content";

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

export function AboutMePage() {
  useHead({ title: `${profile.name} — ${profile.role}`, description: profile.summary.slice(0, 160) });
  return (
    <main id="main" className="mx-auto my-8 max-w-[960px] rounded-[28px] border border-line bg-surface-2/85 px-6 py-12 shadow-2xl backdrop-blur-xl md:px-12">
      <p className="kicker">About me</p>
      <h1 className="mt-3 font-display text-5xl leading-tight font-bold">{profile.name}</h1>
      <p className="mt-2 font-mono text-sm tracking-[0.12em] text-muted uppercase">
        {profile.role} · {profile.location}
      </p>
      <p className="mt-6 font-serif text-lg leading-8">{profile.summary}</p>
      <nav aria-label="Profiles" className="mt-6 flex flex-wrap gap-2">
        {profile.links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            {...ext}
            className="rounded-full border border-line px-4 py-1.5 font-mono text-xs tracking-[0.12em] uppercase hover:bg-surface-2"
          >
            {l.label}
          </a>
        ))}
      </nav>

      <ul aria-label="Focus areas" className="mt-10 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {profile.focus.map((f) => (
          <li key={f.title} className="rounded-2xl border border-line bg-surface-2/85 p-4 shadow-lg backdrop-blur-xl">
            <h2 className="font-display text-lg leading-tight font-bold">{f.title}</h2>
            <p className="mt-2 text-sm leading-6 opacity-85">{f.text}</p>
          </li>
        ))}
      </ul>

      <section className="mt-14">
        <h2 className="text-2xl font-bold">Open source</h2>
        <p className="mt-2 text-sm text-muted">
          Go libraries and tools I build and maintain.{" "}
          <a href={profile.github} {...ext} className="underline">
            All repositories
          </a>
        </p>
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <li key={p.name}>
              <a href={`${profile.github}/${p.name}`} {...ext} className="block h-full rounded-2xl border border-line bg-surface-2/85 p-4 shadow-lg backdrop-blur-xl transition-colors hover:bg-surface-2">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-mono font-bold">{p.name}</span>
                  <span className="font-mono text-xs text-muted">{p.version}</span>
                </span>
                <span className="mt-2 block text-sm leading-6">{p.blurb}</span>
                <span className="mt-3 flex gap-2">
                  {p.tags.map((t) => (
                    <span key={t} className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted">
                      {t}
                    </span>
                  ))}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold">Experience</h2>
        <ol className="mt-5 space-y-8 border-l border-line pl-6">
          {jobs.map((j) => (
            <li key={j.company}>
              <h3 className="text-lg font-bold">
                {j.company} <span className="font-normal text-muted">— {j.domain}</span>
              </h3>
              <p className="font-mono text-xs tracking-[0.08em] text-muted uppercase">
                {j.role} · {j.period}
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-7">
                {j.points.map((pt) => (
                  <li key={pt.slice(0, 40)}>{pt}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold">Skills</h2>
        <div className="mt-5 space-y-4">
          {skills.map((g) => (
            <div key={g.group}>
              <h3 className="text-sm font-bold text-muted">{g.group}</h3>
              <p className="mt-2 flex flex-wrap gap-2">
                {g.items.map((i) => (
                  <span key={i} className="rounded-full border border-line px-3 py-1 text-sm">
                    {i}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold">Education</h2>
        <p className="mt-3 leading-7">{education}</p>
        <ul className="mt-2 text-sm text-muted">
          {certificates.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
