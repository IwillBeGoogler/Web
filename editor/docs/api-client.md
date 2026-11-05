# Frontend integration (offline-first sync)

How the app in `src/` talks to the backend described in `docs/backend.md`. Everything works without a server (local mode);
sync is an enhancement. Base URL: same origin `/api` (Vite proxies it in dev, the single container serves both) or
`VITE_API_URL` with the origin listed in the server's `CORS_ORIGINS`. All requests use `fetch(..., {credentials: 'include'})`.

## Model

```
Project > Files          (each file is ONE canvas; no pages and no folders in the UI)
```

A **file** is what used to be a "project with pages": the editor edits exactly one file at a time and a file keeps the
`Project v2` document (`src/types.ts`, one page). A **project** only holds the list of files (the folder tables and endpoints
still exist; the client ignores folders). The one-time local migration `flattenWorkspace` (`src/workspace/flatten.ts`, marker
`sdd:ws:flat`) splits every multi-page file into one file per page (`<file> — <page>`, the original id keeps the first page) and
flattens folders (the folder path is prefixed only on a name clash); server-backed projects are migrated by the server and pulled
by the next sync. Importing a multi-page document (`importOpenedFile`) also yields one file per page. Ids are generated on the client
(`prj_…`, `fld_…`, `fil_…`) and kept by the server, so uploading never re-keys anything.

| layer | where | what |
|---|---|---|
| API client | `src/api/client.ts`, `api.ts`, `types.ts` | fetch wrapper (cookies, CSRF, `If-Match`, typed errors, retry) and the typed endpoints |
| Session | `src/api/session.ts` | `GET /auth/config` + `/auth/me` decide `local` / `server` mode and whether a login is needed |
| Local storage layout | `src/workspace/storage.ts` | projects, trees, file documents, versioned migration |
| Tree operations | `src/workspace/tree.ts`, `dnd.ts`, `nav.ts`, `tabs.ts` | pure, tested logic (create, move with cycle check, delete, duplicate, ordering, drop zones, keyboard navigation, tab state) |
| Workspace state | `src/workspace/store.ts`, `actions.ts`, `useWorkspaceRoute.ts` | the open project, tabs, explorer state, route handling |
| File sync | `src/sync/engine.ts`, `useProjectSync.ts` | one engine for the open file: debounced `If-Match` saves, offline queue, 412 conflict modal |
| Tree sync | `src/sync/treeSync.ts`, `treeRuntime.ts` | queued tree operations, replay, reconcile |
| Project channel | `src/sync/useProjectChannel.ts`, `realtime.ts` | WebSocket for tree events and who-has-which-file-open |
| Live co-editing (Phase 3) | `src/collab/*`, `src/sync/collabRuntime.ts` | Yjs doc per file, store binding, provider, session, presence (see below) |
| Comments (Phase 3) | `src/comments/*`, `src/components/collab/Comment*.tsx` | threads, pins, @mentions, notifications |
| Audio rooms (Phase 3) | `src/rtc/*`, `src/components/collab/AudioControls.tsx` | `RtcProvider`, mesh peer manager, speaking meter, push-to-talk |
| Version compare (Phase 3) | `src/lib/versionDiff.ts`, `src/versions/diffStore.ts` | pure diff + canvas overlay |

## Bootstrapping

1. `GET /auth/config` -> `{authMode, allowSignup}`. Any failure (network, a non-JSON SPA fallback) means **local mode**. If
   `authMode === 'none'`, skip the login.
2. `GET /auth/me` -> 200 `{user, csrfToken}` or 401 -> show `/login`. The CSRF token is kept in memory and sent as
   `X-CSRF-Token` on every non-GET request (it is also in the `sdd_csrf` cookie). A 403 `CSRF_INVALID` refreshes it once.
3. Routes: `/projects` (list), `/p/:projectId` (workspace: opens the last active tab, else the first file),
   `/p/:projectId/f/:fileId` (a file), `/s/:token` (share link), `/login`, `/register`. Protected routes redirect anonymous
   visitors to `/login?next=…` when the server wants a session.

