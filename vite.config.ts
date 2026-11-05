import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { devProxy } from "./vite/devProxy.ts";
import { FRAME_CSP } from "./vite/frameCsp.ts";
import { scopeDiagramCss } from "./vite/scopeDiagramCss.ts";

// The diagram editor lives in ./editor and is consumed from source through aliases (see DIAGRAMS.md).
const client = fileURLToPath(new URL("./editor", import.meta.url));
export const diagramAliases = {
  "@diagram-editor": `${client}/src/embed.tsx`,
  // starting documents (one table / one class) built with the editor's template pipelines; a small chunk, not the editor
  "@diagram-starter": `${client}/src/embed/starter.ts`,
  // pure TypeScript core of the editor (parsers, lint, layout ...)
  "@core": `${client}/core`,
};

// /html-frame.html carries its own sandbox CSP in production (nginx.conf, Caddyfile); give it the same in dev and preview
const frameHeaders = (): Plugin => {
  const use = (server: {
    middlewares: { use: (f: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void };
  }) => {
    // no return value: Vite would call a returned function as a post hook
    server.middlewares.use((req, res, next) => {
      if (req.url?.split("?")[0] === "/html-frame.html") {
        res.setHeader("Content-Security-Policy", FRAME_CSP);
        res.setHeader("X-Content-Type-Options", "nosniff");
      }
      next();
    });
  };
  return { name: "html-frame-headers", configureServer: use, configurePreviewServer: use };
};

export default defineConfig({
  plugins: [scopeDiagramCss(`${client}/src`), frameHeaders(), react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), ...diagramAliases },
    // one React for the blog and the editor
    dedupe: ["react", "react-dom"],
  },
  server: { port: 5173, proxy: devProxy, fs: { allow: ["."] } },
  preview: { port: 5173, proxy: devProxy },
  build: {
    target: "es2023",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/react") || id.includes("scheduler")) return "react";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("radix-ui") || id.includes("@radix-ui")) return "radix";
          return undefined;
        },
      },
    },
  },
});
