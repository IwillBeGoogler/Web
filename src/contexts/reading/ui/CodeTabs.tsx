import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/shared/i18n";
import type { CodeItem } from "../domain/codeBlocks";
import { codeLang, langLabel, pickTab, useCodeLang } from "../domain/codeLang";
import { highlight, type Span } from "../domain/highlight";

/** Highlighted source: runs of the code, classed by token. Plain text until (or unless) the grammar loads. */
function Source({ code, lang }: CodeItem) {
  const [spans, setSpans] = useState<{ code: string; lang: string; runs: Span[] } | null>(null);
  useEffect(() => {
    let live = true;
    void highlight(code, lang).then((runs) => live && runs && setSpans({ code, lang, runs }));
    return () => {
      live = false;
    };
  }, [code, lang]);
  const runs = spans && spans.code === code && spans.lang === lang ? spans.runs : null;
  return (
    <code>
      {runs
        ? runs.map((r, i) =>
            r.cls ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional and never reorder
              <span key={i} className={r.cls}>
                {r.text}
              </span>
            ) : (
              r.text
            ),
          )
        : code}
    </code>
  );
}

function CopyButton({ code }: { code: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="code-view-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(
          () => {
            setDone(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setDone(false), 1500);
          },
          () => {},
        );
      }}
    >
      {done ? t("code.copied") : t("code.copy")}
    </button>
  );
}

/**
 * A code block of a story. Several items are language tabs: the reader's pick is shared by every group on the page and kept for
 * the next visit. One item is a plain block with a language label and a copy button.
 */
export function CodeTabs({ items }: { items: CodeItem[] }) {
  const t = useT();
  const id = useId();
  const pref = useCodeLang();
  const idx = pickTab(
    items.map((i) => i.lang),
    pref,
  );
  const cur = items[idx] ?? items[0];
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!cur) return null;
  const many = items.length > 1;
  const panel = many ? { role: "tabpanel", "aria-labelledby": `${id}-t${idx}` } : {};
  const go = (to: number) => {
    const n = (to + items.length) % items.length;
    codeLang.set(items[n]?.lang ?? "");
    tabs.current[n]?.focus();
  };
  return (
    <div className="code-view">
      <div className="code-view-bar">
        {many ? (
          <div role="tablist" aria-label={t("code.langs")} className="code-view-tabs">
            {items.map((it, i) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: the tabs are fixed by the article
                key={i}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-t${i}`}
                aria-selected={i === idx}
                aria-controls={`${id}-p`}
                tabIndex={i === idx ? 0 : -1}
                onClick={() => codeLang.set(it.lang)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") go(i + 1);
                  else if (e.key === "ArrowLeft") go(i - 1);
                  else if (e.key === "Home") go(0);
                  else if (e.key === "End") go(items.length - 1);
                  else return;
                  e.preventDefault();
                }}
              >
                {langLabel(it.lang)}
              </button>
            ))}
          </div>
        ) : (
          <span className="code-view-lang">{langLabel(cur.lang)}</span>
        )}
        <CopyButton code={cur.code} />
      </div>
      <div id={`${id}-p`} {...panel}>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable code block must be reachable by keyboard */}
        <pre tabIndex={0}>
          <Source code={cur.code} lang={cur.lang} />
        </pre>
      </div>
    </div>
  );
}