Error handling: `{error:{code,message,details}}` becomes `ApiError`. 401 -> re-login; 429 -> back off with `Retry-After`;
network / 5xx -> exponential backoff and the data stays local. Only idempotent requests (and creates that carry a client
id) are retried automatically.

## Local storage layout (version 2)

| key | content |
|---|---|
| `sdd:ws:version` | `2` once the migration ran |
| `sdd:ws:projects` | `[{id, name, createdAt, updatedAt}]` |
| `sdd:ws:tree:<projectId>` | `{folders:[{id,parentId,name,position}], files:[{id,folderId,name,kind,position,pageCount,…}]}` |
| `sdd:project:<fileId>`, `sdd:index` | the file documents (`Project v2`) and their index |
| `sdd:sync:<fileId>`, `sdd:sync:index` | per-file sync metadata `{baseVersion, dirty, pending, role, …}` (present = server backed) |
| `sdd:ws:pmeta:<projectId>` | `{serverBacked, role, treeRev, lastSyncedAt}`: the project's tree is mirrored to the server |
| `sdd:ws:q:<projectId>` | the queue of unsent tree operations |
| `sdd:ws:view:<userKey>:<projectId>` | open tabs, active tab, closed stack, expanded folders, starred, recent (per user) |
| `sdd:ws:aliases` | legacy project id -> `{projectId, fileId}` |

### Migration (local)

`migrateToWorkspace` runs once at start-up (`ensureWorkspace`), is versioned, idempotent and safe to interrupt (the marker is
written last). Every legacy project becomes a project with the **same id and name** containing one file `fil_<id>` with the same
pages; the document, its sync metadata and the sync index are re-keyed to the file id; the old single-diagram autosave is adopted
first. `/p/<old id>` therefore still opens (the project, then its only file at `/p/<old id>/f/fil_<old id>`), and
a file id used where a project id belongs redirects to the file route. The server migration (`0001_workspace`) uses the same ids,
so an already synced legacy project lines up on both sides without contacting the server.

## File sync loop (the open file)

* Local edits mark the file `dirty` in its sync metadata and are written to localStorage right away (debounced autosave,
  flushed before a tab switch and on `pagehide`).
* Debounce (~1 s idle, and on tab hide / `pagehide`) -> `PUT /files/:id` with `{name, data}` and `If-Match: "<baseVersion>"`,
  header `X-Client-Id: <ws clientId>`. On 200 store `file.version` as `baseVersion`; clear `dirty` if no newer edit happened meanwhile.
* **Pan / zoom is not an edit** for the server: viewport-only changes are stored locally and ride along with the next real edit.
* Offline: only the latest whole-file state is kept; it is flushed on the `online` event, with exponential backoff on errors.
* Editing a file while another tab is shown: each tab keeps its own editor state (document, undo history, selection, viewports)
  in memory (`src/workspace/tabSession.ts`). The engine of a file always reads *its own* document, so a late flush after a tab
  switch can never upload the wrong file.

### Conflict flow (412 on the file document)

`412 VERSION_CONFLICT` means someone saved after `baseVersion`: fetch `GET /files/:id` (`theirs`) and ask (the existing modal):
**Keep mine** (retry `PUT` with their version), **Take theirs**, or **Save as copy** (`POST /projects/:projectId/files` next to
the file, then load theirs). Up to 3 rounds; "Decide later" leaves the file in the *Conflict* state with a Retry button.
`412 IF_MATCH_REQUIRED` is a client bug.

## Tree sync (folders and files)

Create, rename, move (also reorder), delete and duplicate are applied to the **local tree immediately** and, for a server
backed project, appended to the queue `sdd:ws:q:<projectId>`:

| op | request |
|---|---|
| `createFolder` | `POST /projects/:id/folders {id, name, parentId, position}` |
| `createFile` | `POST /projects/:id/files {id, name, kind, folderId, position, data}`: `data` is the local document **at send time**, so edits made offline travel with the create; the file then gets sync metadata (`baseVersion` 1) |
| `patchFolder` / `patchFile` | `PATCH /folders/:id` / `PATCH /files/:id {name?, parentId?\|folderId?, position?}` |
| `deleteFolder` / `deleteFile` | `DELETE …` (404 counts as done) |
| `renameProject` | `PATCH /projects/:id {name}` |

