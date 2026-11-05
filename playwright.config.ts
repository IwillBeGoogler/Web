import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the running compose stack (root `docker compose up -d --build`): web on :3000 proxies /api and /mqtt.
 * Override with E2E_BASE_URL. Set E2E_CHANNEL="" to use Playwright's own Chromium instead of the local Chrome.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const channel = (process.env.E2E_CHANNEL ?? "chrome") || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) } },
    { name: "mobile", testIgnore: /diagrams\.spec/, use: { ...devices["Pixel 7"] } },
    {
      name: "reduced-motion",
      testIgnore: /diagrams\.spec/,
      use: { ...devices["Desktop Chrome"], contextOptions: { reducedMotion: "reduce" } },
      grep: /landing|anonymous reader/,
    },
  ],
});
