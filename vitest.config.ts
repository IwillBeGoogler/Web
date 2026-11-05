import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { diagramAliases } from "./vite.config.ts";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), ...diagramAliases }, dedupe: ["react", "react-dom"] },
  test: { globals: true, environment: "jsdom", setupFiles: ["./src/test/setup.ts"], include: ["src/**/*.test.{ts,tsx}", "vite/**/*.test.ts"], css: false },
});