Duplicate is expressed as creates (parents before children). The queue is compacted: consecutive patches of one entity merge,
a file created and deleted while offline disappears entirely. Creates carry client ids, so a replay after a lost response is
harmless (200 instead of 201).

`flushTreeQueue` sends the operations in order. A network error / 5xx / 429 stops the run (the queue stays); 401 stops it
(sign in again); any other 4xx (the parent was deleted, a cycle, no permission) drops that operation. Afterwards
`GET /projects/:id/tree` is fetched and **reconciled**: the server tree becomes the local tree, then the operations still in the
queue are replayed on top, so offline work is never undone by a pull. Files that disappeared on the server lose their local copy
(with a notice). Tree operations are **last-writer-wins**: there is no `If-Match`; two people renaming the same file at once end
with whichever request reached the server last.

When to sync: right after a local tree change (250 ms debounce), on sign-in / app start (`syncDown`: mirror new projects, changed
trees, missing or newer documents; dirty documents are never overwritten), on `online`, on WebSocket reconnect, and on
`tree.updated` / `hello` with a higher `treeRev` than `sdd:ws:pmeta:<projectId>.treeRev`.

First upload of a local-only project (`uploadLocalProject`, the "Upload to server" banner / button, and automatically for a
project created while signed in): `POST /projects {id, name, file:{id,…}}`, then folders parents-first, then the other files with
their documents. Nothing is re-keyed.

## Open tabs per user

Tabs, active tab, closed stack (for ⌘⇧T), expanded folders, starred and recent files are stored locally per user and project
and, when signed in, pushed to `PATCH /me/prefs` under the key `ws:<projectId>` (debounced). When a project is opened the
client first fetches `GET /me/prefs` and the **newer** of the local and server state wins (an empty local state always loses),
*before* it chooses a file, and nothing is pushed until that has been decided: a freshly cleared browser can never overwrite
the saved tabs. Closed or deleted files are pruned on load.

## Realtime

Per open file: `ws(s)://host/api/ws/files/:fileId` (share links: `?share=<token>`). Per open project:
`ws(s)://host/api/ws/projects/:projectId`; it stays open while the user moves between files.

* file channel: `hello` (store `clientId`), `presence` (avatars of this file), `file.updated` (`version` > `baseVersion`: if
  clean, silently `GET /files/:id` and replace; if dirty, tell the user the next save will ask which version to keep).
* project channel: `tree.updated` (pull the tree when `rev` is newer), `file.updated` of files nobody here has open (refresh
  names / icons), `presence` with a `fileId` per connection (the explorer shows a dot on files others have open).
* Send `{"type":"ping"}` every ~25 s; reconnect with backoff (1 s … 30 s) and refetch on reconnect. No live cursors / CRDT yet.

## Sharing, members and files

* Share dialog: `POST /projects/:id/shares {role, expiresInSeconds?, fileId?}` (a link to the **open file** or to the **whole
  project**) -> show `<app origin>/s/<token>`. The SPA opens it with `GET /share/:token`: file links open that file, project
  links open the tree and the first file with a file picker; editor links save with `PUT /share/:token/files/:fileId`
  (`If-Match`). No login is needed and a shared file is never added to the browser's own project list.
* Members: `POST /projects/:id/members {email, role}` (404 `USER_NOT_FOUND` when no account). Per-file override:
  `PUT /files/:id/members/:userId {role: viewer|editor}`.
* Export / import: the app builds and reads `.sdd` itself (`src/lib/sdd`: file container, project container, text; `sniffSdd` decides), also offline; the server endpoints
  (`GET /files/:id/export?type=file|text`, `GET /projects/:id/export`, `POST /import`) are for scripts and other clients. `api.importAny`, `api.exportSdd(id, type)`, `api.introspectDb` and `api.introspectSqlite` wrap them.
  Opening a `.sdd` creates a new file in the open project (or a new project when none is open).
* History: `GET /files/:id/versions`, preview with `.../versions/:v`, restore with `POST .../restore`.
* Custom icons: `POST /assets` (multipart `file`), referenced as `asset:<hash>`; the document's `assets` map keeps inline copies
  for `.sdd` export.


## Live collaboration (Phase 3)

