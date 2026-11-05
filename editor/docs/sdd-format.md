# The `.sdd` format

One extension for everything: **`.sdd`**. A `.sdd` is either

| content | `type` | MIME type | what it holds |
|---|---|---|---|
| a ZIP container | `file` | `application/vnd.sdd+zip` | **one canvas** (a document with its pages) |
| a ZIP container | `project` | `application/vnd.sdd+zip` | **many files** with their folder tree |
| plain UTF-8 text | (text) | `text/vnd.sdd` | the **diagrams-as-code** DSL of one page |

The two ZIP kinds share the same `manifest.json` shape and are told apart by `manifest.type`. There is no other extension to save to:

* **Save** (⌘S) writes a `.sdd` of type `file`.
* **Export project** writes a `.sdd` of type `project`.
* **Export as text** writes a text `.sdd`.

The old spellings are still **opened** (never written): `.sddproj` (a project container, `format: "sddproj"`, mimetype `application/vnd.sddproj+zip`), `.sddt` (the text format) and `.sdd` ZIPs written before `type` existed (they are files).

## Sniffing: the content decides, not the name

Every importer (browser Open, drag and drop, the PWA file handler, `POST /api/import`, the MCP `import_dsl` tool) looks at the bytes:

1. The bytes start with `PK` -> a ZIP. `manifest.json` is read: `type: "project"` or `format: "sddproj"` -> project; `type: "file"` or no `type` -> file.
2. The first non-blank line is `#!sdd` (optionally with a version, `#!sdd 1`) -> text. A name ending in `.sddt` is text even without the header (legacy).
3. Anything else is rejected with `unsupported: Not a .sdd file` before it is parsed.

Opening a project container creates a **new project**; opening a file container or text creates a **new file** (an id that already exists asks Replace / Open as copy). Text has no coordinates: every node is laid out automatically.

## File container (`type: "file"`)

```
my-diagram.sdd
├── mimetype                 first entry, STORED (no compression): "application/vnd.sdd+zip"
├── manifest.json            what is inside + checksum
├── project.json             project meta, project-level settings, page order
├── pages/<pageId>.json      nodes, edges, groups, viewport, per-page settings
├── source.sdd               the text rendering of the first page (informational)
├── assets/<sha256>.<ext>    user-uploaded images / custom icons (content-addressed, deduplicated)
└── thumbnails/<pageId>.png  optional preview (best effort)
```

Built-in catalog icons (`postgresql`, `aws:lambda`, ...) are referenced **by id only** and are not embedded.
Custom icons are referenced as `asset:<sha256>` and embedded under `assets/`.

```json
{
  "format": "sdd",
  "formatVersion": 1,
  "type": "file",
  "appVersion": "0.1.0",
  "createdAt": 1735689600000,
  "updatedAt": 1735776000000,
  "projectId": "prj_lq3k9a1b2c",
  "name": "Payments platform",
  "pages": [
    { "id": "pg_ab12", "name": "Overview", "file": "pages/pg_ab12.json" },
    { "id": "pg_cd34", "name": "Kafka cluster", "file": "pages/pg_cd34.json" }
  ],
  "checksum": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
}
```

`checksum` is the SHA-256 (hex) of the concatenated bytes of `project.json` followed by every page file in manifest order (`source.sdd` is not part of it). A mismatch means the file was modified or damaged after saving and is rejected.

### `source.sdd` is informational

`source.sdd` makes the archive greppable (`unzip -p my.sdd source.sdd | grep postgres`). It is **never** the source of truth: on import the JSON wins. If `source.sdd` means something different from the JSON (compared as parsed documents, so reformatting and comments do not count) or has syntax errors, the import succeeds with a warning ("source.sdd differs from the diagram data; the data was used") and `source.sdd` is ignored.

## Project container (`type: "project"`)

```
my-project.sdd
├── mimetype                 first entry, STORED: "application/vnd.sdd+zip"
├── manifest.json            type "project": folder tree, file list, checksum
├── files/<fileId>.sdd       one file container (type "file") per file, STORED (already compressed)
└── files/<fileId>/source.sdd  the text rendering of that file (informational, same rules as above)
```

