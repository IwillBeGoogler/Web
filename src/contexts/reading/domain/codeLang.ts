import { useSyncExternalStore } from "react";

const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  python3: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  golang: "go",
  "c++": "cpp",
  rs: "rust",
  yml: "yaml",
  cs: "csharp",
  kt: "kotlin",
  rb: "ruby",
  html: "xml",
  htm: "xml",
  postgres: "sql",
  postgresql: "sql",
  psql: "sql",
};

const LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  bash: "Bash",
  go: "Go",
  cpp: "C++",
  c: "C",
  csharp: "C#",
  java: "Java",
  kotlin: "Kotlin",
  scala: "Scala",
  rust: "Rust",
  yaml: "YAML",
  xml: "HTML",
  json: "JSON",
  sql: "SQL",
  css: "CSS",
  ruby: "Ruby",
  swift: "Swift",
  php: "PHP",
  toml: "TOML",
  dockerfile: "Dockerfile",
  lua: "Lua",
  dart: "Dart",
};

/** One id per language, whatever the author wrote after the fence (`js`, `JavaScript`, `ts`, `c++` ...). */
export function canonLang(raw: string): string {
  const k = raw.trim().toLowerCase();
  return ALIASES[k] ?? k;
}

/** The name a tab shows. */
export function langLabel(raw: string): string {
  const id = canonLang(raw);
  return LABELS[id] ?? (raw.trim() || "text");
}

/** The tab to open: the reader's last pick when the block has it, else the first. */
export function pickTab(langs: readonly string[], preferred: string): number {
  if (!preferred) return 0;
  const i = langs.findIndex((l) => canonLang(l) === preferred);
  return i < 0 ? 0 : i;
}

const KEY = "iwillbegoogler.codelang";
const listeners = new Set<() => void>();
let current = "";
try {
  current = canonLang(localStorage.getItem(KEY) ?? "");
} catch {}

/** The language the reader picked last; every code group on the page (and later pages) opens on it. */
export const codeLang = {
  get: () => current,
  set(lang: string) {
    current = canonLang(lang);
    try {
      localStorage.setItem(KEY, current);
    } catch {}
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

export const useCodeLang = () => useSyncExternalStore(codeLang.subscribe, codeLang.get, () => "");
