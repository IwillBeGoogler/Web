import { type Ref, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { extractCode } from "../domain/codeBlocks";
import { clearTerms, markTerms, type Term } from "../domain/glossary";
import { extractLive } from "../domain/liveBlocks";
import { CodeTabs } from "./CodeTabs";
import { HtmlBlock } from "./HtmlBlock";
import { TermTooltip } from "./TermTooltip";

/**
 * Sanitized article HTML. Live HTML blocks (`pre > code.language-html-live-N`, which the server emits as escaped text)
 * are swapped for `HtmlBlock` sandboxed frames; their source never reaches this page's DOM. Code blocks (and `group=` language groups)
 * become `CodeTabs`: highlighted, with a copy button and shared language tabs.
 * `terms` (the article's glossary merged with the site's) get their first mention underlined, with a tooltip.
 * The HTML string is left as it is: the marking happens on the DOM, outside the live and code hosts.
 */
export function ArticleBody({ html, bodyRef, terms }: { html: string; bodyRef?: Ref<HTMLDivElement>; terms?: readonly Term[] | undefined }) {
  const tipId = `glossary-tip-${useId().replace(/:/g, "")}`;
  const {
    html: markup,
    blocks,
    codes,
  } = useMemo(() => {
    const live = extractLive(html);
    const code = extractCode(live.html);
    return { html: code.html, blocks: live.blocks, codes: code.hosts };
  }, [html]);
  const el = useRef<HTMLDivElement | null>(null);
  const [hosts, setHosts] = useState<(Element | null)[]>([]);
  const [codeHosts, setCodeHosts] = useState<(Element | null)[]>([]);
  // the host divs exist only after the markup is in the DOM
  // biome-ignore lint/correctness/useExhaustiveDependencies: markup is what replaces the hosts
  useLayoutEffect(() => {
    setHosts(blocks.map((_, i) => el.current?.querySelector(`[data-live="${i}"]`) ?? null));
    setCodeHosts(codes.map((_, i) => el.current?.querySelector(`[data-code="${i}"]`) ?? null));
  }, [markup, blocks, codes]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: markup is what replaces the text nodes being marked
  useLayoutEffect(() => {
    const root = el.current;
    if (!root || !terms?.length) return;
    markTerms(root, terms, tipId);
    return () => clearTerms(root);
  }, [markup, terms, tipId]);
  return (
    <>
      <div
        ref={(node) => {
          el.current = node;
          if (typeof bodyRef === "function") bodyRef(node);
          else if (bodyRef) bodyRef.current = node;
        }}
        className="prose-article mt-10"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized with DOMPurify; live blocks are replaced by empty hosts
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      {terms?.length ? <TermTooltip container={el} terms={terms} tipId={tipId} /> : null}
      {hosts.map((host, i) => {
        const b = blocks[i];
        return host && b ? createPortal(<HtmlBlock html={b.code} height={b.height} />, host, `${markup.length}-${i}`) : null;
      })}
      {codeHosts.map((host, i) => {
        const items = codes[i];
        return host && items ? createPortal(<CodeTabs items={items} />, host, `${markup.length}-c${i}`) : null;
      })}
    </>
  );
}