Folder and file **names are data only**: they appear in the manifest and are never used as paths inside the archive, so no name can escape it. Nested files are named by id.

```json
{
  "format": "sdd",
  "formatVersion": 1,
  "type": "project",
  "appVersion": "0.1.0",
  "createdAt": 1735689600000,
  "updatedAt": 1735776000000,
  "name": "Payments platform",
  "folders": [
    { "id": "fld_a1", "parentId": null,     "name": "infra", "position": 1 },
    { "id": "fld_b2", "parentId": "fld_a1", "name": "data",  "position": 0 }
  ],
  "files": [
    { "id": "fil_x1", "folderId": null,     "name": "Overview", "kind": "sdd", "position": 0, "path": "files/fil_x1.sdd", "source": "files/fil_x1/source.sdd" },
    { "id": "fil_y2", "folderId": "fld_b2", "name": "Schema",   "kind": "erd", "position": 0, "path": "files/fil_y2.sdd", "source": "files/fil_y2/source.sdd" }
  ],
  "checksum": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
}
```

* `parentId` / `folderId` `null` = the project root. `position` is the sort key among siblings (folders and files share one sequence). `kind` is the icon hint: `sdd | erd | uml | board`.
* `checksum` is the SHA-256 (hex) of the concatenated bytes of every `files/<id>.sdd` in manifest order. Each nested file carries its own checksum as usual.
* The ids in an archive are never trusted: importing assigns fresh ids to the project, its folders and its files.

## Text format (diagrams as code)

```
#!sdd 1
diagram "Shop"

group vpc "VPC" icon=aws-group-aws-cloud {
  node api "API" icon=service sub="Node 20"
  node db "Postgres" icon=postgresql
}
node web "Web" icon=browser

web -> api "HTTPS" preset=metrics
api -> db "SQL" dashed

table users {
  id uuid [pk]
  email text [not null, unique]
}
table orders {
  id uuid [pk]
  user_id uuid [not null, ref: > users.id]
  indexes {
    user_id
  }
}

seq login "Login flow" {
  actor user as "User"
  participant api
  user -> api: POST /login
  alt valid
    api --> user: 200
  else invalid
    api --> user: 401
  end
}
```

One text file is one page. Lines are statements; `//` starts a comment anywhere outside a string and `#` a comment at the start of a line (the first line `#!sdd` is the header). Strings are `"double quoted"` with `\"` and `\n` escapes. Words are separated by spaces and an arrow needs spaces around it.

**Architecture**

