# Self-hosting

One container, one port: the Fastify backend serves the built frontend, the API (`/api`), the WebSocket and the health checks.
Everything is configured through environment variables (the complete list is in [backend.md](backend.md)); this page covers
running it, the Helm chart, S3 storage and single sign-on.

- [Quick start](#quick-start-docker-compose)
- [The image](#the-image)
- [Kubernetes (Helm)](#kubernetes-helm)
- [Object storage (S3)](#object-storage-s3)
- [Single sign-on: OpenID Connect](#single-sign-on-openid-connect)
- [Single sign-on: SAML 2.0](#single-sign-on-saml-20)
- [Reverse proxy and TLS](#reverse-proxy-and-tls)
- [Backups and upgrades](#backups-and-upgrades)
- [Limits](#limits)

## Quick start (Docker Compose)

```sh
cp .env.example .env            # set SESSION_SECRET (32+ characters): openssl rand -hex 32
docker compose up --build       # http://localhost:3001  (the first account to sign up is the administrator)
docker compose --profile postgres up --build   # with PostgreSQL (set DATABASE_URL, see .env.example)
```

SQLite and local files live in the `sdd-data` volume (`/data`). Compose passes the S3 and SSO variables below through to
the container, so enabling them is a matter of editing `.env`.

## The image

`Dockerfile.server` is a multi-stage build (repository root as the build context):

1. `web`: `npm ci && npm run build` produces the frontend.
2. `server-build`: compiles the backend (native modules `argon2` and `better-sqlite3` are built here) and prunes dev dependencies.
3. runtime: `node:20-bookworm-slim`, only the compiled backend, its production `node_modules`, the SQL migrations and the
   built frontend (`/app/public`, served through `STATIC_DIR`).

```sh
docker build -f Dockerfile.server -t sdd .
docker run -p 3001:3001 -v sdd-data:/data -e SESSION_SECRET=$(openssl rand -hex 32) -e COOKIE_SECURE=false sdd
```

- Runs as the unprivileged `node` user (uid 1000); `/data` is the only writable path.
- One port (`3001`, `PORT` to change it): frontend, `/api`, `/api/docs` (OpenAPI), WebSocket.
- `HEALTHCHECK` calls `GET /healthz` (liveness). `GET /readyz` additionally pings the database (use it for readiness probes).
- `COOKIE_SECURE` defaults to `true` in production: serve over HTTPS or set it to `false` for plain-http trials.
- Migrations run on start.

## Kubernetes (Helm)

The chart is in `deploy/helm/sdd`: Deployment, Service, optional Ingress, a PersistentVolumeClaim for SQLite and local
files (or a `DATABASE_URL` secret and S3), probes (`/healthz` startup + liveness, `/readyz` readiness), a Secret for the
credentials, a restricted pod security context (non-root, no privilege escalation, read-only root filesystem, all
capabilities dropped).

```sh
docker build -f Dockerfile.server -t registry.example.com/sdd:0.1.0 . && docker push registry.example.com/sdd:0.1.0

helm install sdd deploy/helm/sdd \
  --set image.repository=registry.example.com/sdd --set image.tag=0.1.0 \
  --set secrets.sessionSecret=$(openssl rand -hex 32) \
  --set config.publicUrl=https://sdd.example.com \
  --set ingress.enabled=true --set ingress.className=nginx \
  --set 'ingress.hosts[0].host=sdd.example.com' --set 'ingress.hosts[0].paths[0].path=/' --set 'ingress.hosts[0].paths[0].pathType=Prefix'
```

Every value is documented in `deploy/helm/sdd/values.yaml`. The ones you will touch:

| value | meaning |
|---|---|
| `secrets.sessionSecret` / `existingSecret` | the session secret (required). With `existingSecret`, the Secret needs the keys `SESSION_SECRET` and, if used, `DATABASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `OIDC_CLIENT_SECRET` |
| `secrets.databaseUrl` | `postgres://...`; empty keeps SQLite on the volume |
| `persistence.*` | the `/data` volume (`enabled: false` for PostgreSQL + S3 setups) |
| `storage.s3.*` | bucket / endpoint / region; setting `bucket` switches storage to S3 |
| `oidc.*` | single sign-on ([below](#single-sign-on-openid-connect)) |
| `config.publicUrl` | public base URL (needed for SSO redirects) |
| `config.trustProxy`, `config.cookieSecure` | `true` behind an ingress with TLS (the defaults) |
| `config.extraEnv` | any other variable from [backend.md](backend.md), e.g. `ICE_SERVERS` for audio rooms |

Notes:

- **Keep `replicaCount: 1`.** Live co-editing and audio rooms live in the memory of one process, and SQLite is a single-writer
  file on a ReadWriteOnce volume. The Deployment uses the `Recreate` strategy for the same reason.
- `helm lint deploy/helm/sdd` and `helm template` were not run in this repository's CI (no Helm there); the chart is covered by a
  static test (`server/tests/helmChart.test.ts`: valid YAML, balanced template blocks, every `.Values.*` reference exists,
  security and probe settings). Run `helm lint` yourself before the first install.
- SAML is configured through `config.extraEnv` (the chart has no first-class values for it); see the SAML section.

## Object storage (S3)

Images and file thumbnails are content-addressed blobs behind a small storage interface (`server/src/storage`): local disk by
default (`$DATA_DIR/storage`), any S3-compatible service (AWS S3, MinIO, Cloudflare R2, Ceph) as soon as `S3_BUCKET` is set.

| variable | default | |
|---|---|---|
| `S3_BUCKET` | - | setting it selects S3 (`STORAGE_DRIVER=local` forces the disk back) |
| `S3_ENDPOINT` | AWS | e.g. `http://minio:9000` |
| `S3_REGION` | `us-east-1` | |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | AWS default credential chain | static keys; leave empty to use IAM roles / IRSA |
| `S3_FORCE_PATH_STYLE` | `true` | `false` for AWS virtual-hosted style |

Objects are stored as `assets/<sha256>` with `Cache-Control: public, max-age=31536000, immutable`. The bucket must be private: the
server checks access and streams the bytes. Needed permissions: `s3:PutObject`, `s3:GetObject`, `s3:HeadObject` on `assets/*`.
Project documents stay in the database, not in S3. Existing local files are not migrated automatically (copy
`$DATA_DIR/storage/*` to `assets/` in the bucket if you switch an existing installation).

## Single sign-on: OpenID Connect

Authorization-code flow with PKCE (S256), `state` and `nonce`. Endpoints come from the provider's discovery document
(`<issuer>/.well-known/openid-configuration`); the ID token's signature, issuer, audience, expiry and nonce are verified by
[`openid-client`](https://github.com/panva/node-openid-client). Works with Keycloak, Okta, Auth0, Microsoft Entra ID, Google,
Authentik, Dex and anything else that speaks OIDC.

```sh
PUBLIC_URL=https://sdd.example.com
OIDC_ISSUER=https://login.example.com/realms/main
OIDC_CLIENT_ID=sdd
OIDC_CLIENT_SECRET=...            # optional: empty = public client (PKCE only)
OIDC_AUTO_PROVISION=false         # true: create an account for an unknown e-mail
OIDC_ALLOWED_DOMAINS=example.com  # optional allow-list
OIDC_LABEL="Acme SSO"             # button text: "Continue with Acme SSO"
```

At the provider, register the redirect URI **`<PUBLIC_URL>/api/auth/oidc/callback`** (`API_PREFIX` applies) and allow the scopes
`openid email profile`.

How accounts are mapped:

- By **e-mail address** (case-insensitive). An existing account with that e-mail is signed in; there is no separate link table.
- An address the provider marks `email_verified: false` is refused (otherwise anyone who can register an unverified address at the
  provider could take over a local account). Providers that do not send the claim are accepted.
- Unknown e-mail: refused (`no_account`) unless `OIDC_AUTO_PROVISION=true`, which creates the account without a password (the
  first account of a server becomes its administrator, as with sign-up). `OIDC_ALLOWED_DOMAINS` restricts both cases.
- The login page shows a "Continue with ..." button when SSO is configured and explains refusals (`/login?sso_error=...`).
  Password login keeps working; to make SSO the only way in, also set `ALLOW_SIGNUP=false` and do not give users passwords
  (auto-provisioned accounts have none).
- Sign-out ends the local session only (no RP-initiated logout at the provider).

Local development against an `http://` provider needs `OIDC_ALLOW_INSECURE=true`; the issuer must be `https://` otherwise.

## Single sign-on: SAML 2.0

Service-provider-initiated sign-in with [`@node-saml/node-saml`](https://github.com/node-saml/node-saml): the browser is sent to
the IdP with an AuthnRequest (HTTP-Redirect binding) and returns with a signed Response (HTTP-POST binding).

```sh
PUBLIC_URL=https://sdd.example.com
SAML_ENTRY_POINT=https://idp.example.com/app/sdd/sso/saml    # the IdP's SSO URL
SAML_IDP_CERT="-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----"   # the IdP's signing certificate (\n allowed)
SAML_ISSUER=                      # our entity id; default <PUBLIC_URL>/api/auth/saml/metadata
SAML_IDP_ISSUER=                  # optional: reject responses from another entity id
SAML_EMAIL_ATTRIBUTE=mail         # optional; default: NameID if it is an e-mail, else attributes email / mail / emailAddress
SAML_AUTO_PROVISION=false
SAML_ALLOWED_DOMAINS=example.com
SAML_REQUIRE_SIGNED_RESPONSE=false  # true: the whole Response must be signed (a signed assertion alone is accepted otherwise)
SAML_LABEL="Okta"
```

Give the IdP admin the metadata at **`<PUBLIC_URL>/api/auth/saml/metadata`** (entity id and ACS URL
`<PUBLIC_URL>/api/auth/saml/acs`, `NameID` format e-mail address).

Checks: signature against the configured certificate (the assertion, or the Response, must be signed; a response signed nowhere is
refused), audience, destination, validity window with 60 s clock skew, `InResponseTo` (only answers to requests this server
made, each used once), assertion replay, top-level status. E-mail mapping, auto-provisioning, domain allow-list and the redirect
rules are the same as for OIDC.

Not supported: IdP-initiated sign-in (unsolicited responses are refused on purpose), encrypted assertions, single logout,
signed AuthnRequests, certificate rotation with several certificates (replace `SAML_IDP_CERT` and restart). The pending-request
cache is in memory, which matches the single-process deployment.

## Reverse proxy and TLS

Terminate TLS in front (Traefik, nginx, Caddy, an ingress) and forward to port 3001, including WebSocket upgrades on `/api/ws/*`
(live co-editing, comments, presence, audio-room signalling). Set `TRUST_PROXY=true` so client IPs (rate limits) and the
scheme are taken from the proxy, keep `COOKIE_SECURE=true`, and set `PUBLIC_URL` for SSO. nginx needs
`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` on the API location and a long
`proxy_read_timeout` for the sockets.

## Backups and upgrades

- SQLite: copy `sdd.db` while the container runs with `sqlite3 sdd.db ".backup backup.db"` (or stop the container), plus
  `storage/` when using local files. PostgreSQL: `pg_dump`. S3 objects are immutable and content-addressed; use bucket versioning
  or replication.
- Upgrade: build / pull the new image and restart; migrations run on start. Back up first. Downgrades are not supported.
- Every project can also be exported as `.sdd` from the editor, independent of the server.

## Limits

- **One process.** Live co-editing, presence and audio-room signalling are in memory; run one replica (also with PostgreSQL).
- The PostgreSQL path is only checked to stay in step with the SQLite migrations in CI.
- No Helm or Kubernetes available in this repository's test environment: the chart is statically tested, not installed.
- The container image has not been built or smoke-tested yet (Docker was unavailable on the dev machine); run `docker build -f Dockerfile.server .` and check `/healthz` before relying on it.
- SSO keeps accounts keyed by e-mail: a provider that lets users change their e-mail address to one they do not own (without
  verification) defeats the mapping; keep `email_verified` meaningful and use `*_ALLOWED_DOMAINS`.
