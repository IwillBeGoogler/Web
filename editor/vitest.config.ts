import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// The embedded diagram editor's own unit tests (moved from the standalone Client app). Run from Web/: `bun run test:editor`.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here("."),
  plugins: [react()],
  resolve: { alias: { "@core": here("./core") }, dedupe: ["react", "react-dom"] },
  test: {
    environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], css: false, include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // zz_probe.cov.test.tsx is a leftover scratch probe that writes to a local path; delete it (git rm) and drop this line
    exclude: [...configDefaults.exclude, "src/**/zz_probe*"],
    // CI runners are slower than a laptop: the heavy tests (virtualized palette, zip-bomb) need more than the default 5 s
    testTimeout: 30_000, hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "core/**/*.ts"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/*.d.ts", "**/*.generated.*", "src/test/**", "src/main.tsx", "src/assets/**", "src/landing/threeScene.ts", "src/landing/HeroScene.tsx"],
      // floor of current coverage; target is 95 everywhere, raise as branches improve
      // shards (CI) only collect: the floor is applied once on the merged report
      thresholds: process.env.VITEST_SHARD ? undefined : { statements: 96, branches: 93, functions: 95, lines: 96 },
      reporter: ["text-summary", "json-summary", "text"],
    },
  },
});
