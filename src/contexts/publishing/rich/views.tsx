import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { ShapesIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HtmlBlock } from "@/contexts/reading/ui/HtmlBlock";
import { useT } from "@/shared/i18n";
import { DiagramEmbed, HtmlLive } from "./nodes";

const inputs = (e: { event: Event }) =>
  e.event.target instanceof HTMLElement && ["TEXTAREA", "INPUT", "BUTTON", "A", "SELECT"].includes(e.event.target.tagName);

/** The source of a live block is edited in a plain textarea; the preview is the reader's own HtmlBlock, a sandboxed frame outside this editor's DOM. */
function HtmlLiveView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const t = useT();
  const attrs = node.attrs as { code: string; height: number | null };
  const [code, setCode] = useState(attrs.code);
  const sent = useRef(attrs.code);
  const [shown, setShown] = useState({ code: attrs.code, height: attrs.height ?? 400, n: 0 });
  // the block changed from outside (undo, redo, paste): follow it
  useEffect(() => {
    if (attrs.code !== sent.current) {
      sent.current = attrs.code;
      setCode(attrs.code);
    }
  }, [attrs.code]);
  // the frame is rebuilt only after the author pauses
  useEffect(() => {
    const id = setTimeout(() => setShown((s) => ({ code: attrs.code, height: attrs.height ?? 400, n: s.n + 1 })), 500);
    return () => clearTimeout(id);
  }, [attrs.code, attrs.height]);
  return (
    <NodeViewWrapper className="rich-card" data-selected={selected || undefined} contentEditable={false}>
      <div className="rich-card-head">
        <SparklesIcon className="size-3.5" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t("rich.live.label")}</span>
        <label className="flex items-center gap-1.5">
          {t("rich.live.height")}
          <input
            type="number"
            min={100}
            max={1000}
            step={10}
            placeholder="400"
            className="h-7 w-20 rounded-[var(--radius-xs)] border border-line-strong bg-transparent px-1.5 text-right"
            value={attrs.height ?? ""}
            onChange={(e) => {
              const n = Math.trunc(Number(e.target.value));
              updateAttributes({ height: e.target.value === "" || !Number.isFinite(n) || n < 1 ? null : Math.min(n, 99999) });
            }}
          />
        </label>
        <button type="button" aria-label={t("rich.live.remove")} title={t("rich.live.remove")} className="rich-card-btn" onClick={() => deleteNode()}>
          <Trash2Icon className="size-3.5" aria-hidden />
        </button>
      </div>
      <textarea
        aria-label={t("rich.live.code")}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="rich-live-code"
        rows={Math.min(24, Math.max(6, code.split("\n").length + 1))}
        value={code}
        onChange={(e) => {
          sent.current = e.target.value;
          setCode(e.target.value);
          updateAttributes({ code: e.target.value });
        }}
      />
      <div className="px-3 pb-1">
        <HtmlBlock key={shown.n} html={shown.code} height={shown.height} />
      </div>
    </NodeViewWrapper>
  );
}

/** `::diagram{slug=x}` / `file=x` → the reference worth showing. */
export function diagramRef(line: string): { kind: "slug" | "file"; value: string } | null {
  const m = /(slug|file)=("[^"]*"|[^\s}]+)/.exec(line);
  return m ? { kind: m[1] as "slug" | "file", value: (m[2] as string).replace(/^"|"$/g, "") } : null;
}

function DiagramView({ node, deleteNode, selected }: NodeViewProps) {
  const t = useT();
  const line = String(node.attrs.line);
  const ref = diagramRef(line);
  return (
    <NodeViewWrapper className="rich-card" data-selected={selected || undefined} contentEditable={false} role="group" aria-label={t("rich.diagram.card")}>
      <div className="rich-card-head">
        <ShapesIcon className="size-3.5" aria-hidden />
        <span className="font-bold">{t("rich.diagram.card")}</span>
        <code className="min-w-0 flex-1 truncate text-muted">{ref?.value ?? line}</code>
        {ref?.kind === "slug" && /^[A-Za-z0-9_-]+$/.test(ref.value) ? (
          <a href={`/d/v/${ref.value}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {t("rich.diagram.open")}
          </a>
        ) : null}
        <button type="button" aria-label={t("rich.diagram.remove")} title={t("rich.diagram.remove")} className="rich-card-btn" onClick={() => deleteNode()}>
          <Trash2Icon className="size-3.5" aria-hidden />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export const HtmlLiveNode = HtmlLive.extend({
  addNodeView() {
    return ReactNodeViewRenderer(HtmlLiveView, { stopEvent: inputs });
  },
});

export const DiagramNode = DiagramEmbed.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DiagramView, { stopEvent: inputs });
  },
});