Capability: `GET /auth/config` also returns `collab` and `rtc` (kept in `useSession`). With `collab` on, an open file of a server
project (or a share link) uses **Yjs instead of the REST engine**: `useProjectSync` starts `startCollab` (`src/sync/collabRuntime.ts`)
and does **not** start the `SyncEngine`: there is no `If-Match` save, no 412 and **no conflict dialog**. The legacy path (REST +
conflict dialog) remains for servers with `COLLAB_ENABLED=false` and for a document that still has several pages. Local-only mode
(no server) never touches Yjs or the network.

### Data flow

| piece | file | what it does |
|---|---|---|
| shared model | `collab/yproject.ts` | `writeProject(doc, project, origin, cache)` writes a **diff** of the editor document into the Y.Doc (nodes / edges as `Y.Map`s with a nested `data` map, ordered id arrays); `readProject` rebuilds the document. Identical to `server/src/collab/yproject.ts` |
| store binding | `collab/binding.ts` | local store change -> one Y transaction tagged `LOCAL_ORIGIN` (object identity cache: untouched nodes are skipped); any other origin (remote peer, the UndoManager) -> store patch that keeps object identity, selection and drag state, **never written back (no echo)** |
| undo / redo | `collab/binding.ts`, `store/diagramStore.ts` (`setHistoryDriver`) | a `Y.UndoManager` that tracks only `LOCAL_ORIGIN`: **it reverts your own changes, never a collaborator's**, per user and per file. A history step recorded by the store (`pushPast`) starts a new undo step, a drag is one step. `past` / `future` mirror the stack depth so the toolbar buttons keep working. Local files and the legacy path keep the snapshot history |
| provider | `collab/provider.ts` | y-websocket compatible: sync + awareness on `wss://…/api/ws/files/:id/yjs`, exponential-backoff reconnect, `reconnectNow()` on `online`, fatal close codes (4404) stop it, read-only roles never send updates |
| session | `collab/session.ts` | doc + awareness + **y-indexeddb** (`sdd-collab-<fileId>`: offline edits survive a reload) + provider + binding. Opening order: IndexedDB content is applied at once; the first server sync makes the server doc the truth (an empty server doc is seeded from the editor); nothing cached and no server for `seedTimeoutMs` -> seed from the editor (offline-first). Offline edits merge on reconnect |
| status | `sync/collabRuntime.ts`, `components/sync/SyncIndicator.tsx` | Live / Connecting… / Reconnecting… / Offline (label on hover, icon in the bar) |

The editor store keeps its `pages` shape; the doc holds the (single) page. A file of the server is never seeded by two clients: only the server seeds.

### Presence (awareness)

Each client publishes `{user:{id,name,color}, cursor, selection:{nodes,edges}, viewport:{x,y,w,h} (flow space), status, lastActive, audio:{in,muted,speaking}}`
(the server forces the real `user.id` / `name`). Pure maths in `collab/presenceMath.ts`: `smoothCursor` (frame-rate independent exponential
smoothing, tau 70 ms), `followTransform` / `reduceFollow` (follow mode), `presenceStatus` (active < 60 s, idle < 5 min, away; a hidden tab is away),
`collaborators` (one entry per person, the busiest tab). UI: `PresenceLayer` (cursors with name labels, a coloured outline + name tag around what they selected),
`PresencePublisher` (my cursor / viewport / activity), `MinimapPeers` (their viewports over the minimap; turn the minimap on in View ▾),
`CollabAvatars` (avatars in the top bar: click = **follow** their view, click again or **Esc** = stop; your own pan / zoom also stops it; idle / away are dimmed, speaking people get a ring)
and the Collaborators popover (everyone, role, status, audio). The file list keeps the project-level presence dots.

Board facilitation (ROADMAP Phase 4) adds four optional keys to the same state: `presenting: {frameId, index, rect, seq}` (I am presenting this frame; followers move to `rect`),
`summon: {seq, rect}` ("bring everyone to me": a newer `seq` than the last one handled, not older than 10 s, moves the viewer to `rect`), `laser: true` (my cursor is a laser pointer, drawn red)
and `reaction: {emoji, seq, at}` (a floating emoji; each `seq` is shown once). The pure logic is `src/lib/board/presence.ts` (`findPresenter`, `reducePresenterFollow` with break-away / rejoin, `detectSummon`, `detectReactions`);
`CollabSession.setPresence(patch)` publishes them and `components/board/PresenterFollow.tsx` / `ReactionLayer.tsx` act on them. They are ephemeral: nothing is written to the document.

