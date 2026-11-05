# Backend (`server/`)

Optional self-hosted API for the editor: accounts, **projects with folders and files**, version history, sharing, assets,
`.sdd` import/export (file, project or text), per-user preferences and realtime notifications. Node 20+, Fastify 4, zod, Drizzle ORM
(SQLite by default, PostgreSQL via `DATABASE_URL`). The frontend works without it (localStorage / `.sdd` files) and syncs
to it when it is there; the client side of the contract is `docs/api-client.md`.

## Data model

```
Workspace (a user) > Project > File          (each file is ONE canvas)
```

Since the "Project › Files" simplification the UI shows a flat list of files per project; the `folders` table and its endpoints
stay (harmless, unused by the UI) and every file lives at the project root. `pages[]` is still the shape of the stored document,
but a file holds exactly one page. The one-time, versioned data migration `flat_v1` (`src/services/flatten.ts`, run at boot,
recorded in `app_meta`) splits every file with N > 1 pages into N files named `<file> — <page>` (the **original id keeps the first
page**, so share links and URLs still work; the old multi-page document stays in the version history) and moves files out of
folders (a file keeps its name; the folder path is prefixed only on a name clash). A multi-page document that arrives later
(import) is no longer split when opened live: the shared doc holds every page.

* **Project** (`projects`): a container with an owner, members and share links. It holds no diagram itself.
* **Folder** (`folders`): `id, projectId, parentId (null = project root), name, position`.
* **File** (`files`): one editable document: `id, projectId, folderId (nullable), name, kind (sdd|erd|uml|board, an icon hint
  computed from the dominant node kind on save), position, data (JSON: the "Project v2" document with its `pages[]`),
  version, pageCount, thumbnailHash, timestamps`. What used to be a "project with pages" is now a file.
* `position` is a fractional sort key shared by folders and files under one parent, so a drag-and-drop reorder changes a
  single row. `projects.treeRev` is bumped on every tree change so clients can tell when to re-pull the tree.
* `file_versions` (snapshots per file), `file_members` (optional per-file role override), `share_links.file_id`
  (null = whole project), `user_prefs` (per-user JSON, e.g. open tabs).

Migration `0001_workspace` (SQLite and PostgreSQL, hand-written data step, both kept in step by a test): every existing
project becomes a project with the **same id and name** holding one file with id `fil_<project id>` (same name, pages,
version, thumbnail), its version history moves to that file, share links become file links, members stay on the project.
Old ids therefore keep resolving (`/p/<old id>` is the project, and opens its only file).

## Setup

```bash
cd server && npm install
npm run dev            # http://localhost:3001  (SQLite in ./data, migrations run on boot, OpenAPI at /api/docs)
npm test               # vitest, in-memory SQLite
npm run typecheck && npm run build
npm run db:migrate     # apply migrations explicitly (also done automatically at start)
npm run seed           # admin user (SEED_EMAIL/SEED_PASSWORD) + sample project
```

Docker (one container serves API + built SPA, data in volume `/data`):

```bash
cp .env.example .env   # set SESSION_SECRET (32+ chars)
docker compose up --build                       # SQLite
DATABASE_URL=postgres://sdd:sdd@postgres:5432/sdd docker compose --profile postgres up --build
```

Schema changes: edit `server/src/db/schema.sqlite.ts` AND `schema.pg.ts` (same tables/columns), then `npm run db:generate`
(drizzle-kit asks interactively about renames; for data migrations write the SQL by hand like `0001_workspace.sql` and add the snapshot).

## Environment

