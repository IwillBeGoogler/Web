import { useNavigate } from "@tanstack/react-router";
import { SearchIcon, SearchXIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { publicDiagramsQuery } from "@/contexts/diagrams/application/hooks";
import { DiagramList } from "@/contexts/diagrams/ui/DiagramList";
import { Feed } from "@/contexts/reading/ui/Feed";
import { useT } from "@/shared/i18n";
import { Lens } from "@/shared/ui/modal";
import { HomeGrid } from "./HomePage";

export function SearchPage({ q }: { q: string }) {
  const nav = useNavigate();
  const t = useT();
  const [section, setSection] = useState<"stories" | "diagrams">("stories");
  const [v, setV] = useState(q);
  // keep the field in sync when q changes from the header search or history
  useEffect(() => setV(q), [q]);
  return (
    <HomeGrid>
      <form
        role="search"
        aria-label="Search stories"
        className="liquid-glass flex h-14 items-center gap-3 rounded-[var(--radius-lg)] px-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
        onSubmit={(e) => {
          e.preventDefault();
          void nav({ to: "/search", search: { q: v.trim() } });
        }}
      >
        <SearchIcon className="size-5 shrink-0 text-muted" aria-hidden />
        <input
          type="search"
          value={v}
          onChange={(e) => setV(e.target.value)}
          aria-label="Search"
          placeholder="Search IWillBeGoogler"
          className="w-full min-w-0 bg-transparent text-[17px] text-fg outline-none placeholder:text-muted"
          autoFocus
        />
        <button
          type="submit"
          className="h-9 shrink-0 cursor-pointer rounded-[var(--radius-sm)] bg-inverse px-3 font-mono text-[11px] text-on-inverse uppercase tracking-[0.08em]"
        >
          Search
        </button>
      </form>
      {q ? (
        <>
          <h1 className="mt-6 font-display text-[32px] leading-tight font-bold tracking-tight md:text-[42px]">
            <span className="text-muted">Results for </span>
            {q}
          </h1>
          <Lens
            label="Search section"
            className="mt-6"
            value={section}
            onChange={setSection}
            items={[
              ["stories", t("dg.search.stories")],
              ["diagrams", t("dg.search.section")],
            ]}
          />
          {section === "stories" ? (
            <Feed
              key={q}
              source={{ kind: "search", q }}
              empty={{ icon: SearchXIcon, title: "No stories found.", body: "Make sure all words are spelled correctly." }}
            />
          ) : (
            <div className="mt-3">
              <DiagramList key={q} query={publicDiagramsQuery({ q })} byline empty={{ icon: SearchXIcon, title: t("dg.search.empty") }} />
            </div>
          )}
        </>
      ) : (
        <p className="py-20 text-center text-muted">Search stories by title or text.</p>
      )}
    </HomeGrid>
  );
}
