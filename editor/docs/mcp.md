# MCP server (for external AI clients)

The product itself contains **no AI**. This server only lets tools such as Claude Desktop or Claude Code read and edit your diagrams through a typed, permissioned API. Every tool is deterministic: parsers, validators and layout algorithms.

* Official SDK: `@modelcontextprotocol/sdk` (publisher Anthropic, PBC / modelcontextprotocol), pinned in `server/package.json`.
* Transports: **streamable HTTP** at `POST <API_PREFIX>/mcp` (stateless JSON mode) and a **stdio bridge** (`server/src/mcp/stdio.ts`, built to `dist/mcp/stdio.js`, bin `sdd-mcp`).
* The stdio bridge does not open the database: it forwards every message to a running server, so edits take the same validation + Yjs path as the browser and live collaborators see them.
* Switch off with `MCP_ENABLED=false`. Rate limit: `MCP_RATE_LIMIT_PER_MINUTE` (default 120 calls per token per minute).

## Authentication and permissions

Create a personal access token in the app (Settings, Access tokens, or `POST /api/tokens`). Pick scopes and, optionally, the projects it may reach (`projectIds`):

| tool group | scope needed |
|---|---|
| `list_projects`, `search_catalog` | `projects:read` |
| `list_files`, `list_pages`, `read_file`, `export`, `run_lint` | `files:read` |
| `create_file`, `add_nodes`, `add_edges`, `update_node`, `delete_elements`, `apply_layout`, `import_dsl`, `undo_last_change` | `files:write` |

The endpoint itself needs `projects:read`. On top of the scope, the token owner's **project role** applies (a viewer cannot write even with `files:write`) and a project-limited token cannot even see other projects (404). Revoke a token at any time.

## Live and undoable edits

Writes go through the same path as `PUT /v1/files/:id`: the result is validated with the project schema, saved with an optimistic version check (retried on conflict), recorded as a version labelled `"<user> via MCP: <tool>"`, and pushed into the live Yjs room, so everyone with the file open sees the change at once. Unsaved live edits are flushed first, so nothing typed in the browser is overwritten. Collaborators see the presence/attribution `"<user> via MCP"`.
`undo_last_change` restores the version before the latest MCP change (only if it was made through MCP). Anyone can also use the version history.

## Audit log

Every call is written to the `mcp_audit` table (user, token id, tool, project, file, status `ok|error|denied|rate_limited`, a short argument summary without file contents, duration). Read your own trail with `GET /api/mcp/audit?limit=100` (browser session only).

## Tools

| tool | what it does |
|---|---|
| `list_projects` | projects you can access |
| `list_files` | files of a project (id, name, kind, version) |
| `list_pages` | pages of a file (id, name, index, node and edge counts) |
| `read_file` | nodes and edges of a page as JSON (`compact: true` for a short summary) |
| `create_file` | an empty file |
| `add_nodes` | nodes with catalog icons (`icon`), optional ids, positions, parent group; bad items are reported per index |
| `add_edges` | edges between existing nodes (label, preset, dashed) |
| `update_node` | label, subtitle, icon, position, size, extra data |
| `delete_elements` | nodes (with children and attached edges) and edges |
| `apply_layout` | `layered`, `orthogonal`, `radial`, `tree`, `force` (seeded), `grid`; `only: [ids]` tidies a selection |
| `search_catalog` | icons, groups and cluster profiles (use the id as `icon`) |
| `import_dsl` | apply `.sdd` text (architecture, ER tables, sequence diagrams); `sync` or `append`; syntax errors come back with line numbers and nothing is written |
| `export` | `mermaid`, `plantuml`, `sql`, `svg`, `json`, `sdd` (text) |
| `run_lint` | rule-based problems (see `docs/ROADMAP.md`), with rule ids, severities, node ids and available fixes |
| `undo_last_change` | go back one MCP change |

Every page of a file is live-synced over Yjs. Tools that touch a page (`read_file`, `add_nodes`, `add_edges`, `update_node`, `delete_elements`, `apply_layout`, `import_dsl`, `export`, `run_lint`) default to the first page; pass `pageId` (from `list_pages`) for another one (`page` still accepts an id, a name or a zero-based index). Collaborators with that file open see edits on any page. The browser UI shows one canvas per file (the first page), so edits on other pages show up there only through version history, export and REST.

## Claude Desktop

`claude_desktop_config.json` (stdio, needs a running server):

```json
{
  "mcpServers": {
    "system-design-diagram": {
      "command": "node",
      "args": ["/path/to/system-design-diagram/server/dist/server/src/mcp/stdio.js"],
      "env": {
        "SDD_URL": "http://localhost:3001",
        "SDD_TOKEN": "sdd_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

During development use `"command": "npx", "args": ["tsx", "/path/to/server/src/mcp/stdio.ts"]`. `SDD_API_PREFIX` defaults to `/api`.

## Claude Code

Streamable HTTP, no bridge needed:

```bash
claude mcp add --transport http system-design-diagram http://localhost:3001/api/mcp \
  --header "Authorization: Bearer sdd_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

or stdio:

```bash
claude mcp add system-design-diagram -e SDD_URL=http://localhost:3001 -e SDD_TOKEN=sdd_pat_xxx -- node /path/to/server/dist/server/src/mcp/stdio.js
```

Then ask, for example: "list my projects, create a file 'Checkout', and draw a load balancer, two API instances and Postgres, then run the lint".
