/** A structural diff of two diagram documents (first page only): nodes and edges by id. */
export type DiffItem = { id: string; label: string };
export type DiffGroup = { added: DiffItem[]; removed: DiffItem[]; changed: DiffItem[] };
export type DocDiff = { nodes: DiffGroup; edges: DiffGroup; empty: boolean };

type Item = { id?: unknown; type?: unknown; label?: unknown; data?: unknown };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The active (first) page's nodes and edges; v1 documents keep them at the top. */
export function firstPage(doc: unknown): { nodes: Item[]; edges: Item[] } {
  if (!isObj(doc)) return { nodes: [], edges: [] };
  const page = Array.isArray(doc.pages) && isObj(doc.pages[0]) ? doc.pages[0] : doc;
  const list = (v: unknown): Item[] => (Array.isArray(v) ? v.filter(isObj) : []);
  return { nodes: list(page.nodes), edges: list(page.edges) };
}

/** JSON with sorted keys, so key order never reads as a change. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isObj(v))
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

const labelOf = (it: Item): string => {
  const d = isObj(it.data) ? it.data : {};
  const l = d.label ?? it.label;
  return typeof l === "string" && l.trim() ? l : String(it.id);
};

function group(a: Item[], b: Item[]): DiffGroup {
  const before = new Map(a.filter((i) => typeof i.id === "string").map((i) => [i.id as string, i]));
  const after = new Map(b.filter((i) => typeof i.id === "string").map((i) => [i.id as string, i]));
  const out: DiffGroup = { added: [], removed: [], changed: [] };
  for (const [id, it] of after) {
    const old = before.get(id);
    if (!old) out.added.push({ id, label: labelOf(it) });
    else if (old.type !== it.type || stable(old.data) !== stable(it.data) || stable(old.label) !== stable(it.label))
      out.changed.push({ id, label: labelOf(it) });
  }
  for (const [id, it] of before) if (!after.has(id)) out.removed.push({ id, label: labelOf(it) });
  return out;
}

/** What changed going from document `from` to document `to`. */
export function diffDocuments(from: unknown, to: unknown): DocDiff {
  const a = firstPage(from);
  const b = firstPage(to);
  const nodes = group(a.nodes, b.nodes);
  const edges = group(a.edges, b.edges);
  const n = (g: DiffGroup) => g.added.length + g.removed.length + g.changed.length;
  return { nodes, edges, empty: n(nodes) + n(edges) === 0 };
}
