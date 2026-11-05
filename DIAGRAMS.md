# Diagrams in iBlog

The diagram editor (`editor/`, a React app that lives inside this project) runs inside this site as one product: same navbar, same session, same
palette. The blog's own pages are untouched; the only changes to them are the **Diagrams** link and the chevron menu next to
**Write** (New story / System design / DB diagram / OOD diagram).

## Routes (`src/app/router.tsx`)

| Route | Page | Auth |
| --- | --- | --- |
| `/d` | my projects dashboard (`contexts/diagrams/ui/Dashboard.tsx`) | signed in |
| `/d/p/$projectId` | project tree: folders and files (`ProjectTree.tsx`) | signed in |
| `/d/f/$fileId` | the editor (`EditorHost.tsx`, lazy) | signed in (prompt otherwise) |
| `/d/s/$token` | a share link in the editor | none |
| `/d/v/$slug` | a published diagram, read-only viewer (`PublicViewer.tsx`; editor prop `slug`) | none |
| `/templates` | template gallery, "Use template" forks and opens `/d/f/{fileId}` (`Templates.tsx`) | none to browse, sign-in to use |

`/d` has an **Import .sdd** button: a hidden file input (`.sdd,.sddproj,.sddt`) uploads multipart `file` to `POST /api/diagrams/import` (`diagramRepository.importSdd`, 120 s timeout; the shared HTTP client sends `FormData` as is). 201 `kind: file|text` opens `/d/f/{file.id}`, `kind: project` opens `/d/p/{project.id}`; warnings show as a toast; 422 `SDD_INVALID` toasts its `details.reason`.

Editor routes (`/d/f/*`, `/d/s/*`) drop the starfield and footer: the editor fills the window under the top bar.

## How the editor is consumed

**Vite alias, no package.** `vite.config.ts` (and `vitest.config.ts`) alias `@diagram-editor` to `editor/src/embed.tsx`
`@diagram-starter` to `editor/src/embed/starter.ts` (starting documents, see below) and `@core` to `editor/core` (pure TypeScript core of the editor: parsers, lint, layout). The editor is an app, not a library, so an alias gives one Vite graph, one HMR loop and one React. Consequences:

- `editor/` is part of this project: its dependencies (yjs, mqtt, @xyflow/react, zustand, codemirror ...) are in `package.json` and
  `bun.lock`, one copy each; `bun install` here is all that is needed. `editor/package.json` is only metadata (the app version read by
  the editor), not a workspace. Biome and the root `tsc` skip `editor/` (it keeps its own formatting and compiler settings,
  `editor/tsconfig.json`).
- Tests: `bun run test` runs the blog tests and then the editor's (`bun run test:editor`, vitest with `editor/vitest.config.ts`,
  run from inside `editor/` because some tests read fixtures by relative path).
- `resolve.dedupe: ["react", "react-dom"]` makes the editor use this project's React.
- `three` is the site's version (0.186); the editor only uses it on its standalone landing page, which the embed never loads.
- Types: `src/contexts/diagrams/diagram-editor.d.ts` declares the module by hand, so `tsc` here never type-checks the editor's
  ~78k lines under this project's stricter options. Keep it in step with `DiagramEditorProps` in `editor/src/embed.tsx`;
  `bun run typecheck:editor` (`type-tests/`, run in CI) fails when they diverge.
- Code splitting: `EditorHost` loads the editor with `React.lazy(() => import("@diagram-editor"))`. Everything of the editor
  (code, its CSS, yjs, xyflow, three ...) is in separate chunks fetched only on `/d/f/*` and `/d/s/*`.

## CSS isolation (`vite/scopeDiagramCss.ts`)

