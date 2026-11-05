# Plugins (sandboxed)

Plugins extend the editor with small scripts. They run in a sandboxed iframe and can only talk to the editor through a typed, permissioned message API. Everything a plugin changes goes through the same undo history as your own edits (one undo step per call).

## Security model

- The iframe has `sandbox="allow-scripts"` and **no** `allow-same-origin`: the plugin has an opaque origin, so no cookies, no `localStorage`, no tokens and no access to the app's DOM.
- Its document carries a strict CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`. It cannot load anything or make a network request. An `entry` script is fetched **once at install time** and stored as inline code.
- The host only accepts messages whose `event.source` is that iframe, parses every message with zod, checks the permission, caps sizes (500 nodes per call, 2000 characters per text, 100 calls per second) and writes only whitelisted node fields (label, subtitle, fill, stroke, textColor, iconId, fontSize, bold, position, size). Plugins cannot set `parentId`, `locked`, `link`, `instance` or ids.
- Plugins are stored in the browser (`localStorage`, key `sdd:plugins`); nothing is sent to a server.

## Manifest

```json
{ "name": "Rename selection", "version": "1.0.0", "description": "...", "permissions": ["selection:read", "nodes:write", "notify"], "code": "async function run(args) { ... }" }
```

Give exactly one of `code` (inline) or `entry` (an `https://` URL of a script). Permissions: `selection:read`, `nodes:read`, `nodes:write`, `ui:panel`, `notify`.

Install from Settings > Plugins: a manifest URL (https), a local `.json` file, or one of the three samples (**Rename selection**, **Generate grid of icons**, **Export as Markdown table**). Enable or disable each plugin there; run enabled plugins from View > Plugins… or ⌘K "Plugins…".

## API (inside the sandbox, `window.sdd`)

Define `async function run(args)`; the host calls it once the iframe is ready. Its return value, when a string, is shown in the Plugins popover with a Copy button.

| Method | Permission | Notes |
| --- | --- | --- |
| `sdd.getSelection()` | `selection:read` | selected nodes `{ id, type, position, width, height, parentId, data }` |
| `sdd.getNodes()` | `nodes:read` | every non-hidden node |
| `sdd.createNodes({ nodes: [{ type, x, y, width?, height?, data? }] })` | `nodes:write` | `type` is `icon`, `text`, `shape`, `card` or `sticky`; returns the new ids |
| `sdd.updateNodes({ updates: [{ id, x?, y?, data? }] })` | `nodes:write` | unknown ids are ignored |
| `sdd.showPanel({ title?, height? })` | `ui:panel` | makes the plugin's iframe visible in the popover (40 to 600 px) |
| `sdd.notify({ message, kind? })` | `notify` | a toast; `kind` is `info`, `success` or `error` |

Errors reject the promise with `error.code`: `permission_denied`, `invalid_params`, `unknown_method`, `rate_limited` or `failed`.

## Wire protocol

Request (plugin to host): `{ sdd: 1, id, method, params }`. Reply (host to plugin): `{ sdd: 1, id, ok: true, result }` or `{ sdd: 1, id, ok: false, error: { code, message } }`. Lifecycle events: `{ sdd: 1, event: 'ready' }` (plugin to host), `{ sdd: 1, event: 'run', args }` (host to plugin), `{ sdd: 1, event: 'result', ok, value | error }` (plugin to host).

Code: `src/lib/plugins/` (`manifest.ts`, `host.ts`, `sandbox.ts`, `samples.ts`, `store.ts`) and `src/components/design/PluginPanel.tsx`.

The server side (personal access tokens, the public REST API and webhooks) is documented in `docs/backend.md`.
