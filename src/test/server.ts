import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

/** Shared MSW server; tests add handlers with server.use(...). Defaults: the site glossary is empty, no synced prefs. */
export const server = setupServer(
  http.get("*/api/glossary", () => HttpResponse.json({ data: [] })),
  // settingsSync reads this for any signed-in reader
  http.get("*/api/diagrams/me/prefs", () => HttpResponse.json({ data: {} })),
);
export const api = (path: string) => `*/api${path}`;