The editor ships global CSS (`html, body`, `*`, `button`, `:root { --accent }`, `@keyframes pop-in` and `shimmer`, which
collide with this site's). A build-time plugin rewrites every stylesheet from the editor's tree to live under `.sdd-root`
(`:root/html/body` become the root, everything else is prefixed) and renames its keyframes to `sdd-*`. Nothing of the
editor can restyle a blog page. `editor/src/embed/theme.css` then maps the editor's tokens onto this site's variables
(`--surface`, `--fg`, `--line`, `--accent`, fonts, radii ...), so light/dark and every reading palette carry over; it also
restores browser defaults that Tailwind's reset removed and the editor assumed.

## Session and theme

`EditorHost` passes the bearer token (`getAuthHeaders`), the signed-in user, the theme (`useDark()`), and callbacks:
`onNavigate` (editor moves become router navigations), `onUnauthorized` (one token refresh through the shared HTTP client,
then the sign-in dialog). The editor has no login screens or account menu when embedded.

## What the Go API serves, and what the embed uses

`EMBED_FEATURES` (`editor/src/embed.tsx`) is on for everything `/api/diagrams` serves: projects, folders, files, tree,
versions, prefs, **members** (project and per-file), **share links** (`/share/{token}`, `/share/{token}/files/{id}`), **private
stickies**, the **project library** and **thumbnails**. Differences from the Node server the client adapts to:

- Library conflict is **412** `LIBRARY_CONFLICT` (Node: 409); `LibrarySync` treats both as "pull, merge per id, retry".
- Roles are `viewer | commenter | editor` (+ `owner` on the original owner, read only). The role picker does not offer `owner`
  when embedded (the API refuses it).
- User ids are decimal strings on the API; Web's are numbers. `EmbedUser.id` takes either and is normalized with `String`
  before any comparison (session, members, presence).
- Images: PNG, JPEG, WebP only. The editor's icon upload rejects SVG (and GIF) client-side with a clear message and no longer
  offers them in the file picker (`setAllowedIconMimes`, `editor/src/lib/sdd/assets.ts`).
- Share links: the host owns the address. `EditorHost` passes `shareUrl` so "Create link" shows `/d/s/{token}`, not the API URL.
  `/d/s/$token` opens without any session header (a stale bearer must not turn a valid link into a 401).

**Comments** are on (`/files/{id}/comments`, roles viewer < commenter < editor < owner; a commenter can comment and resolve but the
canvas is read-only for them; `@` autocomplete reads the project members). They arrive live: `comment.created|updated` (with
`comment`) and `comment.deleted` (with `commentId`) ride the file's MQTT events topic. `editor/src/comments/poll.ts` (the old 20 s polling stand-in) is no longer called by anything; delete it with `poll.test.tsx`. Diagram notifications (`diagram_mention|reply|comment`, with `diagram_project_id`,
`diagram_file_id`, `diagram_comment_id`, `text`) appear on `/me/notifications` as links to `/d/f/{fileId}?comment={commentId}`;
`EditorHost` passes `commentId` to the editor, which opens that thread. Blog notifications stay on the blog's own SSE.

## Realtime (MQTT, co-editing, audio rooms)

`EMBED_FEATURES` has `realtime`, `collab` and `rtc` on. The realtime channels run over MQTT 5 (mqtt.js over WebSocket, EMQX); the
protocol is `Backend/docs/MQTT.md`. The old `/ws/*` WebSocket routes are gone. The editor asks `GET /api/diagrams/realtime/config` for the
path (`/mqtt`) and connects to `ws(s)://<this host>/mqtt`; one connection per open file (events, roster with a Last Will, Yjs, awareness,
audio signaling) plus one for the open project's tree. Still REST: `PUT /files/{id}/ydoc?seq=N` and `GET /rtc/config`.