| var | default | notes |
|---|---|---|
| `PORT` / `HOST` | 3001 / 0.0.0.0 | |
| `DATABASE_URL` | SQLite `$DATA_DIR/sdd.db` | `postgres://...`, `sqlite:<path>`, `file:<path>` |
| `DATA_DIR` | `./data` | |
| `SESSION_SECRET` | dev value | required (32+ chars) when `NODE_ENV=production`; HMACs session ids |
| `SESSION_TTL_DAYS` / `SESSION_ROTATE_SECONDS` / `SESSION_ROTATE_GRACE_SECONDS` | 14 / 86400 / 10 | |
| `COOKIE_SECURE` | true in production | set `false` for plain-http deployments |
| `CORS_ORIGINS` | none | comma list; also trusted by the Origin check |
| `AUTH_MODE` | `session` | `none` = single user, no login |
| `ALLOW_SIGNUP` | true | |
| `STORAGE_DRIVER` | `local` | `s3` needs `S3_BUCKET` (+ `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`) |
| `STORAGE_DIR` | `$DATA_DIR/storage` | local driver |
| `STATIC_DIR` | unset | serve the built SPA with history fallback |
| `API_PREFIX` | `/api` | every route (incl. `/api/docs`, `/api/ws/...`) lives under it so it never collides with SPA routes (`/projects`, `/p/:id`) when `STATIC_DIR` is set; `/healthz` + `/readyz` stay at the root. Empty = no prefix |
| `RATE_LIMIT_AUTH_MAX` / `_WINDOW_SECONDS` | 10 / 60 | login + register, per IP |
| `MAX_BODY_MB` / `MAX_PROJECT_MB` / `MAX_ASSET_MB` / `MAX_SDD_MB` / `MAX_SDD_UNCOMPRESSED_MB` | 1 / 10 / 5 / 100 / 300 | |
| `VERSIONS_KEEP_LAST` / `VERSIONS_KEEP_DAYS` | 50 / 30 | |
| `TRUST_PROXY` | false | true behind a reverse proxy (rate limit by real IP) |
| `LOG_LEVEL` | info | pino |
| `COLLAB_ENABLED` | true | live co-editing over `GET /ws/files/:id/yjs`; false -> that route is 404 and the app uses the REST (`If-Match`) path |
| `COLLAB_COMPACT_AFTER` | 50 | fold the incremental Yjs updates into the snapshot after this many |
| `COLLAB_PERSIST_MS` | 250 | batch window for writing Yjs updates |
| `COLLAB_MATERIALIZE_MS` | 1500 | debounce of the copy of the doc into the JSON `files.data` |
| `COLLAB_VERSION_INTERVAL_SECONDS` | 300 | at most one automatic history snapshot per file per this many seconds (and one when the last editor leaves) |
| `ICE_SERVERS` | `[{"urls":"stun:stun.l.google.com:19302"}]` | JSON list `[{"urls":"stun:h:3478"},{"urls":["turn:h:3478","turns:h:5349"],"username":"u","credential":"p"}]`, handed to browsers by `GET /rtc/config`. `[]` = no STUN (LAN only). See "Audio rooms" |
| `AUDIO_MAX_PARTICIPANTS` | 6 | size limit of one audio room; clamped to 6 for the mesh (`RTC_MAX_PEERS` is the legacy alias) |
| `WEBHOOK_ALLOW_PRIVATE` | false | allow webhook endpoints on loopback / private networks (off = SSRF guard) |
| `MCP_ENABLED` | true | the MCP endpoint `POST /mcp` (see `docs/mcp.md`) |
| `MCP_RATE_LIMIT_PER_MINUTE` | 120 | MCP tool calls per token per minute |
| `SCHEMA_INTROSPECT` | true | reverse-engineer a live database (`POST /schema/introspect*`, read-only) |
| `SCHEMA_ALLOW_PRIVATE` | false (true with `AUTH_MODE=none`) | allow introspection targets on loopback / private networks (SSRF guard) |

Invalid configuration aborts startup with a list of every problem.

## Endpoints

All paths below are relative to `API_PREFIX` (default `/api`), e.g. `GET /api/projects`. Only `/healthz` and `/readyz` are at the root.
In dev the Vite server proxies `/api` (incl. WebSockets) to `localhost:3001`, so the frontend is same-origin (cookies + CSRF just work, no CORS).

Errors are always `{ "error": { "code", "message", "details?", "requestId" } }`. Every response carries `x-request-id`.

Ids of projects, folders and files may be **chosen by the client** (`id` in the create body, 6-64 chars of `A-Za-z0-9_-`):
replaying a create with the same id into the same project returns the existing row (200 instead of 201), so an offline queue
can be retried safely; an id used elsewhere is 409 `ID_TAKEN`.

