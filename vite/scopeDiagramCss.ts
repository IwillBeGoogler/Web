import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import postcss, { type Rule } from "postcss";
import type { Plugin } from "vite";

/**
 * The diagram editor ships ordinary global CSS (`html, body`, `*`, `button`, `:root { --accent }`, `@keyframes pop-in` ...).
 * Loaded into the blog as-is it would restyle the blog, so every stylesheet that comes from the editor's source tree is
 * rewritten at build time to live under one root class:
 *
 *   :root / html / body / #root   ->  .sdd-root         (tokens and base styles become the editor root's own)
 *   *                             ->  .sdd-root, .sdd-root *
 *   anything else                 ->  .sdd-root <selector>
 *   @keyframes name               ->  @keyframes sdd-name (and every animation using it)
 *
 * `embed/theme.css` is already written against `.sdd-root` and passes through untouched.
 */
export const SCOPE = ".sdd-root";
const KEYFRAMES_PREFIX = "sdd-";

const CSS_FILE = /\.css$/;
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "server" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (CSS_FILE.test(name)) out.push(p);
  }
  return out;
};

const keyframeNames = (files: string[]): Set<string> => {
  const names = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/@keyframes\s+([\w-]+)/g)) if (m[1]) names.add(m[1]);
  return names;
};

const ROOT_LIKE = /^(?::root|html|body|#root)(?![\w-])/;

/** one selector of a rule -> scoped (exported for the unit test) */
export const scopeSelector = (raw: string): string => {
  const sel = raw.trim();
  if (sel.includes(SCOPE)) return sel; // already written against the root (embed/theme.css)
  if (ROOT_LIKE.test(sel)) return sel.replace(ROOT_LIKE, SCOPE);
  if (sel === "*") return `${SCOPE}, ${SCOPE} *`;
  return `${SCOPE} ${sel}`;
};

export function scopeCss(css: string, from: string, keyframes: Set<string>): string {
  const root = postcss.parse(css, { from });
  type Node = { type?: string; name?: string; parent?: Node };
  const inKeyframes = (rule: Rule) => {
    for (let p = rule.parent as Node | undefined; p; p = p.parent) if (p.type === "atrule" && /keyframes$/i.test(p.name ?? "")) return true;
    return false;
  };
  // Vite inlines `@import`ed files after plugins ran on the entry, so they would escape: scope and inline them here.
  root.walkAtRules("import", (at) => {
    const m = /^(?:url\()?\s*["']?(\.{1,2}\/[^"')\s]+\.css)["']?\s*\)?\s*$/.exec(at.params);
    if (!m?.[1]) return;
    const target = resolve(dirname(from), m[1]);
    at.replaceWith(postcss.parse(scopeCss(readFileSync(target, "utf8"), target, keyframes), { from: target }).nodes);
  });
  root.walkRules((rule) => {
    if (inKeyframes(rule)) return;
    // `*` expands to two selectors; splitting every result on ", " would also cut `:is(a, b)` / `:not(a, b)` apart and drop the rule
    rule.selectors = [...new Set(rule.selectors.flatMap((s) => (s.trim() === "*" ? [SCOPE, `${SCOPE} *`] : [scopeSelector(s)])))];
  });
  root.walkAtRules(/keyframes$/i, (at) => {
    if (keyframes.has(at.params.trim())) at.params = `${KEYFRAMES_PREFIX}${at.params.trim()}`;
  });
  if (keyframes.size) {
    const re = new RegExp(`(?<![\\w-])(${[...keyframes].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`, "g");
    root.walkDecls(/^(-webkit-)?animation(-name)?$/i, (d) => {
      d.value = d.value.replace(re, `${KEYFRAMES_PREFIX}$1`);
    });
  }
  return root.toString();
}

/**
 * Vite plugin: scopes every `.css` that lives under `dir` (the editor's `src`) and the `@xyflow` stylesheet
 * (`@xyflow/react/dist/style.css`) from this project's `node_modules`.
 */
export function scopeDiagramCss(dir: string, nodeModules = join(dir, "..", "..", "node_modules")): Plugin {
  const vendor = join(nodeModules, "@xyflow");
  const names = keyframeNames([...walk(dir), join(vendor, "react", "dist", "style.css")]);
  return {
    name: "scope-diagram-css",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!CSS_FILE.test(file) || !(file.startsWith(`${dir}/`) || file.startsWith(`${vendor}/`))) return null;
      return { code: scopeCss(code, file, names), map: null };
    },
  };
}