- **Proxy.** Same origin, so no CSP change (`connect-src 'self'`). Production: `Web/nginx.conf` `location = /mqtt` proxies the upgrade to
  `${MQTT_URL}` (default `http://emqx:8083`, set in the Dockerfile and the root compose). Dev: `vite.config.ts` proxies `/mqtt` to
  `VITE_MQTT_PROXY` (default `http://localhost:8083`, `ws: true`). **`/api/internal/` (the broker's auth/ACL callbacks) is blocked** in both
  (`location ^~ /api/internal/ { return 404; }`; a Vite proxy entry with `bypass: () => false`), and covered by `vite/proxy.test.ts`.
  The embed prop `mqttUrl` overrides the broker address when the host serves it elsewhere.
- **Tickets.** The MQTT login is `ticket` + a single-use ticket as the password, so `EditorHost` passes `getTicket`
  (= `POST /api/me/stream-ticket`, the same call the notification SSE uses). The editor mints one before **every** connect and reconnect
  (its own reconnect loop with full-jitter backoff; each attempt also gets a new client id `u<userId>.<nonce>`). Share views (`/d/s/*`)
  get no `getTicket`: they log in as `share` + the share token with client id `g.<nonce>`.
- **Materialization.** While a file is edited live the server keeps Yjs updates but does not write `dg_files.data`. An editor that made
  local changes saves the plain document with a debounced (about 1.5 s) `PUT /files/{id}` (`If-Match` = last known version from
  `file.updated`, a REST read after a reconnect and the ETag; `X-Client-Id` = the MQTT client id, so it is not echoed back); on 412 it refetches the
  version and retries. Remote edits and the first seed never trigger a save (`editor/src/sync/materialize.ts`).
- **Compaction.** On `[4][seq]` the provider answers `[3][seq][Y.encodeStateAsUpdate(doc)]` when synced and allowed to write.
- **Control messages.** `ctl` 1012 (a version was restored): the editor clears its IndexedDB copy for the file and starts a fresh session.
  `ctl` 4404 (file deleted) is final: toast plus navigation back to `/d` (the editor reports `{ to: "home" }`).
- Presence avatars (`.presence .avatar`) use this site's avatar style (`editor/src/embed/theme.css`): hairline ring, mono initials,
  corner mark; the per-user colour only tints cursors on the canvas.

Still off: live-database schema import. The editor has no account menu (the host owns sign-in).

## Starting documents

The Write menu creates a project and its first file. A DB diagram starts with one table (`users`), an OOD diagram with one
class (`User`), a system design stays empty. The documents are built by `editor/src/embed/starter.ts` with the editor's own
template pipelines (`parseSql` + `schemaToDiagram`, `modelToDiagram`) and sent as the file's `data`. The module is a separate
alias (`@diagram-starter`) loaded on click, so creating a file does not load the editor.

## Leaving with unsaved changes

`EditorHost` installs a TanStack Router blocker. While the editor holds unsaved work (`hasUnsavedChanges()`, exported from
`embed.tsx`) any navigation away (links, navbar, back button) asks the editor's own dialog (`confirmLeave()`: Save / Leave
without saving / Stay). Moves the editor makes itself (`onNavigate`) already went through that dialog and are not asked again.
The browser's own `beforeunload` prompt is still registered by the editor.

## Docker

The image compiles the editor from `editor/`, so **the build context is `Web/`** and nothing outside it is needed:

```
docker build -t iblog-web Web/                       # or: cd Web && docker build -t iblog-web .
docker compose up -d --build                         # root docker-compose.yml: Backend (included) + Web + Admin
```

`Backend/` and `Admin/` keep their own Dockerfiles and compose files and build standalone as before (`cd Backend && docker compose up`).
Create `Backend/.env` from `.env.example` first. Ports: web 3000 (`WEB_PORT`), admin 3100 (`ADMIN_PORT`), api 8080.

## Publishing

The owner sees a **Publish** button in the editor toolbar (the editor's `hostActions` prop; role `owner` only): visibility
(unlisted | public), title, description, topics, the link and Unpublish (`PublishDialog.tsx`). Published diagrams appear on the
profile (**Diagrams** tab), in search (**Diagrams** section), and in stories: the story editor's **Diagram** button inserts
`::diagram{slug=...}` (my public diagrams, or a pasted `/d/v/slug` link for unlisted ones); the reader shows the server's
`<figure class="diagram-embed">` styled like an image and opens `/d/v/slug` on click.
