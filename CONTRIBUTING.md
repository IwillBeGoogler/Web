# Contributing to IWillBeGoogler web

Thanks for helping. General rules (branching, Conventional Commits, review) live in the
[org guide](https://github.com/IWillBeGoogler/.github/blob/main/CONTRIBUTING.md). This file covers this repo.

## Setup

Requirements: [bun](https://bun.sh) (latest), Docker for the backend.

```sh
git clone https://github.com/IWillBeGoogler/iwillbegoogler-monolith-go && cd iwillbegoogler-monolith-go
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

## Licence and your contributions

This project is **All Rights Reserved** (see [LICENSE](LICENSE)); it is not open source. By opening a pull request you confirm that:

1. you wrote the change yourself, or have the right to submit it, and it contains no code copied from elsewhere without a compatible licence;
2. you assign to IWillBeGoogler, or grant it a perpetual, worldwide, irrevocable, royalty-free, sublicensable licence to use, modify
   and distribute, all rights in your contribution, and you keep no claim against its use;
3. you sign off each commit (`git commit -s`, Developer Certificate of Origin 1.1: https://developercertificate.org).

Pull requests without a sign-off are not merged. Report vulnerabilities as described in [SECURITY.md](SECURITY.md) and follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
