import { type Ref, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { extractCode } from "../domain/codeBlocks";
import { extractLive } from "../domain/liveBlocks";
import { CodeTabs } from "./CodeTabs";
import { HtmlBlock } from "./HtmlBlock";

/**
 * Sanitized article HTML. Live HTML blocks (`pre > code.language-html-live-N`, which the server emits as escaped text)
 * are swapped for `HtmlBlock` sandboxed frames; their source never reaches this page's DOM. Code blocks (and `group=` language groups)
 * become `CodeTabs`: highlighted, with a copy button and shared language tabs.
 */
export function ArticleBody({ html, bodyRef }: { html: string; bodyRef?: Ref<HTMLDivElement> }) {
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