| statement | meaning |
|---|---|
| `diagram "Title"` | page name (the importing file's name is used when absent) |
| `node <id> "Label" [icon=<catalog id or name>] [sub="Subtitle"]` | a catalog icon node. Unknown icons are a warning and the node keeps a generic icon. |
| `group <id> "Label" [icon=...] { ... }` | a group; nodes and groups inside the braces belong to it |
| `a -> b ["label"] [preset=metrics\|logs\|traces\|control\|backup] [dashed] [color=#hex]` | an edge. `<->` both ends, `--` no arrowheads, `<-` start only |

**ER (DBML-like)**: `table`, `view` or `enum` blocks. A column is `name type [pk, unique, not null, null, increment, default: x, note: "..", ref: > other.col]`; `indexes { col  (a, b) [unique, name: "x"] }`; `note: "text"`. Relations can also stand alone: `ref: orders.user_id > users.id` (`>` many-to-one, `<` one-to-many, `-` one-to-one, `<>` many-to-many) with optional `[delete: cascade, update: restrict]`.

**Sequence (Mermaid-like)**: `seq <id> "Title" { ... }` with `participant|actor|boundary|control|entity|database <id> [as "Name"]`, `autonumber`, messages `a -> b: text` (call), `->>` (async), `-->` (return), `-->>` (create), `-x` (destroy), `note over a, b: text` / `note left of a: text`, and fragments `alt|opt|loop|par|break|critical <guard>` ... `else|and|option <guard>` ... `end`.

**UML class**: a `classes { ... }` block (one per page; several are merged).

```
classes {
  package shop "Shop" {
    abstract class Animal<T, K extends Key> "entity" archRef=svc {
      - static count: int = 0
      # name: string
      + abstract speak(loud: bool, times): void
    }
    interface Pet { + play(): void }
    enum Color { RED  GREEN }
  }
  class Dog extends Animal implements Pet
  Dog --o Pet "walks" srcMult=1 dstMult=0..* srcRole=owner dstRole=pets
}
```

Kinds: `class`, `abstract class`, `interface`, `enum`; `<T>` generics follow the name, an optional quoted string is the stereotype, `extends` / `implements` are sugar for inheritance / realization (printed as relations). Members: `[+ - # ~] [static] [abstract] name[: Type] [= default]` for attributes and enum literals, `name(a: A, b): R` for operations; no symbol means no visibility. Relations `A op B ["label"] [srcMult= dstMult= srcRole= dstRole=]` (the marker sits on the right end, like the canvas): `--|>` inheritance, `..|>` realization, `--*` composition (A is the part), `--o` aggregation (A is the part), `-->` directed association, `--` association, `..>` dependency. `package <id> "Label" { }` nests classes and packages (group nodes with variant `package`). Classes are matched by name, so a rename is a new class.

**State**: a `states { ... }` block. `state <id> ["Name"] [activity="entry / x\nexit / y"]`, pseudo-states `initial|final|choice|fork|join|history|deepHistory <id> ["label"]` (`fork` / `join` take the flag `vertical`), `state <id> "Name" { ... }` is a composite (group variant `composite`), a `region` line inside a composite starts the next concurrent region, transitions `a -> b "event [guard] / action"`.

**Use case**: a `usecases { ... }` block. `actor <id> "Name"`, `usecase <id> "Name" [{ point "Extension point" ... }]`, `boundary <id> "System" { ... }` (the use cases and actors inside belong to it), relations `a -- b ["label"] [srcMult= dstMult=]`, `a include b`, `a extend b ["label"]`, `a generalizes b` (`include` / `extend` default to the `«include»` / `«extend»` label).

**Component**: a `components { ... }` block. `component|node|artifact <id> "Name" [stereotype=x] [{ ... }]`; the body holds `provides IA, IB` / `requires IC` (ports on the border: lollipop / socket) and nested components. Links `a ..> b ["label"]` dependency, `a -- b ["label"]` assembly. An interface required by one component and provided by another gets an assembly between the two ports automatically; it is not printed.

**Activity**: an `activity { ... }` block. `initial|final|flowFinal|action|decision|fork|object|send|accept|note <id> ["label"]`; the label defaults to the id for `action`, `object`, `send`, `accept` and `note`, and to empty for `initial`, `final`, `flowFinal`, `fork` and `decision`. `fork` (also the join bar) takes the flag `vertical`, `object` takes `state=name`. `lane <id> "Name" [orient=h] { ... }` is a swimlane (group variant `lane`; `orient=h` makes it a row, default is a column) and the elements written inside belong to it. Control flows `a -> b ["[guard]"]` (the quoted label is stored verbatim, so write the brackets), note links `n -- a` (dashed, no arrow).

**Deployment**: a `deployment { ... }` block. `node|device|executionEnvironment|artifact|component <id> "Name" [stereotype=x] [icon=<catalog id>] [{ ... }]`; `node`, `device` and `executionEnvironment` can hold other elements (the 3D boxes nest), `artifact` and `component` cannot. Paths `a -- b ["HTTPS"]` communication path (the label is the protocol), `a ..> b ["label"]` deployment dependency (default label `«deploy»`, not printed when it is the default), `a manifests b ["label"]` manifestation (default `«manifest»`). `icon=` reuses an architecture icon and warns when the id is unknown.

**Package**: a `packages { ... }` block, a view over the class packages (`package <id> "Name" { ... }` inside `classes { }` are the packages, with their nested packages and classes). The block holds only the relations between packages: `a imports b ["label"]` (`«import»`), `a access b` (`«access»`), `a merges b` (`«merge»`) and `a ..> b` (plain dependency); all are dashed open arrows. `package <id> "Name" [{ ... }]` may also be written inside the block (it declares the same package; printing moves it to `classes`). Ids are the package ids; an unknown id is an error.

**Object**: an `objects { ... }` block. `object <id> ["instance name"] [class=<Class>] [{ ... }]`, the name defaults to the id and `class` is free text (the lint rule matches it to a class of the page). The body holds one slot per line, `attribute [= value]` (`"quoted name"` allowed, the value is the rest of the line, `#` is not a comment there). Links `a -- b ["association name"] [srcRole= dstRole=]`. Lint `uml/object-unknown-slot` (warning): a slot that is no attribute of the class, own or inherited.

**Communication**: a `communication { ... }` block, same `object` lines and `a -- b` links as `objects`, plus numbered messages `<seq> <from> -> <to> ["text"] [async]` (`1`, `1.1`, `2`; the link between the two objects is created when it is not declared; the printer lists messages in numbering order and omits links that only carry messages). A page whose links have messages prints as `communication`, otherwise as `objects`.

**Timing**: `timing <id> ["Title"] { ... }` (top level, like `seq`). Lines: `unit ms`, `end 400` (default: the last time used), lifelines `robust|concise|binary|clock <id> ["Name"] [states A, B, "C d"] [period=50]`, state changes `<life> @<t> <State>`, messages `<from> -> <to> @<t>[..<t2>] ["text"]`, duration constraints `<life> <t1>..<t2> ["{200 ms}"]`. A concise or robust lifeline collects states from its changes; a binary lifeline is `high` or `low`; a clock has no changes.

`class` and `component` headers also carry the cross-link `archRef=<nodeId> [archFile=<id>] [archPage=<id>]`. `class` headers and `object` lines may carry `model=<id>` (the shared class model, `[A-Za-z0-9_.-]`), and a sequence `participant`/`actor`/... line may end with `model=<id>`: all classes of a file with the same id are linked copies (kept equal by the editor; the text round trip keeps the id, and removing it from the text unlinks that node). In `.sdd` JSON it is `data.modelId` (class, object) and `participants[].modelId` (sequence); additive, no schema change. Ids of states, use cases, components and packages are page-wide unique (together with the architecture ids); a node whose id is reused with another kind in the same family (state -> composite, actor -> use case) keeps its position. Things the text cannot express (class attribute-row anchors, port sides, notes, free-standing interface nodes) stay on the canvas and survive text edits. Text for a type that the page has but the text lacks removes those nodes, like tables.

The text carries **no coordinates**. When it is applied to a page, ids that already exist keep their position, size and every property the text does not express (colours, locked, custom styling); new ids are laid out next to the existing content; ids missing from the text are removed. Things the text cannot express (stickies, frames, drawings, clusters, UML notes and free-standing interface nodes) are left alone.

Syntax errors never change a diagram: the editor shows them inline (line and column) and a failed import creates nothing.

## project.json / pages/*.json

Both carry `schemaVersion` (currently `7`; v7 adds the design-tool fields described in "Design node data (schema v7)" below and the page `guides`; v6 adds the Board kinds `frame`, `mindmap` and `stamp`, sticky `private` / `author` / `autoFont`, freehand `pts` + `brush` and frame `order`, see below; v3 adds ER `table` nodes and `edge.data.relation`, v4 adds UML `class` nodes, `edge.data.uml`, the `hollowTriangle` / `filledDiamond` / `hollowDiamond` marker kinds and the `package` group variant, v5 adds the UML `sequence`, `state`, `usecase` and `component` nodes, the `composite` and `boundary` group variants, the `transition` / `include` / `extend` / `generalization` / `assembly` relation kinds and `edge.data.uml.sourceMember` / `targetMember`; older files open unchanged). Migrations upgrade one version at a time on open
(`src/lib/sdd/migrations.ts`):

| from | to | change |
|---|---|---|
| 1 | 2 | `project.activePage` -> `activePageId`; node `data.icon` -> `data.iconId` |
| 2 | 3 | none (ER `table` nodes and relation edges are additive) |
| 3 | 4 | none (UML `class` nodes and `edge.data.uml` are additive) |
| 4 | 5 | none (sequence / state / use case / component nodes and the new relation kinds are additive) |
| 5 | 6 | none (Board kinds and sticky / stroke fields are additive) |
| 6 | 7 | none (design-tool node fields and page `guides` are additive) |

Files with a schema newer than the app are rejected with a clear message (never silently down-converted).

## Validation and safety

All JSON is validated with zod on open (`src/lib/sdd/schema.ts`, `server/src/sdd`) plus the semantic diagram checks (unique ids, valid parents and edge endpoints, enum values). Errors name the failing entry and field, for example `pages/pg_ab12.json: nodes.3.type: Invalid option`. A corrupt or partial file shows an error toast and never crashes. The **same limits apply to both container kinds and to the text format**:

* files larger than **100 MB** are rejected (server: `MAX_SDD_MB`)
* total uncompressed size is limited (300 MB, `MAX_SDD_UNCOMPRESSED_MB`) and the entry count is limited (2000): zip-bomb protection; an entry whose real size differs from its declared size is rejected
* entry names containing `..`, absolute paths, backslashes, `:` or NUL are rejected (path traversal); a project's `path` and `source` entries must be `files/<name>.sdd` / `files/<name>/source.sdd`
* asset bytes must hash to the name they are stored under; the checksum must match
* a project holds at most **500 files** and **1000 folders**, folder nesting at most **64** deep, ids are unique, every `parentId` / `folderId` exists, folders must not form a cycle
* a project container's nested files share **one** uncompressed-size budget with the outer archive
* a wrong `format`, a `formatVersion` newer than the app, a wrong or compressed `mimetype` entry are rejected; opening a project as a file (or a file as a project) says so
* text is decoded as strict UTF-8 (no NUL bytes) and parsed with the same size limit
* unknown icon ids open fine: they render as a generic icon and are listed in an "Opened with warnings" dialog

## Opening, saving, importing

* App: **File > Open .sdd…** (⌘O), drag a file onto the app, the home page **Open .sdd** / **Import project** buttons, or (installed PWA) double-click the file. The file input accepts `.sdd,.sddproj,.sddt`; the PWA `file_handlers` register `application/vnd.sdd+zip` (`.sdd`, `.sddproj`) and `text/vnd.sdd` (`.sdd`, `.sddt`).
* If a project with the same id already exists, the app asks inline: **Replace** or **Open as copy** (copy gets a new id, `(copy)` name and fresh page ids).
* ⌘S re-saves to the same file via the File System Access API when available, otherwise downloads. A file opened from text has no handle, so ⌘S saves a ZIP container instead of overwriting the text.
* Server: `POST /api/import` (multipart `file`, sniffs), `GET /api/files/:id/export?type=file|text`, `GET /api/projects/:id/export`; the older `POST /projects/import`, `/projects/:id/import`, `/projects/import-project`, `export.sdd` and `export.sddproj` routes remain as aliases (their output is always the new format). See `docs/backend.md`.
* MCP: `import_dsl` reads the text format, `export` with `format: "sdd"` writes it (`docs/mcp.md`).

### UML node data (schema v5)

- `sequence`: `data = { label, accent, autonumber, participants: [{ id, name, kind }], items: [...] }`. `kind` is `participant | actor | boundary | control | entity | database`. `items` is the ordered, nested content: `{ type: 'message', id, from, to, text, kind: 'sync'|'async'|'return'|'create'|'destroy', activate?, deactivate? }`, `{ type: 'note', id, text, over: [participantId, ...], side? }` and `{ type: 'fragment', id, op: 'alt'|'opt'|'loop'|'par'|'break'|'critical', sections: [{ id, guard, items }] }`. No coordinates are stored: the layout engine (`src/lib/seq/layout.ts`) derives positions, lifelines, activation bars and fragment boxes, and the node's `width` / `height` follow it. Participant ids and item ids must be unique and every message refers to a known participant (the client and the server both check this).
- `state`: `data = { label, stateKind: 'state'|'initial'|'final'|'choice'|'fork'|'join'|'history'|'deepHistory', activity?, accent, vertical? }`. A composite state is a `group` node with `variant: 'composite'`; its states have `parentId` set to it. A transition is an edge with `data.uml.kind = 'transition'` whose `label` is `event [guard] / action`.
- `usecase`: `data = { label, ucKind: 'actor'|'usecase', accent }`; the system boundary is a `group` with `variant: 'boundary'`. Relations are edges with `data.uml.kind` `association | include | extend | generalization` (`include` / `extend` carry the `«include»` / `«extend»` label).
- `activity`: `data = { label, actKind: 'initial'|'final'|'flowFinal'|'action'|'decision'|'fork'|'object'|'send'|'accept'|'note', accent, vertical?, objectState? }`; a swimlane is a `group` with `variant: 'lane'` and `laneOrient: 'v'|'h'` (nodes inside have it as `parentId`). Control flows are edges with `data.uml.kind` `transition` whose `label` is `[guard]`; a note is linked with `data.uml.kind` `note`. Added without a schema bump (additive).
- `component`: `data = { label, compKind: 'component'|'node'|'artifact'|'provided'|'required', stereotype?, accent, facing? }`; connectors use `data.uml.kind` `assembly` or `dependency`.
- `deployment`: `data = { label, depKind: 'node'|'device'|'executionEnvironment'|'artifact'|'component', stereotype?, iconId?, accent, container? }`. Nested elements have the enclosing node as `parentId` (a `deployment` node, like a `component` node, may be a parent next to `group` and `cluster`). Paths are edges with `data.uml.kind` `communication` (label = protocol), `deploy` or `manifest` (labels `«deploy»` / `«manifest»` by default). Added without a schema bump (additive).
- `object`: `data = { label, className?, slots: [{ id, name, value }], accent }` (all strings; slot ids unique per node, validated by the client and the Go backend). Drawn as `name : Class` underlined over the slot rows. Links are edges with `data.uml.kind: 'link'` (`label` = association name, `sourceRole` / `targetRole`).
- `timing`: `data = { label, accent, unit, end, lifelines: [{ id, name, kind: 'robust'|'concise'|'binary'|'clock', states: string[], period? }], changes: [{ id, life, t, state }], messages: [{ id, from, to, t, t2?, text }], durations: [{ id, life, t1, t2, text }] }`. Times are numbers on an axis from 0 to `end`; ids unique across changes / messages / durations; `life`, `from`, `to` name a lifeline; a binary lifeline's states are `high` / `low`. The node owns its size (client and Go backend validate the data).
- Communication diagram: no new node kind. `object` nodes and `link` edges; a link may carry `data.uml.messages: [{ id, seq, text, dir: 'fwd'|'back', async? }]` (`seq` dotted digits such as `1`, `1.1`; ids unique per edge). The edge `label` is derived (`1: text →`).
- Package diagram: no new node kind. Packages are the `group` nodes of variant `package` (tab folder) with classes and packages nested by `parentId`; package relations are edges with `data.uml.kind` `import | access | merge` (carry `«import»` etc. as the label) or `dependency`. Additive, `CURRENT_SCHEMA` is unchanged.
- `edge.data.uml.sourceMember` / `targetMember`: the attribute row (member id) of a class where an association attaches.

### Board node data (schema v6)

All additive: v1 to v5 files open unchanged (legacy `sticky` nodes and `draw` nodes with a `path` still render).

- `sticky`: `data = { label, fill, stroke, fontSize, autoFont?, author?, authorId?, private? }`. One of eight colours (`fill` / `stroke` pairs in `src/lib/board/sticky.ts`). `autoFont` fits the text to the note. `private: true` hides the text from everybody whose id is not `authorId` until someone clears the flag ("Reveal"). On a server the note is **not** part of the shared document at all: it is kept in the author's own private store (`docs/backend.md` "Private stickies") and the server strips it from saved documents, versions and exports; in a local-only project it stays in the local document. Revealing it clears the flag and shares it.
- `frame`: `data = { label, order?, accent? }` with a positive `width` / `height` (required). `order` is the presentation order (ascending; frames without it follow in reading order). Content "inside" a frame is geometric (its centre lies in the frame), there is no `parentId`. Deep link: `#frame=<node id>` after the file URL.
- `mindmap`: `data = { label, root?, side?: 'l'|'r', collapsed?, accent?, branch? }`. The tree is the set of edges between mind map nodes (source = parent, target = child, `data.lineType = 'curved'`); `collapsed` hides the descendants (`hidden: true` on the nodes and edges).
- `stamp`: `data = { label: '', emoji }` (1 to 32 characters).
- `draw`: new strokes store `data = { pts, brush: 'pen'|'highlighter', stroke, strokeWidth }`; the outline is computed at render time (perfect-freehand). `pts` is a compact text encoding in node-local coordinates: a header `a` (no pressure) or `b` (pressure) followed by space separated base-36 tokens on a 0.5 px grid, the first point absolute and every next one a delta: `x y [pressure 0..35]` per point. The client and the server both check it (`src/lib/board/validate.ts`, `server/src/schema/project.ts`). Strokes recognised as a triangle or an arrow are stored as a `draw` node with a clean SVG `path`; a circle or rectangle becomes a `shape` node.

### Design node data (schema v7)

All additive and optional: v1 to v6 files open unchanged. They live in `node.data` (so they sync field by field in a live file, see `docs/backend.md` "Realtime") except `guides`, which is a page field. The server validates every one of them (`server/src/schema/project.ts`); unknown keys are kept.

| field | shape | meaning |
|---|---|---|
| `hidden` | `boolean` | layer hidden on the canvas and left out of exports (not the same as the react-flow `hidden`, which is reserved for collapsed content) |
| `locked` | `boolean` | (existing) layer locked |
| `componentMain` | `string` | this node is the main component `<id>` of the project library |
| `instance` | `{ componentId, rev, overrides: { [instKey]: { [field]: value } } }` | this node is an instance; `rev` is the library revision it was last synced with; overrides keep per-instance text, colours and icon across updates of the main |
| `instKey` | `string` | key of this node inside its component (matches `overrides` keys) |
| `autoLayout` | `{ mode: 'row'\|'column'\|'grid', gap, gapY?, padding, align: 'start'\|'center'\|'end'\|'stretch', justify: 'start'\|'center'\|'end'\|'between', columns?, hugW, hugH }` | the container lays its children out |
| `layoutSizing` | `{ w, h }` each `'fixed'\|'fill'\|'hug'` | how a child (or the container) sizes itself |
| `constraints` | `{ h: 'left'\|'right'\|'center'\|'stretch'\|'scale', v: 'top'\|'bottom'\|'center'\|'stretch'\|'scale' }` | how a child inside a frame follows a frame resize |
| `link` | `{ fileId, nodeId? }` | prototype link to another file (or a node in it) |
| `styles` | `{ fill?, text?, effect?, stroke? }` | ids of project library styles applied to the node |
| `source` | `string` (max 2000) | source file / URL shown in Dev mode |

Page field `guides`: `[{ id, axis: 'x'|'y', pos }]` (at most 200), the ruler guides of the canvas, stored per file (in a live file as one atomic `meta.guides` value).

Components, styles and theme tokens are **project level**, not part of a file: they are stored in the server's `project_library` table (`docs/backend.md` "Project library") and in the browser's project cache for local projects. A `.sdd` / `.sddproj` does not carry them (a copied instance keeps its `instance` data and last-known look).
