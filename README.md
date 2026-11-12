# IWillBeGoogler — client (React)

React 19 + TypeScript 7 + Vite 8, TanStack Router/Query, Tailwind 4 (+ typography), Radix, Zod 4, RHF. Talks to the Go monolith (`/api` → `:8080`).

```sh
bun install
bun run dev        # http://localhost:5173 (proxies /api to :8080)
bun run test       # Vitest + RTL + MSW
bun run e2e        # Playwright against the real API (admin/admin12345)
bun run build      # vite build + tsc
```

Layout (DDD, `src/contexts/<ctx>/{domain,infrastructure,application,ui}`):
identity (auth) · account (password reset, email verify, 2FA, devices, blocks/mutes/hidden, followed topics, delete) · reading (feeds, story, profile, topics) · engagement (claps, bookmarks, follows, responses + likes/edit, reports, notifications, SSE live updates) · collections (lists, series, highlights, publications) · publishing (editor, scheduling, revisions, import, stats, pin) · preferences (reading settings: 17 palettes, 19 typefaces, size, margin, bold, bionic, focus, full screen). Pages and routing in `src/app`. Design spec: `DESIGN.md`.

Routes: `/` (landing for visitors, feed for readers), `/@user`, `/@user/slug`, `/p/slug`, `/tag/x`, `/search?q=`, `/lists/slug`, `/series/slug`, `/pub/slug`, `/new-story`, `/p/:id/edit`, `/me/{library,stories,notifications,stats,publications,settings}`, `/forgot-password`, `/reset-password?token=`, `/verify-email?code=`, `/unsubscribe?s=&a=&sig=`.

Production: nginx serves the SPA with CSP and security headers, gzip, immutable hashed assets, no-cache HTML, unbuffered SSE proxy and `/healthz`; the image has a Docker HEALTHCHECK.

Brand: **IWillBeGoogler**. Motion: `motion` (Framer Motion) primitives in `src/shared/motion` (Reveal, Stagger, Magnetic, Tilt, CountUp, RotatingWord, ReadingProgress), View Transitions between routes, CSS keyframes for dialogs/menus/shimmer; everything respects `prefers-reduced-motion` (e2e project `reduced-motion`).

## CI/CD

`.github/workflows/ci.yml`: lint, typecheck, test, build (bun pinned). `cd.yml` on push to `main`: runs CI, builds the image, Trivy scan (fails on fixable HIGH/CRITICAL), pushes `docker.io/bakhod1r/iwillbegoogler-web:<short sha>` (no `latest`), then dispatches `deploy` to `IwillBeGoogler/Infra`. Docker Hub and dispatch credentials come from Vault via GitHub OIDC (role `iwillbegoogler-production-ci-images`); needs repo variable `VAULT_ADDR` and environment `production`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Copyright © IWillBeGoogler. All rights reserved ([LICENSE](LICENSE)); the source is public to read, not to reuse.
