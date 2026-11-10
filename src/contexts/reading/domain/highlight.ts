import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { canonLang } from "./codeLang";

export type Span = { text: string; cls: string };

// each grammar is its own chunk: a page loads only the languages it shows
const load =
  <T>(f: () => Promise<T>, pick: (m: T) => unknown) =>
  async () =>
    pick(await f()) as StreamParser<unknown>;
const GRAMMARS: Record<string, () => Promise<StreamParser<unknown>>> = {
  javascript: load(
    () => import("@codemirror/legacy-modes/mode/javascript"),
    (m) => m.javascript,
  ),
  typescript: load(
    () => import("@codemirror/legacy-modes/mode/javascript"),
    (m) => m.typescript,
  ),
  json: load(
    () => import("@codemirror/legacy-modes/mode/javascript"),
    (m) => m.json,
  ),
  python: load(
    () => import("@codemirror/legacy-modes/mode/python"),
    (m) => m.python,
  ),
  go: load(
    () => import("@codemirror/legacy-modes/mode/go"),
    (m) => m.go,
  ),
  rust: load(
    () => import("@codemirror/legacy-modes/mode/rust"),
    (m) => m.rust,
  ),
  bash: load(
    () => import("@codemirror/legacy-modes/mode/shell"),
    (m) => m.shell,
  ),
  sql: load(
    () => import("@codemirror/legacy-modes/mode/sql"),
    (m) => m.standardSQL,
  ),
  yaml: load(
    () => import("@codemirror/legacy-modes/mode/yaml"),
    (m) => m.yaml,
  ),
  css: load(
    () => import("@codemirror/legacy-modes/mode/css"),
    (m) => m.css,
  ),
  xml: load(
    () => import("@codemirror/legacy-modes/mode/xml"),
    (m) => m.html,
  ),
  ruby: load(
    () => import("@codemirror/legacy-modes/mode/ruby"),
    (m) => m.ruby,
  ),
  swift: load(
    () => import("@codemirror/legacy-modes/mode/swift"),
    (m) => m.swift,
  ),
  toml: load(
    () => import("@codemirror/legacy-modes/mode/toml"),
    (m) => m.toml,
  ),
  dockerfile: load(
    () => import("@codemirror/legacy-modes/mode/dockerfile"),
    (m) => m.dockerFile,
  ),
  lua: load(
    () => import("@codemirror/legacy-modes/mode/lua"),
    (m) => m.lua,
  ),
  c: load(
    () => import("@codemirror/legacy-modes/mode/clike"),
    (m) => m.c,
  ),
  cpp: load(
    () => import("@codemirror/legacy-modes/mode/clike"),
    (m) => m.cpp,
  ),
  java: load(
    () => import("@codemirror/legacy-modes/mode/clike"),
    (m) => m.java,
  ),
  csharp: load(
    () => import("@codemirror/legacy-modes/mode/clike"),
    (m) => m.csharp,
  ),
  kotlin: load(
    () => import("@codemirror/legacy-modes/mode/clike"),
    (m) => m.kotlin,
  ),
  scala: load(
    () => import("@codemirror/legacy-modes/mode/clike"),
    (m) => m.scala,
  ),
  dart: load(
    () => import("@codemirror/legacy-modes/mode/clike"),
    (m) => m.dart,
  ),
};

/** Longer than this is shown as plain text: highlighting runs on the reader's main thread. */
export const HIGHLIGHT_MAX = 20_000;

/** Every language with a grammar. */
export const HIGHLIGHT_LANGS = Object.keys(GRAMMARS);

/** Whether a language has a grammar. */
export const canHighlight = (lang: string) => canonLang(lang) in GRAMMARS;

/** Pure: tokens of `code` split into classed runs (the runs joined are exactly `code`). */
export function spansOf(parser: StreamParser<unknown>, code: string): Span[] {
  const tree = StreamLanguage.define(parser).parser.parse(code);
  const out: Span[] = [];
  let at = 0;
  highlightTree(tree, classHighlighter, (from, to, cls) => {
    if (from > at) out.push({ text: code.slice(at, from), cls: "" });
    out.push({ text: code.slice(from, to), cls });
    at = to;
  });
  if (at < code.length) out.push({ text: code.slice(at), cls: "" });
  return out;
}

/** Highlighted runs for `code`, or null when the language is unknown, the code is too long, or the grammar fails to load. */
export async function highlight(code: string, lang: string): Promise<Span[] | null> {
  const g = GRAMMARS[canonLang(lang)];
  if (!g || code.length > HIGHLIGHT_MAX) return null;
  try {
    return spansOf(await g(), code);
  } catch {
    return null;
  }
}