| | |
|---|---|
| `GET /healthz`, `GET /readyz` | liveness; readiness (DB ping, 503 `NOT_READY`) |
| `GET /api/docs` | Swagger UI (`/api/docs/json` = OpenAPI) |
| `GET /auth/config` | `{authMode, allowSignup}` (public) |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | session auth |
| **Projects** | |
| `GET /projects?page&pageSize&q&sort=updated\|name&order` | paginated list (owned + shared) with `fileCount`, `folderCount`, `treeRev` |
| `POST /projects` | `{id?, name?, file?: {id?, name?, data?}, data?}` creates the project **and its first file** -> 201 `{project, file}` |
| `GET /projects/:id` | project meta (`role`, counts, `treeRev`) |
| `PATCH /projects/:id` | `{name}` rename (editor) |
| `DELETE /projects/:id` | owner only; deletes every folder, file, version, member and share |
| `GET /projects/:id/tree` | `{project, treeRev, folders[], files[]}`: file *metadata* only, no documents |
| **Folders** | |
| `POST /projects/:id/folders` | `{id?, name, parentId?, position?}` |
| `PATCH /folders/:id` | `{name?, parentId?, position?}` rename / move; moving into itself or a descendant is 409 `CYCLE` |
| `DELETE /folders/:id` | deletes the subtree; returns `{deletedFolders, deletedFiles}` |
| `POST /folders/:id/duplicate` | deep copy next to the original -> 201 `{folder, folders[], files[]}` |
| **Files** | |
| `POST /projects/:id/files` | `{id?, name, kind?, folderId?, position?, data?}` -> 201 `{file}` (with `ETag`) |
| `GET /files/:id` | `{file}` with its document; `ETag: "<version>"` |
| `PUT /files/:id` | `{name?, data?}`, **requires `If-Match`** (see Concurrency) |
| `PATCH /files/:id` | `{name?, folderId?, position?, kind?}` rename / move. **No `If-Match`: tree operations are last-writer-wins** and do not touch the document version |
| `DELETE /files/:id` | removes versions, overrides and share links with it |
| `POST /files/:id/duplicate` | `{folderId?}` copy (needs project editor); version 1, history reset |
| `PUT /files/:id/thumbnail` | raw `image/png` or `image/webp` body, at most 200 KB (413 above, 415 for other types); editors; the editor uploads it (debounced) after edits |
| `GET /files/:id/thumbnail` | the preview image; needs read access to the file (404 otherwise), `ETag` + `Cache-Control: private`. `thumbnailUrl` of a file is this URL with `?v=<hash prefix>` |
| `GET /files/:id/private` | **my** private stickies of the file `{nodes, edges, updatedAt}` (never anybody else's; any role that can open the file) |
| `PUT /files/:id/private` | replace my private stickies `{nodes, edges}` (editors; at most 500 notes, 10 000 characters each, 1 MB); nodes are stamped `private: true` and `authorId: me` |
| `GET /files/:id/export.sdd` | download one file as `.sdd` |
| `POST /projects/:id/import?folderId=` | multipart `.sdd` (`file`) -> new file in the project (editor) |
| `POST /projects/import` | multipart `.sdd` -> a **new project** with that one file |
| `GET /projects/:id/export` | whole project (folders + files) as a `.sdd` of type `project` (alias `export.sddproj`) |
| `POST /import` | multipart `.sdd` (file, project or text, sniffed) -> a new project (fresh ids everywhere); `POST /projects/import-project` is an alias |
| `GET /files/:id/export?type=file\|text` | the file as a `.sdd` container or as the `#!sdd` text |
| `POST /schema/introspect`, `POST /schema/introspect/sqlite` | read-only live database -> schema model (see `docs/smart-tools.md`) |
| `POST /mcp`, `GET /mcp/audit` | MCP server and its audit trail (see `docs/mcp.md`) |
| **History** | |
| `GET /files/:id/versions`, `GET .../versions/:v`, `POST .../versions/:v/restore` | per-file history |
| **Sharing and members** | |
| `POST/GET /projects/:id/shares`, `DELETE /projects/:id/shares/:shareId` | share links (owner). Body of POST: `{role: viewer\|editor, expiresInSeconds?, fileId?}`: with `fileId` the link covers that one file, without it the whole project |
| `GET /share/:token` | file link: `{share, project, file}`; project link: `{share, project, treeRev, folders[], files[]}` |
| `GET/PUT /share/:token/files/:fileId` | open / save one file through a link (`PUT` needs `If-Match`; editor links only) |
| `PUT /share/:token` | save the file of a file link (`If-Match`) |
| `GET/POST /projects/:id/members`, `PATCH/DELETE /projects/:id/members/:userId` | project members |
| `GET /files/:id/members`, `PUT/DELETE /files/:id/members/:userId` | per-file role override `{role: viewer\|editor}` (owner only) |
| **Other** | |
| `GET /me/prefs`, `PATCH /me/prefs` | per-user JSON; PATCH merges top-level keys (`null` deletes); 64 KB max. The client keeps `ws:<projectId>` = open tabs / starred / recent per project |
| `POST /assets`, `GET /assets/:hash` | upload (auth) / immutable public fetch |
| `GET /ws/files/:id`, `GET /ws/projects/:id`, `GET /ws/files/:id/yjs` | WebSockets (cookie, or `?share=<token>`), see Realtime |
| **Version history (Phase 3)** | |
| `POST /files/:id/versions` | `{name}` "Save version…": names the file as it is now (a live file is snapshotted from the Yjs doc first). Named versions are **never pruned**. Editor role. `GET .../versions` items carry `named` |
| **Comments (Phase 3)** | |
| `GET /files/:id/comments` | `{threads:[{root, replies[]}], unread, readAt}` (any role that can open the file; needs an account) |
| `POST /files/:id/comments` | `{body (<= 4000), anchor?, parentId?}`: a root comment needs `anchor` = `{type:'point',x,y}` or `{type:'node',nodeId,dx,dy}` (the pin follows the node); a reply carries the root's `parentId` (one level). **Commenter role or higher.** `@[Name](user:<id>)` in the body mentions a project member |
| `PATCH /comments/:id` | `{body?}` (author only) and/or `{resolved}` (thread root, commenter+) |
| `DELETE /comments/:id` | author, or a project owner; a root takes its replies with it |
| `POST /files/:id/comments/read` | clears the unread count for you |
| `GET /notifications?unread=1&limit=`, `POST /notifications/read {ids}\|{all:true}` | mentions and replies for the current user |
| **Audio rooms (Phase 3)** | |
| `GET /rtc/config` | `{enabled, maxPeers, iceServers}`; signed-in users and share-link holders only (it may carry TURN credentials) |

### File data

A file's `data` is the frontend's "Project v2" document (`version: 2`, `activePageId`, `pages[]` with nodes/edges/viewport/
settings/flow, optional `settings`, `assets`), validated by `server/src/schema/project.ts` (a copy of the frontend rules;
unknown keys are preserved). `id`, `name`, timestamps inside `data` are overwritten by the server (the file's id and name).
Responses: `{file: {id, projectId, folderId, name, kind, position, version, pageCount, thumbnailUrl, createdAt, updatedAt,
updatedBy, role, data}}`. Renames go through `name` / `PATCH`, never through the document, so a stale document can not
undo a rename made in the tree.

### Concurrency

`PUT /files/:id` needs `If-Match: "<version>"` (bare/weak forms accepted). Missing -> 412 `IF_MATCH_REQUIRED`; stale -> 412
`VERSION_CONFLICT` with `details.currentVersion` and the current `ETag`. The check is a conditional `UPDATE`, so racing writers
cannot both win. Only the **file document** is versioned. Tree operations (create, rename, move, delete, reorder) are
last-writer-wins and each bumps `projects.treeRev`; clients reconcile by pulling `GET /projects/:id/tree` (see
`docs/api-client.md`).

## Auth model

* Email + password (argon2id). The first registered user is admin. `ALLOW_SIGNUP=false` blocks registration (use `npm run seed`).
* Session: random token in cookie `sdd_session` (httpOnly, SameSite=Lax, Secure in production). Only an HMAC of it is stored.
  Sessions expire (`SESSION_TTL_DAYS`) and rotate after `SESSION_ROTATE_SECONDS` (old one lingers `..._GRACE_SECONDS` for parallel requests).
* CSRF: unsafe methods with a session cookie need `X-CSRF-Token` equal to the `sdd_csrf` cookie **and** the token stored in the
  session (returned by register/login/me). Additionally any unsafe request with an `Origin` header must be same-origin or in `CORS_ORIGINS`.
  Share-token and login/register routes do not use the double-submit.
* Rate limit on login/register; identical error for unknown user vs wrong password.
* `AUTH_MODE=none`: an admin `local@localhost` user is created automatically; no cookies, no CSRF; register/login are 404.
  Only use behind a trusted network.
* Roles: `viewer` < `editor` < `owner`, granted **per project**. Original owner is immutable; member-role `owner` is a
  co-owner. Editors change the tree and save files, owners delete the project, share and manage members. Anything you cannot
  access returns 404 (not 403).
* Roles are `viewer` < `commenter` < `editor` < `owner`. A **commenter** can comment and reply but not edit. The per-file override and share links accept all of `viewer | commenter | editor`.
* **Per-file override**: `file_members` can set `viewer`, `commenter` or `editor` for one member on one file (raise a viewer to editor
  on a single file, or lock an editor to read-only there). Owners cannot be overridden. File routes use the effective role;
  tree routes (folders, create / move / delete files, duplicate, import) use the project role. Removing a member drops their overrides.

## Sharing

`POST /projects/:id/shares {role: viewer|editor, expiresInSeconds?, fileId?}` returns a 128-bit token **once** (only its sha256
is stored). With `fileId` the link covers that file only (`fileId` must belong to the project); without it the link covers the
whole project: `GET /share/:token` then returns the tree, and files are opened / saved with `/share/:token/files/:fileId`.
`x-share-token` also works on `GET/PUT /files/:id` and the export routes (a project link for any file of its project, a file
link for exactly its file) and, for **project** links only, on `GET /projects/:id[/tree]` and `export.sddproj`. A file link
never reaches tree routes. Expired -> 410 `SHARE_EXPIRED`; revoked/unknown -> 404. Deleting a file revokes its file links.

## .sdd import / export

One extension, three content kinds, told apart by **content sniffing** (`server/src/sdd/sniff.ts`); the full spec is `docs/sdd-format.md`.

* `POST /import` (multipart `file`, session or token): ZIP of `manifest.type` `file` (one canvas) -> a new project with one file; type `project` (or the legacy `.sddproj`) -> a new project with its folders and files; text starting with `#!sdd` (or a legacy `.sddt`) -> a new project with one laid-out file. Response `{ kind: 'file'|'text'|'project', project, file | files + folders, warnings }`. 422 `SDD_INVALID` with `details.reason` / `details.entry` for anything else (a text syntax error names the line).
* `POST /projects/:id/import` adds a file container or text as a file (optional `?folderId=`); a project container is refused there (use `/import`). `POST /projects/import` and `POST /projects/import-project` remain as aliases.
* `GET /files/:id/export?type=file|text` (ZIP container, or the `#!sdd` text of the active page, MIME `text/vnd.sdd`) and `GET /projects/:id/export` (project container). `export.sdd` / `export.sddproj` remain as aliases that now write the new format.

Limits (all kinds): `MAX_SDD_MB`, `MAX_SDD_UNCOMPRESSED_MB`, 2000 entries; rejected (422): path traversal, oversized or too many entries, zip bombs (declared size over the budget or lying headers), wrong / compressed / non-first mimetype, bad checksum, asset hash mismatch, SVG assets with scripts, schema errors, more than 500 files / 1000 folders, unknown parents, folder cycles, duplicate ids, nesting deeper than 64, newer format. A project container applies the limits to the outer archive and to every nested file under one shared budget. `source.sdd` entries are informational (JSON wins, with a warning). Ids in an archive are never trusted: the import assigns fresh ids. Fixtures: `server/tests/fixtures/*.sdd` (legacy, no `type`), `server/tests/sddunified.test.ts`.

## Version history

Every file save (including restore, import, duplicate) writes a snapshot in `file_versions`. Pruning keeps the newest
`VERSIONS_KEEP_LAST` (50) plus the newest snapshot per UTC day for `VERSIONS_KEEP_DAYS` (30). Restore creates a **new**
version. Renames and moves in the tree do not create versions.

## Assets

Uploads: png/jpeg/webp/svg, max 5 MB, type sniffed from bytes. SVG is sanitized (scripts, handlers, foreignObject, `<style>`,
external refs and non-raster data URIs removed; root rebuilt from a whitelist). Stored content-addressed by sha256 of the stored
bytes (dedupe), served at `/assets/<hash>` with `Cache-Control: public, max-age=31536000, immutable`, `nosniff`, and a
sandboxing CSP for SVG. Drivers: local disk (`STORAGE_DIR`) or S3-compatible (MinIO etc.).

## Realtime

Three WebSocket channels (cookie auth, or `?share=<token>`; Origin checked):

### JSON channels (`GET /ws/files/:id`, `GET /ws/projects/:id`)

JSON messages, client -> server `ping` => `pong`:

* `GET /ws/files/:id`, one open file
  * `hello {clientId, scope:'file', projectId, fileId, version, role}` on connect (`role` = effective role on that file)
  * `presence {fileId, projectId, users:[{clientId, userId|null, name, role, fileId}]}`: who has THIS file open
  * `file.updated {projectId, fileId, version, name, kind, updatedAt, by:{userId,name}|{share:true}|{collab:true}, restored?, collab?}` after every save / restore / materialization
  * `comment.created|comment.updated {fileId, comment}`, `comment.deleted {fileId, commentId}`; `notification {notification}` to the mentioned / replied-to user (on any of their channels)
  * audio room signaling `rtc.*` (below)
* `GET /ws/projects/:id`, the project tree (needs a project link or membership; file links are refused)
  * `hello {clientId, scope:'project', projectId, treeRev, role}`
  * `presence {projectId, users:[{clientId, userId, name, role, fileId}]}`: everybody who has a file of the project open (drives the dots in the file list)
  * `tree.updated {projectId, rev, reason, folderId?|fileId?, by}` after every create / move / rename / delete (`rev` = new `treeRev`)
  * `file.updated` for every file save

Send the `clientId` as `X-Client-Id` on writes; that connection is excluded from the broadcast. Deleting a file closes its
channel with code 4404.

### Live co-editing: `GET /ws/files/:id/yjs` (Yjs, y-websocket protocol)

Binary messages: `0` sync (step 1 / 2 / update, `y-protocols/sync`), `1` awareness (`y-protocols/awareness`), `2` permission
denied (server -> client, a string reason). Auth is the JSON channel's; the effective role decides: **viewer and commenter read
and show their cursor but every update they send is dropped (and reported with message 2)**, editor / owner (and a share-link
editor token) write. Anonymous is 401, a stranger or a file link for another file is 404.

* **Document layout** (one per file = one canvas; `src/collab/yproject.ts`, a byte-identical copy lives in `server/src/collab/`, a test keeps them equal):
  `meta` (name, createdAt, pageId, pageName, flow, viewport seed, settings, assets), `nodes` / `edges` (page 1; pages 2..n live in `pages` (id -> Y.Map with the same fields) ordered by `pageOrder`, added to docs persisted before by `addMissingPages` on first load; the browser binding reads and writes page 1 only, the server writes all pages) (`Y.Map` id -> `Y.Map` of fields, `data` a nested `Y.Map`), `nodeOrder` / `edgeOrder` (`Y.Array` of ids = z-order; reads de-duplicate). Writes are field-level diffs, so two people editing different nodes, or different fields of one node, merge.
* **Seeding**: a file that was never shared live is seeded **once, on the server**, from its JSON `data` (the client never seeds a doc that has a server), then persisted at once.
* **Persistence**: every update is batched (`COLLAB_PERSIST_MS`) into `file_yupdates (file_id, seq, data base64)`; every `COLLAB_COMPACT_AFTER` rows (and when the last client leaves) the state is folded into `file_ydocs (file_id, snapshot base64, seq)` and the folded rows are deleted. A room loads snapshot + later updates.
* **Materialization**: a debounced (`COLLAB_MATERIALIZE_MS`, never later than 5x that after the first unsaved edit) copy of the doc is written to `files.data` with `version + 1`, so `GET /files/:id`, the ETag, export, `.sdd` and the REST `If-Match` path keep working. The `files` row stays the authority for the **name** (`PATCH` renames are pushed into the live doc). Snapshots in `file_versions` are created at most every `COLLAB_VERSION_INTERVAL_SECONDS`, when the last editor leaves, and on "Save version…" ("versions from snapshots").
* **REST writes on a live file** (`PUT /files/:id`, restore, import-replace) are applied to the live doc as a diff (every connected client sees them); with no room open the stored Yjs state is dropped and re-seeded from the JSON on the next open.
* **Awareness** is relayed to the others; the server **overwrites `user.name` / `user.id`** of every awareness state with the authenticated identity (a client cannot impersonate another person) and drops states over 4 KB. A connection's states are removed when it closes.
* The websocket `maxPayload` is raised to `MAX_PROJECT_MB` (a sync message can carry a whole document). Deleting a file / project closes its room (4404) and deletes its Yjs rows.

### Audio rooms (WebRTC) signaling

Messages on the **file channel** (`src/services/rtc.ts`). The server never touches media: it keeps who is in the call of each file,
forwards offer / answer / ice **only between members of the same room**, and relays tiny mute / speaking flags.

* client -> server: `rtc.join`, `rtc.leave`, `rtc.signal {to, kind: offer|answer|ice, data}` (<= 16 KB), `rtc.state {muted, speaking}`
* server -> client: `rtc.joined {peers}` (to the joiner: who is already in), `rtc.peer-joined {peer}`, `rtc.peer-left {clientId}`, `rtc.signal {from, kind, data}` (the server stamps the real sender), `rtc.state {from, muted, speaking}`, `rtc.full {max}`, and `rtc.roster {peers}` to **everybody** on the file channel (so people see "3 in audio" before they join)
* a socket that closes leaves the call; an empty room is removed. Everybody who can open the file can join (viewers too).

**Mesh and its limit.** The browser side is a full mesh (every participant holds one `RTCPeerConnection` to every other, the joiner
offers to the people already there); `AUDIO_MAX_PARTICIPANTS` (default and maximum 6) refuses the next one with `rtc.full` (`code: "room_full"`). Upstream bandwidth and CPU grow
with the number of participants, so **more than ~6 people need an SFU** such as [LiveKit](https://livekit.io) (self-hostable): the
client talks to it through the `RtcProvider` interface (`src/rtc/provider.ts`, `mesh` implemented, an `sfu` implementation can be
returned from `createRtcProvider`); the server would mint a join token instead of relaying SDP.

**STUN / TURN.** `GET /rtc/config` returns `ICE_SERVERS`. STUN alone connects most home / office networks; symmetric NATs and
many corporate networks need a **TURN** relay: run [coturn](https://github.com/coturn/coturn) (`turnserver --lt-cred-mech --realm example.org -u user:pass`,
open 3478 udp+tcp and the relay port range, add TLS on 5349 for `turns:`) and set
`ICE_SERVERS='[{"urls":"stun:turn.example.org:3478"},{"urls":["turn:turn.example.org:3478","turns:turn.example.org:5349"],"username":"user","credential":"pass"}]'`.
The credentials reach every signed-in user: use a dedicated low-privilege TURN user (ephemeral REST-API credentials are not implemented).

**Multi-instance fan-out** is still in-process (the hub, the Yjs rooms and the audio rooms live in one Node process); scaling out
needs sticky routing per file or a Redis / PG LISTEN bridge.

### Private stickies

A sticky with `data.private: true` is **not** part of the shared document. Each user keeps theirs in `file_private (file_id, user_id, data, updated_at)` (JSON `{nodes, edges}`; migration `0005`), read and written only through `/files/:id/private` for the authenticated user. The editor (`src/sync/privateSync.ts`) keeps them out of the Yjs doc (`StoreBinding`) and out of REST saves, and mirrors them into the editor store. On the server:

* every REST write (`PUT`, restore, import, MCP), every file creation and every materialization of a live room runs `scrubPrivate`: private stickies and the edges attached to them are removed from the document (every page) and merged into the author's slot (`authorId` when that is a user, else the writer, else the project owner);
* a live write that carries one (an old client, a hand-made update; detected in the Yjs update) is **not relayed**: the server removes the notes from the doc, files them under the writer and relays only the clean remainder, so no other client receives the text; viewers' writes are dropped as before;
* boot migration `migratePrivateStickies` scrubs stored `files.data`, every `file_versions.data` and forgets the stored Yjs state of touched files (they re-seed from the scrubbed JSON);
* deleting a file deletes the rows.

Limits: the server can only protect what reaches it. Text that an old client already put in the shared doc exists on the server for a moment before it is removed and in the writer's own client; someone who has an old export or version download from before the migration still has it; a database or backup administrator can read `file_private`; local-only projects (no server) keep private stickies inside the local document, as before; notes made while offline sync on the next open, and with two devices offline the last upload wins.

## Project library (components, styles, tokens)

Phase 5 adds project-level design assets shared by every file of a project: reusable **components**, colour / text / effect **styles** and light / dark **theme tokens**. They are one JSON document per project in `project_library (project_id, rev, data, updated_at, updated_by)`, validated by `server/src/schema/library.ts` (2 MB cap; unknown keys are kept).

| method and path | role | what |
|---|---|---|
| `GET /projects/:id/library` | viewer or any member | `{ rev, doc }`. Never saved: `rev` 0 and an empty doc |
| `PUT /projects/:id/library` | editor | body `{ baseRev, doc }`. `baseRev` must be the current `rev` (optimistic): 200 `{ rev, doc }` with `rev + 1`, else **409** `{ error, rev, doc }` carrying the current document so the client can merge and retry |

A save sends `{ "type": "library.updated", "projectId", "rev", "by" }` on the project WebSocket (`GET /ws/projects/:id`, the channel that carries `tree.updated`; the saver's own connection, identified by `x-client-id`, is skipped); clients then pull the library. It also queues the `library.updated` webhook. Deleting the project deletes its library.

`doc` shape: `components: { [id]: { id, name, rev, width, height, mainFileId?, mainNodeId?, nodes: [{ key, type, x, y, width?, height?, parentKey?, data }], edges?: [{ key, source, target, data?, label? }] } }`, `styles: { colors: { [id]: { id, name, value, dark? } }, texts: { [id]: { id, name, fontSize?, bold?, align?, color? } }, effects: { [id]: { id, name, shadow: { x, y, blur, color } | null } } }`, `tokens: { [id]: { id, name, light, dark } }`.

## Personal access tokens

For scripts and integrations. Create them in a browser session (a token can not create, list or revoke tokens, and can not use the cookie API at all):

| method and path | what |
|---|---|
| `POST /tokens` | `{ name, scopes[], expiresInDays? }` -> 201 `{ token, item }`. The secret `sdd_pat_<32 url-safe chars>` is **shown once**; only its sha256 is stored (plus the first 8 characters for the list) |
| `GET /tokens` | your active tokens: `id, name, prefix, scopes, expiresAt, lastUsedAt, createdAt` |
| `DELETE /tokens/:id` | revoke (204) |

Send it as `Authorization: Bearer sdd_pat_...`. The request is authenticated as the token owner (no cookie, no CSRF token) and the **owner's project role still applies** on top of the token scope: a token of a viewer can not write, a token of a non-member gets 404. An unknown, expired or revoked token is **401** `INVALID_TOKEN`; a token without the scope the route needs is **403** `TOKEN_SCOPE` (`details.required`). Routes that declare no scope (everything not in the table below) are session only and answer 403 to tokens. `last_used_at` is updated at most once a minute.

| scope | allows |
|---|---|
| `projects:read` | `GET /v1/projects` |
| `files:read` | `GET /v1/projects/:id/files`, `GET /v1/files/:id` |
| `files:write` | `PUT /v1/files/:id` |
| `library:read` | `GET /v1/projects/:id/library`, `GET /projects/:id/library` |
| `library:write` | `PUT /projects/:id/library` |
| `webhooks:manage` | the webhook endpoints below |

Scopes are independent (`files:write` does not imply `files:read`).

## Public REST API (`/v1`)

Under `API_PREFIX`, e.g. `GET /api/v1/projects`. Interactive docs: `/api/docs` (section "public api v1"). A session cookie works too; everything below is also reachable with a token holding the scope.

| request | scope | result |
|---|---|---|
| `GET /v1/projects` | `projects:read` | `{ items: [{ id, name, role, treeRev, updatedAt, ... }] }` of the projects you own or are a member of |
| `GET /v1/projects/:id/files` | `files:read` | `{ items }` file metadata (`id, name, kind, version, updatedAt, ...`), no documents |
| `GET /v1/files/:id` | `files:read` | `{ file }` with the full `data` document; `ETag` is the version |
| `PUT /v1/files/:id` | `files:write` | body `{ data }` (the Project v2 document, validated by the same zod schema as the editor: 400 with the issues otherwise). **`If-Match: "<version>"` is required**: 412 `IF_MATCH_REQUIRED` / `VERSION_CONFLICT` (the current version is in the `ETag`). 200 `{ file }` with version + 1; a history snapshot is created, open editors get `file.updated` over the WebSocket and live (Yjs) rooms receive the change as a diff, and the `file.updated` webhook fires |
| `GET /v1/projects/:id/library` | `library:read` | `{ rev, doc }` |

## Webhooks

Outgoing HTTP callbacks on changes. Manage them as a project editor or owner in a session, or with a token holding `webhooks:manage`:

| request | what |
|---|---|
| `POST /projects/:id/webhooks` | `{ url, events[] }` -> 201 `{ webhook, secret }`. The signing secret `whsec_...` is generated by the server and **shown once** |
| `GET /projects/:id/webhooks` | the endpoints (no secrets) |
| `PATCH /projects/:id/webhooks/:wid` | `{ url?, events?, active? }` |
| `DELETE /projects/:id/webhooks/:wid` | delete the endpoint and its delivery log |
| `GET /projects/:id/webhooks/:wid/deliveries` | the last 50 deliveries: `status` (`pending` / `ok` / `failed`), `attempt`, `responseCode`, `error`, `nextAttemptAt` |
| `POST /projects/:id/webhooks/:wid/test` | sends a signed `ping` now (one attempt, no retries) and returns `{ delivery }` |

Events: `file.created`, `file.updated` (REST saves, live co-editing materialization, restore), `file.deleted`, `library.updated`. Request: `POST <url>` with `Content-Type: application/json` and the body

```json
{ "id": "evt_...", "event": "file.updated", "projectId": "prj_...", "fileId": "fil_...", "version": 12, "at": "2026-10-27T10:00:00.000Z", "data": { "name": "Overview", "kind": "sdd" } }
```

Headers: `X-SDD-Event`, `X-SDD-Delivery` (the delivery id, stable across retries: use it to de-duplicate), `X-SDD-Timestamp` (unix seconds, set on every attempt) and `X-SDD-Signature: sha256=<hex>` where hex = HMAC-SHA256(secret, `<timestamp>.<raw body>`). Verify it against the **raw** body and reject old timestamps:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
function verify(secret, headers, rawBody) {
  const ts = Number(headers['x-sdd-timestamp']);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false; // replay window
  const want = Buffer.from('sha256=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex'));
  const got = Buffer.from(headers['x-sdd-signature'] ?? '');
  return want.length === got.length && timingSafeEqual(want, got);
}
```

Delivery: a background tick (every 5 s, plus right after an event) sends due deliveries with a 5 s timeout and no redirects. 2xx = delivered. **5xx, 429, 408, timeouts and network errors are retried**; any other 4xx (and 3xx) fails at once.

| after attempt | wait before the next | |
|---|---|---|
| 1 | 10 s | retry 1 |
| 2 | 1 min | retry 2 |
| 3 | 6 min | retry 3 |
| 4 | 36 min | retry 4 |
| 5 | | status `failed` |

(5 attempts in total: the first one plus 4 retries, `MAX_ATTEMPTS` in `services/webhooks.ts`; exponential backoff, x6 per step, and every wait gets +-20% jitter.) Only the delivery log survives restarts: pending rows are picked up again after a restart.

**SSRF guard.** Only `http:` / `https:` URLs without credentials; loopback, private (10/8, 172.16/12, 192.168/16, 100.64/10), link-local (169.254/16 incl. cloud metadata), multicast, unique-local / link-local IPv6, IPv4-mapped IPv6 and `localhost` / `.local` / `.internal` names are refused when the webhook is created or changed **and again at every send** (the host name is resolved and every address must be public, which also stops DNS rebinding). Set `WEBHOOK_ALLOW_PRIVATE=true` to allow internal endpoints (self-hosted setups that post to a service on the same network).

## Schema v8

`CURRENT_SCHEMA` is 8. v8 (smart tooling) adds node `data.capacity` and edge `data.traffic` (capacity and latency calculator inputs, validated with non-negative numbers, `writeRatio` in 0..1; unknown keys kept); the 7 -> 8 migration only bumps the version. They sync inside the node's / edge's Yjs data (one atomic value per object), see `server/tests/schema8.test.ts`.

## Schema v7

`CURRENT_SCHEMA` was 7 before v8. v7 adds the design-tool node fields (`hidden`, `instance`, `instKey`, `componentMain`, `autoLayout`, `layoutSizing`, `constraints`, `link`, `styles`, `source`) and the page field `guides`. The 6 -> 7 migration only bumps the version (all additive); v1 to v6 files and documents open unchanged, a newer file is refused. Field list: `docs/sdd-format.md` "Design node data (schema v7)". In live files the node fields sync inside the node's Yjs data map and `guides` as one atomic `meta.guides` value (`src/collab/yproject.ts`, mirrored in `server/src/collab/yproject.ts`).

## Known gaps

live co-editing is single-process; the PG path is untested in CI (SQLite only; the PostgreSQL migration is only checked to stay in step with the SQLite one); S3 driver
untested against a live bucket; no email verification / password reset / admin UI; no session listing; single-process realtime;
imported SVG assets are rejected if unsafe but not rewritten; file saves are whole-document JSON (no patch API); tree operations
are last-writer-wins (two people renaming the same file at once: the last request wins, there is no merge); per-file overrides
cannot hide a file from the tree; a project container is built in memory (limited by `MAX_SDD_MB`). Library saves are whole-document with a revision check (no merge on the server); webhook delivery runs in one process (a second instance would double-send; there is no delivery leasing); tokens can be limited to projects (`projectIds`) and the owner's roles always apply; webhook secrets are stored in plaintext (they must be readable to sign).

## MCP server and schema tools

* **MCP** (`POST /mcp`, stdio bridge `dist/mcp/stdio.js`): tools, scopes, rate limit and the `mcp_audit` table are in `docs/mcp.md`. Tokens accept an optional `projectIds` list (`POST /tokens`), enforced for the REST API too (a limited token gets 404 for other projects). `GET /mcp/audit` is the session-only audit trail. Migration `0004_mcp` (SQLite and PostgreSQL): `mcp_audit` and `access_tokens.project_ids`.
* **Schema tools** (`POST /schema/introspect`, `POST /schema/introspect/sqlite`): `docs/smart-tools.md` "Schema tools". Session only, 10 requests a minute per client.
