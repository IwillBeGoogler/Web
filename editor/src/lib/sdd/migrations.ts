/**
 * Schema migrations for project.json / pages/*.json.
 * Every migration upgrades exactly one version: v1 -> v2 -> ... so old files keep opening.
 */
/** v3: `table` nodes (ER) and relation edges (`edge.data.relation`) may appear; older files open unchanged. */
/** v4: UML `class` nodes, `edge.data.uml` relations, UML marker kinds and the `package` group variant (all additive). */
/** v5: UML `sequence`, `state`, `usecase` and `component` nodes, `composite` / `boundary` group variants, transition / include / extend / generalization / assembly relations (all additive). */
/** v6: Board: `frame`, `mindmap` and `stamp` nodes, sticky `private` / `author` / `autoFont`, freehand `pts` + `brush`, frame `order` (all additive). */
/** v7: design tools: node `hidden` / `instance` / `instKey` / `componentMain` / `autoLayout` / `layoutSizing` / `constraints` / `link` / `styles` / `source`, page `guides` (all additive). */
/** v8: smart tooling: node `data.capacity` and edge `data.traffic` (capacity & latency calculator inputs, additive). */
export const CURRENT_SCHEMA = 8;

type Obj = Record<string, unknown>;
type Migration = (o: Obj) => Obj;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const projectMigrations: Record<number, Migration> = {
  // v1 stored the active page under `activePage`
  1: (o) => {
    const { activePage, ...rest } = o;
    return { ...rest, activePageId: rest.activePageId ?? activePage, schemaVersion: 2 };
  },
  // v2 -> v3: nothing to rewrite (ER table nodes and relation edges are additive)
  2: (o) => ({ ...o, schemaVersion: 3 }),
  // v3 -> v4: nothing to rewrite (UML classes and relations are additive)
  3: (o) => ({ ...o, schemaVersion: 4 }),
  // v4 -> v5: nothing to rewrite (sequence, state, use case and component diagrams are additive)
  4: (o) => ({ ...o, schemaVersion: 5 }),
  // v5 -> v6: nothing to rewrite (frames, mind maps, stamps and richer stickies / strokes are additive)
  5: (o) => ({ ...o, schemaVersion: 6 }),
  // v6 -> v7: nothing to rewrite (design-tool fields and guides are additive)
  6: (o) => ({ ...o, schemaVersion: 7 }),
  // v7 -> v8: nothing to rewrite (capacity / traffic fields are additive)
  7: (o) => ({ ...o, schemaVersion: 8 }),
};
const pageMigrations: Record<number, Migration> = {
  // v1 nodes stored the icon under `data.icon`
  1: (o) => ({
    ...o,
    schemaVersion: 2,
    nodes: Array.isArray(o.nodes)
      ? o.nodes.map((n) => {
          if (!isObj(n) || !isObj(n.data) || !('icon' in n.data)) return n;
          const { icon, ...data } = n.data;
          return { ...n, data: { ...data, iconId: data.iconId ?? icon } };
        })
      : o.nodes,
  }),
  2: (o) => ({ ...o, schemaVersion: 3 }),
  3: (o) => ({ ...o, schemaVersion: 4 }),
  4: (o) => ({ ...o, schemaVersion: 5 }),
  5: (o) => ({ ...o, schemaVersion: 6 }),
  6: (o) => ({ ...o, schemaVersion: 7 }),
  7: (o) => ({ ...o, schemaVersion: 8 }),
};

function run(raw: unknown, table: Record<number, Migration>, what: string): unknown {
  if (!isObj(raw)) return raw;
  let cur: Obj = raw;
  let v = typeof cur.schemaVersion === 'number' ? cur.schemaVersion : 1;
  if (v > CURRENT_SCHEMA) throw new Error(`${what} uses schema v${v}, which is newer than this app supports (v${CURRENT_SCHEMA}). Update the app to open it.`);
  while (v < CURRENT_SCHEMA) {
    const m = table[v];
    if (!m) throw new Error(`No migration from ${what} schema v${v}`);
    cur = m(cur);
    v = typeof cur.schemaVersion === 'number' ? cur.schemaVersion : v + 1;
  }
  return cur;
}

export const migrateProjectFile = (raw: unknown): unknown => run(raw, projectMigrations, 'project.json');
export const migratePageFile = (raw: unknown): unknown => run(raw, pageMigrations, 'page file');
