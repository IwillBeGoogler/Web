import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LayersIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  Redo2Icon,
  SquareCodeIcon,
  SquareMinusIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { type ReactNode, type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { engagementRepository } from "@/contexts/engagement/infrastructure/engagementRepository";
import { LIVE_STARTER } from "@/contexts/publishing/domain/insert";
import { type ImageResult, imageFiles, uploadImages } from "@/contexts/publishing/domain/uploadImages";
import { type MessageKey, useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";
import { toast } from "@/shared/ui/toast";
import { scanLive } from "./liveScan";
import { canRoundTrip, newCodeGroup, parseMarkdown, patchEditor, type RichProblem, richExtensions, sameRichDoc, serializeDoc } from "./markdown";
import { safeHref } from "./safeLink";
import { filterSlash, SLASH_ORDER, type SlashId, slashQuery } from "./slash";
import { DiagramNode, HtmlLiveNode } from "./views";

export type RichHandle = {
  /** Writes pending edits to `onChange` now. */
  flush: () => void;
  insertDiagram: (line: string) => void;
  insertLive: () => void;
  focus: () => void;
  /** The text currently selected in the document (empty when the selection is a caret). */
  getSelection: () => string;
};

type Props = {
  /** The Markdown in the form. */
  value: string;
  /** Bumped when the form was loaded or restored from outside: `value` is then new content, not an echo. */
  epoch: number;
  onChange: (md: string) => void;
  onDiagram: () => void;
  /**
   * Called with the reason when the Markdown written for the document does not read back as the same document, and with null when it does.
   * The best text is still passed to `onChange`, so nothing typed is lost; the owner decides what may be sent to the server meanwhile.
   */
  onLossy?: (why: RichProblem | null) => void;
  ref?: Ref<RichHandle>;
};

const SERIALIZE_MS = 250;
const keys = (k: string) => `Control+${k} Meta+${k}`;

const LANGS = [
  "",
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "dart",
  "dockerfile",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "sql",
  "swift",
  "toml",
  "typescript",
  "yaml",
];

/** The languages a new tab of a group tries first, in this order. */
const GROUP_LANGS = ["javascript", "python", "go", "java", "typescript", "rust", "bash", "csharp"];

/**
 * Starts a code group at the selected code block (or adds a tab to its group): a new empty block of the same group follows it,
 * in the first language of GROUP_LANGS the group does not have yet.
 */
function addGroupTab(ed: Editor) {
  const { $from } = ed.state.selection;
  if ($from.parent.type.name !== "codeBlock") return;
  const group = ($from.parent.attrs.group as string | null) ?? newCodeGroup();
  const used = new Set<string>();
  ed.state.doc.forEach((n) => {
    if (n.type.name === "codeBlock" && n.attrs.group === group) used.add(String(n.attrs.language ?? ""));
  });
  const language = GROUP_LANGS.find((l) => !used.has(l)) ?? "";
  const before = $from.before();
  const after = $from.after();
  ed.chain()
    .focus()
    .command(({ tr }) => {
      tr.setNodeMarkup(before, undefined, { ...$from.parent.attrs, group });
      return true;
    })
    .insertContentAt(after, { type: "codeBlock", attrs: { language, group } })
    .run();
}

function Tb({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active === undefined ? undefined : active}
      aria-keyshortcuts={shortcut ? keys(shortcut.replace(/^Ctrl\/Cmd\+/, "")) : undefined}
      disabled={disabled}
      className="rich-tb"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const slashLabels = (t: (k: MessageKey) => string): Record<SlashId, string> =>
  Object.fromEntries(SLASH_ORDER.map((id) => [id, t(`rich.slash.${id}` as MessageKey)])) as Record<SlashId, string>;

function liveStarter(): { code: string; height: number | null } {
  const b = scanLive(LIVE_STARTER)[0];
  return { code: b?.code ?? "", height: b?.height ?? null };
}

const toolbarState = (editor: Editor) => ({
  bold: editor.isActive("bold"),
  italic: editor.isActive("italic"),
  code: editor.isActive("code"),
  link: editor.isActive("link"),
  h2: editor.isActive("heading", { level: 2 }),
  h3: editor.isActive("heading", { level: 3 }),
  ul: editor.isActive("bulletList"),
  ol: editor.isActive("orderedList"),
  quote: editor.isActive("blockquote"),
  codeBlock: editor.isActive("codeBlock"),
  language: (editor.getAttributes("codeBlock").language as string | null) ?? "",
  grouped: Boolean(editor.getAttributes("codeBlock").group),
  canUndo: editor.can().undo(),
  canRedo: editor.can().redo(),
});

export default function RichEditor({ value, epoch, onChange, onDiagram, onLossy, ref }: Props) {
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const diagramRef = useRef(onDiagram);
  diagramRef.current = onDiagram;
  const lossyRef = useRef(onLossy);
  lossyRef.current = onLossy;

  const book = useRef({
    base: value,
    baseDoc: null as JSONContent | null,
    last: value,
    recent: new Set<string>([value]),
    epoch,
    timer: 0 as unknown as ReturnType<typeof setTimeout>,
    why: null as RichProblem | null,
  });
  const [link, setLink] = useState<{ href: string; error: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [slashUi, setSlashUi] = useState<{ items: SlashId[]; x: number; y: number } | null>(null);
  const slash = useRef({ items: [] as SlashId[], index: 0, open: false, dismissed: false });
  const [slashIndex, setSlashIndex] = useState(0);
  const editorRef = useRef<Editor | null>(null);

  Object.fromEntries(SLASH_ORDER.map((id) => [id, tRef.current(`rich.slash.${id}` as MessageKey)])) as Record<SlashId, string>;

  /** Serializes the document and hands it to the form, unless it is still what was loaded (then the loaded text, byte for byte, stays). */
  const flush = useCallback(() => {
    const b = book.current;
    clearTimeout(b.timer);
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    const doc = ed.getJSON();
    let target: string;
    let why: RichProblem | null = null;
    if (b.baseDoc && sameRichDoc(doc, b.baseDoc)) target = b.base;
    else {
      target = serializeDoc(doc);
      // text that reads back as something else is still handed over (nothing typed is lost), with the reason
      if (!sameRichDoc(parseMarkdown(target), doc)) {
        const r = canRoundTrip(target);
        why = r.ok ? "changes" : r.problem;
      }
    }
    if (why !== b.why) {
      b.why = why;
      lossyRef.current?.(why);
    }
    if (target === b.last) return;
    b.last = target;
    b.recent.add(target);
    if (b.recent.size > 50) b.recent = new Set([target]);
    changeRef.current(target);
  }, []);

  const updateSlash = useCallback(() => {
    const ed = editorRef.current;
    const s = slash.current;
    const close = () => {
      s.open = false;
      s.dismissed = false;
      setSlashUi(null);
    };
    if (!ed || ed.isDestroyed) return;
    const { selection } = ed.state;
    const parent = selection.$from.parent;
    const q = selection.empty && parent.type.name === "paragraph" ? slashQuery(parent.textContent) : null;
    if (q === null) return close();
    if (s.dismissed) return;
    const items = filterSlash(slashLabels(tRef.current), q);
    s.items = items;
    s.index = Math.min(s.index, Math.max(items.length - 1, 0));
    setSlashIndex(s.index);
    s.open = true;
    const c = ed.view.coordsAtPos(selection.from);
    setSlashUi({ items, x: c.left, y: c.bottom });
  }, []);

  const addImages = useCallback((files: File[]) => {
    const ed = editorRef.current;
    if (!ed) return;
    const tt = tRef.current;
    void uploadImages(files, engagementRepository.upload, {
      place: (id, _ph, file) => {
        ed.chain()
          .focus()
          .insertContent({ type: "uploadPlaceholder", attrs: { id, name: file.name || "image" } })
          .run();
      },
      settle: (id, md) => {
        let at = -1;
        ed.state.doc.descendants((n, pos) => {
          if (at < 0 && n.type.name === "uploadPlaceholder" && n.attrs.id === id) at = pos;
          return at < 0;
        });
        if (at < 0) return;
        const m = md ? /^!\[([^\]]*)\]\((.*)\)$/.exec(md) : null;
        const image = ed.schema.nodes.image;
        const tr = ed.state.tr;
        if (m && image) tr.replaceWith(at, at + 1, image.create({ src: m[2], alt: m[1] }));
        else tr.delete(at, at + 1);
        ed.view.dispatch(tr);
      },
    }).then((results) => {
      const names = (p: ImageResult["problem"]) =>
        results
          .filter((r) => r.problem === p)
          .map((r) => r.file.name || "image")
          .join(", ");
      if (names("type")) toast.error(tt("editor.img.type", { names: names("type") }));
      if (names("size")) toast.error(tt("editor.img.size", { names: names("size") }));
      if (names("failed")) toast.error(tt("editor.img.failed", { names: names("failed") }));
    });
  }, []);

  const insertLive = useCallback(() => {
    const s = liveStarter();
    editorRef.current
      ?.chain()
      .focus()
      .insertContent({ type: "htmlLive", attrs: { code: s.code, height: s.height, fence: "```" } })
      .run();
  }, []);

  const runSlash = useCallback(
    (id: SlashId) => {
      const ed = editorRef.current;
      if (!ed) return;
      const { $from } = ed.state.selection;
      const c = ed.chain().focus().deleteRange({ from: $from.start(), to: $from.end() });
      slash.current.open = false;
      setSlashUi(null);
      switch (id) {
        case "h2":
          return void c.setNode("heading", { level: 2 }).run();
        case "h3":
          return void c.setNode("heading", { level: 3 }).run();
        case "ul":
          return void c.toggleBulletList().run();
        case "ol":
          return void c.toggleOrderedList().run();
        case "quote":
          return void c.toggleBlockquote().run();
        case "code":
          return void c.setCodeBlock().run();
        case "codegroup": {
          const group = newCodeGroup();
          return void c
            .insertContent([
              { type: "codeBlock", attrs: { language: "javascript", group } },
              { type: "codeBlock", attrs: { language: "python", group } },
            ])
            .run();
        }
        case "hr":
          return void c.setHorizontalRule().run();
        case "image":
          c.run();
          return void fileInput.current?.click();
        case "diagram":
          c.run();
          return diagramRef.current();
        case "live":
          c.run();
          return insertLive();
      }
    },
    [insertLive],
  );
  const runSlashRef = useRef(runSlash);
  runSlashRef.current = runSlash;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the placeholder text is read once
  const extensions = useMemo(() => richExtensions({ placeholder: t("rich.placeholder"), htmlLive: HtmlLiveNode, diagramEmbed: DiagramNode }), []);

  const openLink = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    setLink({ href: (ed.getAttributes("link").href as string | undefined) ?? "", error: false });
  }, []);
  const openLinkRef = useRef(openLink);
  openLinkRef.current = openLink;

  const editor = useEditor({
    extensions,
    content: value,
    contentType: "markdown",
    editorProps: {
      // the caret scrolls into view below the page's sticky header, not under it
      scrollMargin: { top: 104, bottom: 24, left: 0, right: 0 },
      scrollThreshold: { top: 104, bottom: 24, left: 0, right: 0 },
      attributes: { class: "prose-article rich-body", role: "textbox", "aria-multiline": "true", "aria-label": t("rich.body"), spellcheck: "true" },
      handleKeyDown: (_view, e) => {
        const s = slash.current;
        if (s.open) {
          if (e.key === "Escape") {
            s.dismissed = true;
            s.open = false;
            setSlashUi(null);
            return true;
          }
          if (s.items.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            s.index = (s.index + (e.key === "ArrowDown" ? 1 : s.items.length - 1)) % s.items.length;
            setSlashIndex(s.index);
            return true;
          }
          if ((e.key === "Enter" || e.key === "Tab") && s.items.length) {
            runSlashRef.current(s.items[s.index] as SlashId);
            return true;
          }
        }
        if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
          e.preventDefault();
          openLinkRef.current();
          return true;
        }
        return false;
      },
      handlePaste: (_view, e) => {
        const files = imageFiles(e.clipboardData?.files);
        if (!files.length) return false;
        e.preventDefault();
        addImages(files);
        return true;
      },
      handleDrop: (view, e) => {
        const files = imageFiles(e.dataTransfer?.files);
        if (!files.length) return false;
        e.preventDefault();
        const pos = view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (pos) editorRef.current?.commands.setTextSelection(pos.pos);
        addImages(files);
        return true;
      },
    },
    onBeforeCreate: ({ editor: ed }) => {
      patchEditor(ed);
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
      book.current.baseDoc = ed.getJSON();
    },
    onUpdate: () => {
      clearTimeout(book.current.timer);
      book.current.timer = setTimeout(flush, SERIALIZE_MS);
      updateSlash();
    },
    onSelectionUpdate: updateSlash,
    onDestroy: () => {
      clearTimeout(book.current.timer);
    },
  });
  editorRef.current = editor;

  // content from outside: a load, a restore, a revision. Not the value this editor just wrote (that would reset the caret).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const b = book.current;
    const fresh = epoch !== b.epoch;
    if (!fresh && (value === b.last || b.recent.has(value))) return;
    clearTimeout(b.timer);
    b.epoch = epoch;
    b.base = value;
    b.last = value;
    b.recent = new Set([value]);
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    b.baseDoc = editor.getJSON();
    if (b.why) {
      b.why = null;
      lossyRef.current?.(null);
    }
  }, [value, epoch, editor]);

  useImperativeHandle(
    ref,
    () => ({
      flush,
      focus: () => editorRef.current?.commands.focus(),
      insertLive,
      getSelection: () => {
        const ed = editorRef.current;
        if (!ed) return "";
        const { from, to } = ed.state.selection;
        return from === to ? "" : ed.state.doc.textBetween(from, to, " ");
      },
      insertDiagram: (line: string) => {
        editorRef.current?.chain().focus().insertContent({ type: "diagramEmbed", attrs: { line } }).run();
      },
    }),
    [flush, insertLive],
  );

  const st = useEditorState({ editor, selector: ({ editor: ed }) => (ed ? toolbarState(ed) : null) });

  if (!editor) return <p className="mt-6 text-muted">{t("rich.loading")}</p>;
  const chain = () => editor.chain().focus();
  const applyLink = (raw: string) => {
    const href = safeHref(raw);
    if (!href) return setLink({ href: raw, error: true });
    if (editor.state.selection.empty && !editor.isActive("link"))
      chain()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .run();
    else chain().extendMarkRange("link").setLink({ href }).run();
    setLink(null);
    editor.view.focus(); // now, not on the next frame: the address field is going away and typing continues in the text
  };

  const onToolbarKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select"));
    const i = btns.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length]?.focus();
  };

  return (
    <div className="rich-wrap">
      <div className="rich-toolbar-wrap">
        <div role="toolbar" aria-label={t("rich.tb.label")} aria-orientation="horizontal" className="rich-toolbar" onKeyDown={onToolbarKey}>
          <Tb label={t("rich.h2")} active={st?.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
            <Heading2Icon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.h3")} active={st?.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
            <Heading3Icon className="size-4" aria-hidden />
          </Tb>
          <span className="rich-sep" aria-hidden />
          <Tb label={t("rich.bold")} shortcut="Ctrl/Cmd+B" active={st?.bold} onClick={() => chain().toggleBold().run()}>
            <BoldIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.italic")} shortcut="Ctrl/Cmd+I" active={st?.italic} onClick={() => chain().toggleItalic().run()}>
            <ItalicIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.code")} active={st?.code} onClick={() => chain().toggleCode().run()}>
            <CodeIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.link")} shortcut="Ctrl/Cmd+K" active={st?.link} onClick={openLink}>
            <LinkIcon className="size-4" aria-hidden />
          </Tb>
          <span className="rich-sep" aria-hidden />
          <Tb label={t("rich.ul")} active={st?.ul} onClick={() => chain().toggleBulletList().run()}>
            <ListIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.ol")} active={st?.ol} onClick={() => chain().toggleOrderedList().run()}>
            <ListOrderedIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.quote")} active={st?.quote} onClick={() => chain().toggleBlockquote().run()}>
            <QuoteIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.codeblock")} active={st?.codeBlock} onClick={() => chain().toggleCodeBlock().run()}>
            <SquareCodeIcon className="size-4" aria-hidden />
          </Tb>
          {st?.codeBlock ? (
            <select
              aria-label={t("rich.lang")}
              className="rich-lang"
              value={LANGS.includes(st.language) ? st.language : "__other"}
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("codeBlock", { language: e.target.value || null })
                  .run()
              }
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {l || t("rich.lang.plain")}
                </option>
              ))}
              {LANGS.includes(st.language) ? null : <option value="__other">{st.language}</option>}
            </select>
          ) : null}
          {st?.codeBlock ? (
            <Tb label={t(st.grouped ? "rich.codegroup.add" : "rich.slash.codegroup")} onClick={() => addGroupTab(editor)}>
              <LayersIcon className="size-4" aria-hidden />
            </Tb>
          ) : null}
          {st?.codeBlock && st.grouped ? (
            <Tb label={t("rich.codegroup.out")} onClick={() => chain().updateAttributes("codeBlock", { group: null }).run()}>
              <SquareMinusIcon className="size-4" aria-hidden />
            </Tb>
          ) : null}
          <Tb label={t("rich.hr")} onClick={() => chain().setHorizontalRule().run()}>
            <MinusIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.image")} onClick={() => fileInput.current?.click()}>
            <ImageIcon className="size-4" aria-hidden />
          </Tb>
          <span className="rich-sep" aria-hidden />
          <Tb label={t("rich.undo")} shortcut="Ctrl/Cmd+Z" disabled={!st?.canUndo} onClick={() => chain().undo().run()}>
            <Undo2Icon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.redo")} shortcut="Ctrl/Cmd+Shift+Z" disabled={!st?.canRedo} onClick={() => chain().redo().run()}>
            <Redo2Icon className="size-4" aria-hidden />
          </Tb>
        </div>
        {link ? (
          <form
            className="rich-linkbar"
            onSubmit={(e) => {
              e.preventDefault();
              applyLink(link.href);
            }}
          >
            <input
              autoFocus
              type="text"
              inputMode="url"
              aria-label={t("rich.link.addr")}
              aria-invalid={link.error || undefined}
              aria-describedby={link.error ? "rich-link-err" : undefined}
              placeholder="https://"
              value={link.href}
              className="min-w-0 flex-1 bg-transparent px-2 py-1 outline-none"
              onChange={(e) => setLink({ href: e.target.value, error: false })}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setLink(null);
                  editor.commands.focus();
                }
              }}
            />
            <button type="submit" className="rich-linkbtn">
              {t("rich.link.apply")}
            </button>
            {st?.link ? (
              <button
                type="button"
                className="rich-linkbtn"
                onClick={() => {
                  chain().extendMarkRange("link").unsetLink().run();
                  setLink(null);
                }}
              >
                {t("rich.link.remove")}
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t("rich.link.close")}
              className="rich-tb"
              onClick={() => {
                setLink(null);
                editor.commands.focus();
              }}
            >
              <XIcon className="size-4" aria-hidden />
            </button>
            {link.error ? (
              <p id="rich-link-err" role="alert" className="basis-full px-2 pb-1 text-[12px] text-danger">
                {t("rich.link.bad")}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>

      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        shouldShow={({ editor: ed, state }) =>
          ed.isEditable && !state.selection.empty && !(state.selection instanceof NodeSelection) && !ed.isActive("codeBlock") && !ed.isActive("htmlLive")
        }
      >
        <div role="toolbar" aria-label={t("rich.tb.label")} className="rich-bubble">
          <Tb label={t("rich.bold")} shortcut="Ctrl/Cmd+B" active={st?.bold} onClick={() => chain().toggleBold().run()}>
            <BoldIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.italic")} shortcut="Ctrl/Cmd+I" active={st?.italic} onClick={() => chain().toggleItalic().run()}>
            <ItalicIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.code")} active={st?.code} onClick={() => chain().toggleCode().run()}>
            <CodeIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.link")} shortcut="Ctrl/Cmd+K" active={st?.link} onClick={openLink}>
            <LinkIcon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.h2")} active={st?.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
            <Heading2Icon className="size-4" aria-hidden />
          </Tb>
          <Tb label={t("rich.quote")} active={st?.quote} onClick={() => chain().toggleBlockquote().run()}>
            <QuoteIcon className="size-4" aria-hidden />
          </Tb>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} className="rich-content" />

      {slashUi ? (
        <div
          role="listbox"
          aria-label={t("rich.slash.label")}
          id="rich-slash"
          className="rich-slash"
          style={{ left: Math.max(8, Math.min(slashUi.x, (typeof window === "undefined" ? 1000 : window.innerWidth) - 248)), top: slashUi.y + 6 }}
        >
          {slashUi.items.length ? (
            slashUi.items.map((id, i) => (
              <div
                key={id}
                id={`rich-slash-${id}`}
                role="option"
                tabIndex={-1}
                aria-selected={i === slashIndex}
                className={cn("rich-slash-item", i === slashIndex && "is-active")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  runSlash(id);
                }}
                onKeyDown={() => {}}
              >
                {t(`rich.slash.${id}` as MessageKey)}
              </div>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-muted">{t("rich.slash.empty")}</p>
          )}
        </div>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label={t("rich.image")}
        onChange={(e) => {
          const files = imageFiles(e.target.files);
          e.target.value = "";
          if (files.length) addImages(files);
        }}
      />
    </div>
  );
}
