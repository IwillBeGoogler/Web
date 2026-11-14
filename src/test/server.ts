import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

/** Shared MSW server; tests add handlers with server.use(...). Default: the site glossary is empty. */
export const server = setupServer(http.get("*/api/glossary", () => HttpResponse.json({ data: [] })));
export const api = (path: string) => `*/api${path}`;
