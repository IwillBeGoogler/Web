import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { diagramAliases } from "./vite.config.ts";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), ...diagramAliases }, dedupe: ["react", "react-dom"] },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "vite/**/*.test.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "vite/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "**/*.generated.*",
        "src/test/**",
        "src/main.tsx",
        // WebGL/canvas decorative scenes: need a real GPU context, covered by e2e
        "src/shared/ui/galaxy.tsx",
        "src/shared/ui/EarthHorizon.tsx",
        "src/shared/ui/satellite/satelliteModel.ts",
        "src/app/pages/landing/HeroScene.tsx",
        "legacy-js/**",
        "type-tests/**",
        "vite/**/*.test.ts",
      ],
      reporter: ["text-summary", "json-summary", "text"],
      // shards (CI) only collect: the 95% floor is applied once on the merged report
      thresholds: process.env.VITEST_SHARD ? undefined : { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