### Comments

`src/comments/logic.ts` (pure: mention token `@[Name](user:id)`, `activeMentionQuery`, `insertMention`, `mentionCandidates`, `applyCommentEvent`, `filterThreads`, `anchorPoint`),
`store.ts` (threads, unread, panel, draft; `useNotificationsStore`). Press **C** (or the dock button) then click the canvas (or a node: the pin
follows the node) to start a thread; the panel filters Open / Resolved / Mine / Mentions / All; replies, resolve / reopen (commenters and up), delete your own.
WebSocket pushes (`comment.*`) update the list live and bump the unread badge; a mention or reply arrives as a `notification` and is listed in the **user menu**
(click = open that file and thread). Viewers can read comments but not write them.

### Audio rooms

`rtc/provider.ts` defines `RtcProvider` (`mesh` shipped; an SFU such as LiveKit plugs in through `createRtcProvider`), `rtc/mesh.ts` is the peer manager
(joiner offers, queued ICE, ICE restart from the initiator after 4 s `disconnected` or on `failed`, max 3 restarts, rebuild after a signaling reconnect, track replacement for the device picker),
`rtc/speaking.ts` the WebAudio level meter with hysteresis, `rtc/runtime.ts` the controller (ICE config from `GET /rtc/config`, `getUserMedia`, mute, push-to-talk, devices, leave on `pagehide`).
UI: **Join audio** in the top bar (shows how many are in the room), then mute, settings (push-to-talk, microphone, speakers) and Leave; remote voices play through hidden `<audio>` elements.
**Push-to-talk: hold `M`** (not Space, which pans; not V, which is the select tool). It is ignored while typing, with modifiers, and when the window loses focus the mic closes.

### Version history

"Save version…" (`api.saveNamedVersion`), the list marks named versions (★, never pruned), **Compare** (a version with the current state, or any two) uses `diffProjects`
(added / removed / changed nodes and edges by id, what changed: moved, resized, renamed, restyled, rerouted…). "Show on canvas" draws the result as an overlay (green added,
red dashed removed, amber changed; legend + Esc to exit) next to the list. Restore stays a new version; on a live file the server pushes it into the doc.

### Choice dialogs

`useChoice` dialogs (`lib/dialogs.ts`, `components/ui/DialogHost.tsx`) show the message, then selectable option rows (icon, title, one-line description), then a footer outside the scrolling area:
a ghost cancel on the left, the primary action on the right. The "This file changed on the server" dialog (legacy path only) names who changed it (avatar + relative time) and can show the differences.
A file the same user saved in another tab reloads silently when this tab has no unsaved changes.

### Client storage additions

`sdd:ws:flat` (flat-files migration marker), IndexedDB `sdd-collab-<fileId>` (the Yjs doc), `sdd:layout` (`sidebarOpen` = palette expanded, `inspectorOpen` = inspector pinned; both default to collapsed), `sdd:files-sort`.

## Project library (Phase 5)

`api.getLibrary(projectId)` returns `{ rev, doc }` and `api.putLibrary(projectId, baseRev, doc)` replaces the document (a stale `baseRev` is a 409 with the current document). The document (`src/lib/library/types.ts`, mirrored by `server/src/schema/library.ts`) holds `components`, `styles` (`colors`, `texts`, `effects`) and `tokens`. On the client it lives in `useLibraryDoc` (`src/lib/library/store.ts`, persisted per project in `localStorage` as `sdd:lib:<projectId>`); `LibrarySync` (`src/sync/libraryRuntime.ts`) pulls on open, on the `library.updated` message of the project WebSocket and after reconnecting, pushes edits debounced, and on a 409 merges per id (`mergeLibrary`: a side that changed an entry wins over one that did not, a conflict keeps my change but never a lower component revision). Offline, edits stay local and dirty until the next push.
