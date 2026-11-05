# Contributing to iBlog web

Thanks for helping. General rules (branching, Conventional Commits, review) live in the
[org guide](https://github.com/iBlog/.github/blob/main/CONTRIBUTING.md). This file covers this repo.

## Setup

Requirements: [bun](https://bun.sh) (latest), Docker for the backend.

```sh
git clone https://github.com/iBlog/iblog-monolith-go && cd iblog-monolith-go
docker compose up -d          # API on :8080

# in this repo
bun install
bun run dev
```

## Before you open a PR

```sh
bun run lint        # Biome
bun run typecheck
bun run test        # Vitest + MSW
bun run build
```

CI runs the same commands. Playwright e2e (`bun run e2e`) needs the backend running; run it when you touch flows.

## Code layout

DDD by context under `src/`: `domain` (pure logic, no React), `application` (hooks/use cases),
`infrastructure` (HTTP), `ui` (components). Keep business rules out of components and add tests next to the code (`*.test.ts(x)`).

## Good first issues

Look for the [`good first issue`](../../issues?q=is%3Aopen+label%3A%22good+first+issue%22) label. Comment on the issue before starting so nobody duplicates work.
