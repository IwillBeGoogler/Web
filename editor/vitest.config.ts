import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The embedded diagram editor's own unit tests (moved from the standalone Client app). Run from Web/: `bun run test:editor`.
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here("."),
  plugins: [react()],
  resolve: { alias: { "@core": here("./core") }, dedupe: ["react", "react-dom"] },
  test: {
    environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], css: false, include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "core/**/*.ts"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/*.d.ts", "**/*.generated.*", "src/test/**", "src/main.tsx", "src/assets/**", "src/landing/threeScene.ts", "src/landing/HeroScene.tsx"],
      reporter: ["text-summary", "json-summary", "text"],
    },
  },
});
